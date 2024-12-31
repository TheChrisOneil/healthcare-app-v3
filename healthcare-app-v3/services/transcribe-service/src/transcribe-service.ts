import express, { Request, Response } from "express";
import os from "os";
import { connect, NatsConnection, Msg, StringCodec } from "nats";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import * as fs from "fs";
import * as stream from "stream";
import * as dotenv from "dotenv";
import logger from "./logger";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: ".env" });

// Interfaces for message types
interface ControlMessage {
  sessionId: string;
  command: "start" | "pause" | "resume" | "stop";
  timestamp: string;
}

interface AudioChunkMessage {
  sessionId: string;
  sequence: number;
  chunk: string; // Base64-encoded chunk
}

interface TranscribedWordMessage {
  sessionId: string;
  word: string;
  sequence: number;
  timestamp: string;
}

logger.info("Environment Variables Loaded", {
  NATS_SERVER: process.env.NATS_SERVER,
  AWS_REGION: process.env.AWS_REGION,
  LOG_LEVEL: process.env.LOG_LEVEL,
  AUDIO_FILE_PATH: process.env.AUDIO_FILE_PATH,
  TRANSCRIBE_FILE_PATH: process.env.TRANSCRIBE_FILE_PATH,
});

// Set up Express app for the /status endpoint
const app = express();
const port = 3002;

app.get("/status", (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  res.status(200).json({
    service: {
      name: "transcribe-service",
      version: "1.0.0",
      status: "UP",
      uptime,
    },
    system: {
      loadAverage: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      memoryUsage: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
    },
  });
});

// Start the Express server
app.listen(port, () => {
  logger.info(`Transcribe service status endpoint running on port ${port}`);
});

class TranscribeService {
  private nc: NatsConnection | undefined;
  private transcribeClient: TranscribeStreamingClient;
  private transcriptionActive = false;
  private sessionId: string | null = null;
  private audioStream: fs.WriteStream | null = null;
  private transcribedText: fs.WriteStream | null = null;
  private audioFilePath: string = process.env.AUDIO_FILE_PATH || "/tmp";
  private textFilePath: string = process.env.TRANSCRIBE_FILE_PATH || "/tmp";


  constructor() {
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
    logger.info("Transcribe client initialized.");
    this.init();
  }

  private async init() {
    try {
      this.nc = await this.initNATS();
      logger.info("Successfully initialized NATS connection.");
      this.subscribeToCommands();
      this.subscribeToAudioStream();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async initNATS(): Promise<NatsConnection> {
    let retries = 5;
    while (retries > 0) {
      try {
        const nc = await connect({ servers: process.env.NATS_SERVER || "nats://nats-server:4222" });
        logger.info("Connected to NATS.");
        return nc;
      } catch (error) {
        logger.warn(`Failed to connect to NATS. Retries left: ${retries - 1}`, error);
        retries--;
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
    throw new Error("Unable to connect to NATS after multiple attempts.");
  }

  private subscribeToCommands() {
    if (!this.nc) {
      logger.error("NATS connection not established.");
      return;
    }

    const sc = StringCodec();
    const queueGroup = "transcribe-workers";

    this.nc.subscribe("command.transcribe.*", {
      queue: queueGroup,
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          logger.error("Error receiving control message:", err);
          return;
        }
    
        try {
          const subjectParts = msg.subject.split("."); // Extract parts of the subject
          const command = subjectParts[subjectParts.length - 1]; // The last part is the command (e.g., start, pause, resume, stop)
    
          const controlMessage = JSON.parse(sc.decode(msg.data)) as ControlMessage;
          const { sessionId } = controlMessage;
    
          if (!sessionId) {
            logger.error("Invalid control message format: Missing sessionId", controlMessage);
            return;
          }
    
          switch (command) {
            case "start":
              this.startTranscription(sessionId);
              break;
            case "pause":
              this.pauseTranscription();
              break;
            case "resume":
              this.resumeTranscription();
              break;
            case "stop":
              this.stopTranscription();
              break;
            default:
              logger.warn(`Unknown command received in subject: ${command}`);
          }
        } catch (parseError) {
          logger.error("Failed to process control message:", parseError);
        }
      },
    });

    logger.info("Subscribed to command.transcribe.*");
  }

  private subscribeToAudioStream() {
    if (!this.nc) {
      logger.error("NATS connection not established.");
      return;
    }

    const sc = StringCodec();
    const queueGroup = "transcribe-audio-workers";

    this.nc.subscribe("audio.stream.transcribe", {
      queue: queueGroup,
      callback: async (_err: Error | null, msg: Msg) => {
        if (_err) {
          logger.error("Error receiving audio stream message:", _err);
          return;
        }

        try {
          const data = JSON.parse(sc.decode(msg.data)) as AudioChunkMessage;

          if (!this.transcriptionActive || this.sessionId !== data.sessionId) {
            logger.warn(
              `Received audio chunk for inactive session or mismatched session ID: ${data.sessionId}`
            );
            return;
          }

          const audioBuffer = Buffer.from(data.chunk, "base64");

          // Save audio chunk to local disk
          this.audioStream?.write(audioBuffer);

          // Stream to AWS Transcribe
          await this.streamToAWS(audioBuffer, data.sequence);
        } catch (error) {
          logger.error("Failed to process audio stream message:", error);
        }
      },
    });

    logger.info("Subscribed to audio.stream.transcribe.");
  }

  private startTranscription(sessionId: string) {
    this.sessionId = sessionId;
    this.transcriptionActive = true;
   // Set up file streams for audio and transcription
   this.audioStream = fs.createWriteStream(`${this.audioFilePath}/${sessionId}.pcm`);
   this.transcribedText = fs.createWriteStream(`${this.textFilePath}/${sessionId}.txt`);

   logger.info(`Started transcription session: ${sessionId}`);
  }

  private pauseTranscription() {
    this.transcriptionActive = false;
    logger.info(`Paused transcription session: ${this.sessionId}`);
  }

  private resumeTranscription() {
    this.transcriptionActive = true;
    logger.info(`Resumed transcription session: ${this.sessionId}`);
  }

  private stopTranscription() {
    this.audioStream?.end();
    this.transcribedText?.end();

    logger.info(`Audio and text files closed for session: ${this.sessionId}`);

    // Cleanup resources
    this.transcriptionActive = false;
    this.sessionId = null;

    logger.info("Stopped transcription session.");
  }

  private async streamToAWS(audioBuffer: Buffer, sequence: number) {
    const audioInput = new stream.PassThrough();
    audioInput.end(audioBuffer);

    const audioStreamGenerator = async function* () {
      for await (const chunk of audioInput) {
        yield { AudioEvent: { AudioChunk: chunk } };
      }
    };

    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: "en-US",
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 16000,
        AudioStream: audioStreamGenerator(),
      });

      const response = await this.transcribeClient.send(command);

      for await (const event of response.TranscriptResultStream!) {
        if (!this.transcriptionActive) break;

        if ("TranscriptEvent" in event && event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.IsPartial) continue;

            const transcript = result.Alternatives?.[0]?.Transcript || "";
            logger.debug(`Processed transcript: ${transcript}`);

            const sc = StringCodec();
            const transcribedWordMessage: TranscribedWordMessage = {
              sessionId: this.sessionId!,
              word: transcript,
              sequence,
              timestamp: new Date().toISOString(),
            };

            this.nc?.publish(
              "transcription.word.transcribed",
              sc.encode(JSON.stringify(transcribedWordMessage))
            );

            this.transcribedText?.write(`${transcript}\n`);
          }
        }
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleError = (error: Error) => {
    if (error.name === "ERR_HTTP2_STREAM_CANCEL") {
      logger.error("AWS Transcribe HTTP/2 stream canceled. Retrying...");
      // Implement retry logic or clean up resources as needed

    } else {
      logger.error("Unhandled transcription service error:", error);
    }
    if (this.nc) {
      const sc = StringCodec();
      this.nc.publish(
        "transcription.error",
        sc.encode(
          JSON.stringify({
            sessionId: this.sessionId,
            error: error.message,
          })
        )
      );
    }
  };
}

// Start the Transcribe Service
new TranscribeService();