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
import path from "path";
import logger from "./logger";
import {
  TranscriptionEvent,
  TranscriptResult,
  TranscriptEvent,
  TranscriptResponse,
  TranscriptionError,
  TranscriptionWord,
} from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths
import { log } from "console";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

logger.info("Environment Variables Loaded, if empty you have an issue", {
  NATS_SERVER: process.env.NATS_SERVER,
  AWS_REGION: process.env.AWS_REGION,
  AUDIO_FILE_PATH: process.env.AUDIO_FILE_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

// Set up Express app for the /status endpoint
const app = express();
const port = 3002; // HTTP server port for the service

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
  private audioFilePath: string;
  private filename: string;

  constructor() {
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
    this.filename = "test_audio.pcm";
    this.audioFilePath = process.env.AUDIO_FILE_PATH || "/tmp";
    this.audioFilePath = path.join(this.audioFilePath , this.filename)
    this.init();
  }

  private async init() {
    try {
      this.nc = await this.initNATS();
      logger.info("Successfully initialized NATS connection.");
      logger.info("Subscribing to transcription events.");

      this.subscribeToEvents();
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

  // private subscribeToEvents() {
  //   if (!this.nc) {
  //     logger.error("NATS connection not established.");
  //     return;
  //   }

  //   const sc = StringCodec();

  //   // Subscribe to transcription events
  //   // Channel: transcription.session.started  
  //   this.nc.subscribe("transcription.session.started", {
  //     callback: (err: Error | null, msg: Msg) => {
  //       if (err) {
  //         logger.error("Error receiving transcription started event:", err);
  //         return;
  //       }
  //       const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
  //       this.startTranscription(data.sessionId);
                
  //       // Notify DAG downstream services of start
  //       this.nc?.publish("service.control.aof", sc.encode("start"));
  //     },
  //   });

  //   this.nc.subscribe("transcription.session.stopped", {
  //     callback: (err: Error | null, msg: Msg) => {
  //       if (err) {
  //         logger.error("Error receiving transcription stopped event:", err);
  //         return;
  //       }
  //       const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
  //       this.stopTranscription(data.sessionId);
        
  //       // Notify DAG downstream services of stop
  //       this.nc?.publish("service.control.aof", sc.encode("stop"));
  //     },
  //   });

  //   this.nc.subscribe("transcription.session.paused", {
  //     callback: (err: Error | null, msg: Msg) => {
  //       if (err) {
  //         logger.error("Error receiving transcription paused event:", err);
  //         return;
  //       }
  //       logger.info(`Transcription session paused: ${this.sessionId}`);
  //       this.transcriptionActive = false;
  //       // Logic to save state

                      
  //       // Notify DAG downstream services of start
  //       this.nc?.publish("service.control.aof", sc.encode("pause"));
  //     },
  //   });

  //   this.nc.subscribe("transcription.session.resumed", {
  //     callback: (err: Error | null, msg: Msg) => {
  //       if (err) {
  //         logger.error("Error receiving transcription resumed event:", err);
  //         return;
  //       }

                      
  //       // Notify DAG downstream services of start
  //       this.nc?.publish("service.control.aof", sc.encode("resume"));
  //       logger.info(`Transcription session resumed: ${this.sessionId}`);
  //       this.transcriptionActive = true;
  //       this.streamAudioFile(); // Restart streaming
  //     },
  //   });
  // }

  private subscribeToEvents() {
    if (!this.nc) {
      logger.error("NATS connection not established.");
      return;
    }
  
    const sc = StringCodec();
    const queueGroup = "transcribe-workers"; // Define the queue group name
  
    // Subscription: transcription.session.started
    this.nc.subscribe("command.transcribe.start", {
      queue: queueGroup,
      callback: (_err, msg) => {
        if (_err) {
          logger.error("Error receiving transcription started event:", _err);
          return;
        }
        const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
        this.startTranscription(data.sessionId);

      },
    });
  
    // Subscription: transcription.session.stopped
    this.nc.subscribe("command.transcribe.stop", {
      queue: queueGroup,
      callback: (_err, msg) => {
        if (_err) {
          logger.error("Error receiving transcription stopped event:", _err);
          return;
        }
        const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
        this.stopTranscription(data.sessionId);
  
        // Notify DAG downstream services of stop
        this.nc?.publish("service.control.aof", sc.encode("stop"));
      },
    });
  
    // Subscription: transcription.session.paused
    this.nc.subscribe("command.transcribe.pause", {
      queue: queueGroup,
      callback: (_err, msg) => {
        if (_err) {
          logger.error("Error receiving transcription paused event:", _err);
          return;
        }
        logger.info(`Transcription session paused: ${this.sessionId}`);
        this.transcriptionActive = false;
  
        // Notify DAG downstream services of pause
        this.nc?.publish("service.control.aof", sc.encode("pause"));
      },
    });
  
    // Subscription: transcription.session.resumed
    this.nc.subscribe("transcription.session.resume", {
      queue: queueGroup,
      callback: (_err, msg) => {
        if (_err) {
          logger.error("Error receiving transcription resumed event:", _err);
          return;
        }
        logger.info(`Transcription session resumed: ${this.sessionId}`);
        this.transcriptionActive = true;
        this.streamAudioFile();
  
        // Notify DAG downstream services of resume
        this.nc?.publish("service.control.aof", sc.encode("resume"));
      },
    });
  }

  private startTranscription(sessionId: string) {
    this.sessionId = sessionId;
    this.transcriptionActive = true;
    logger.info(`Transcription session started: ${sessionId}`);
    this.streamAudioFile();
  }

  private stopTranscription(sessionId: string) {
    if (this.sessionId === sessionId) {
      this.transcriptionActive = false;
      logger.info(`Transcription session stopped: ${sessionId}`);
    }
  }

  private async streamAudioFile() {
    if (!this.transcriptionActive) return;

    try {
      if (!fs.existsSync(this.audioFilePath)) {
        throw new Error(`Audio file not found at path: ${this.audioFilePath}`);
      }

      const audioStream = fs.createReadStream(this.audioFilePath, {
        highWaterMark: 1024 * 4,
      });
      const audioInput = new stream.PassThrough({ highWaterMark: 1 * 1024 });
      audioStream.pipe(audioInput);

      const audioStreamGenerator = async function* () {
        for await (const payloadChunk of audioInput) {
          yield { AudioEvent: { AudioChunk: payloadChunk } };
        }
      };

      const command = new StartStreamTranscriptionCommand({
        LanguageCode: "en-US",
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 16000,
        AudioStream: audioStreamGenerator(),
      });

      const response = await this.transcribeClient.send(command);

      for await (const event of response.TranscriptResultStream!) {
        if (!this.transcriptionActive) break;

        // Explicitly check for TranscriptEvent
        if ("TranscriptEvent" in event && event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.IsPartial) continue;

            const transcript = result.Alternatives?.[0]?.Transcript || "";
            logger.debug("Received transcript:", transcript);

            // Publish to NATS
            if (this.nc) {
              const sc = StringCodec();
              this.nc.publish(
                "transcription.word.transcribed",
                sc.encode(
                  JSON.stringify({
                    sessionId: this.sessionId,
                    word: transcript,
                    timestamp: new Date().toISOString(),
                  })
                )
              );
            }
          }
        }
      }

      logger.info("Streaming complete.");
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (this.nc) {
        logger.info("Closing transcription session.");
      }
    }
  }

  private handleError = (error: Error) => {
    console.error("Transcription service encountered an error:", error);
    if (this.nc) {
      const sc = StringCodec();
      this.nc.publish(
        "transcription.error",
        sc.encode(JSON.stringify({ sessionId: this.sessionId, error: error.message }))
      );
    }
  };
}

// Start the Transcribe Service
new TranscribeService();
