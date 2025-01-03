import express, { Request, Response } from "express";
import os from "os";
import { connect, NatsConnection, Msg, StringCodec } from "nats";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
  MediaEncoding,
  TranscriptResultStream
} from "@aws-sdk/client-transcribe-streaming";
import * as fs from "fs";
import * as stream from "stream";
import * as dotenv from "dotenv";
import path from "path";
import logger from "./logger";
import {
  SessionInitiation,
  TranscriptionChunk,
  TranscriptPreferences,
  AudioConfig,
  Transcribed
} from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths
import { log } from "console";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

logger.info("Environment Variables Loaded, if empty you have an issue", {
  NATS_SERVER: process.env.NATS_SERVER,
  AWS_REGION: process.env.AWS_REGION,
  AUDIO_FILE_PATH: process.env.AUDIO_FILE_PATH,
  TRANSCRIBE_FILE_PATH: process.env.TRANSCRIBE_FILE_PATH,
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
  private patientDID: string | null = null;
  private clinicianDID: string | null = null;
  private clinicName: string | null = null;
  private startTime: Date | null = null;
  private audioConfig: AudioConfig | null = null;
  private preferences: TranscriptPreferences | null = null;

  constructor() {
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
    this.filename = "test_audio.pcm";
    this.audioFilePath = process.env.TEST_AUDIO_FILE_PATH || "/tmp";
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
        try {
          // Decode and parse the message data
          const sessionData = JSON.parse(sc.decode(msg.data)) as SessionInitiation;
    
          // Validate the sessionData structure (optional but recommended)
          const { sessionId, patientDID, clinicianDID, clinicName, startTime, audioConfig, transcriptPreferences } = sessionData;
    
          if (
            !sessionId ||
            !patientDID ||
            !clinicianDID ||
            !clinicName ||
            !startTime ||
            !audioConfig?.sampleRate ||
            !audioConfig?.channels ||
            !audioConfig?.encoding ||
            !transcriptPreferences?.language ||
            transcriptPreferences.autoHighlight === undefined ||
            transcriptPreferences.saveAudio === undefined
          ) {
            logger.error("Invalid session data received:", sessionData);
            return;
          }
    
          // Log the received session data
          logger.info("Received transcription start event:", sessionData);
    
          // Start transcription with the full session data
          this.startTranscription(sessionData);
        } catch (error) {
          logger.error("Error processing transcription start event:", error);
        }

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
  
        logger.info(`Recieved Transcription session stop event: ${this.sessionId}`);
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
        logger.info(`Receive transcription session paused event: ${this.sessionId}`);
        this.transcriptionActive = false;
  
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
        logger.info(`Recieved transcription session resumed event: ${this.sessionId}`);
        this.transcriptionActive = true;
        this.streamAudioFile();

      },
    });
  }

  private startTranscription(sessionData: SessionInitiation) {
    // Assign values to private variables
    this.sessionId = sessionData.sessionId;
    this.patientDID = sessionData.patientDID;
    this.clinicianDID = sessionData.clinicianDID;
    this.clinicName = sessionData.clinicName;
    this.startTime = sessionData.startTime;
    this.audioConfig = sessionData.audioConfig;
    this.preferences = sessionData.transcriptPreferences;

    this.transcriptionActive = true;

    // Log the session start
    logger.info("Transcription session started:", {
      sessionId: this.sessionId,
      patientDID: this.patientDID,
      clinicianDID: this.clinicianDID,
      clinicName: this.clinicName,
      startTime: this.startTime,
      audioConfig: this.audioConfig,
      preferences: this.preferences,
    });
    this.streamAudioFile();
  }

  private stopTranscription(sessionId: string) {
    if (this.sessionId === sessionId) {
      this.transcriptionActive = false;
      logger.info(`Transcription session stopped: ${sessionId}`);
    }
  }
  /**
   * Simulates a function to stream audio file to AWS Transcribe
   * @returns 
   */
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


  // Initialize the StartStreamTranscriptionCommand
  const command = new StartStreamTranscriptionCommand({
    LanguageCode:  (this.preferences?.language as LanguageCode) || "en-US",
    MediaEncoding: (this.audioConfig?.encoding as MediaEncoding) || "pcm",
    MediaSampleRateHertz: this.audioConfig?.sampleRate || 16000,
    AudioStream: audioStreamGenerator(), // Assuming this method is implemented
  });

    const response = await this.transcribeClient.send(command);
    let chunkOffset = 0;
    const transcriptionChunks: TranscriptionChunk[] = [];
    for await (const event of response.TranscriptResultStream!) {
      if (!this.transcriptionActive) break;

      if ("TranscriptEvent" in event && event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          if (result.IsPartial) continue;

          const words : Transcribed[] = result.Alternatives?.[0]?.Items?.map((item, index) => ({
            word: item.Content,
            start: item.StartTime || 0,
            end: item.EndTime || 0,
            confidence: item.Confidence || 0,
            speaker: item.Speaker || undefined,
            metadata: {
              wordOffset: chunkOffset + index,
              hasCorrections: (item.Confidence || 1) < 0.8,
            },
          })) || [];

          const transcriptChunk: TranscriptionChunk = {
            sessionId: this.sessionId!,
            sequence: Number(result.ResultId || 0),
            timestamp: new Date(),
            transcript: result.Alternatives?.[0]?.Transcript || "",
            words,
            confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length || 0,
            speaker: words[0]?.speaker || undefined,
            metadata: {
              wordCount: words.length,
              hasCorrections: words.some((word) => word.metadata.hasCorrections),
              chunkOffset,
            },
          };

          chunkOffset += words.length;
          transcriptionChunks.push(transcriptChunk);
          // Log the chunk
          //logger.info("Transcription Chunk:", transcriptChunk);

          // Publish the chunk to NATS
          if (this.nc) {
            const sc = StringCodec();
            this.nc.publish(
              "transcription.word.transcribed",
              sc.encode(JSON.stringify(transcriptChunk))
            );
          }
        }
      }
    }
    // Write transcription chunks to a file
    this.writeTranscriptionToFile(transcriptionChunks);
      logger.info("Streaming complete.");
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (this.nc) {
        logger.info("Closing transcription session.");
      }
    }
  }

  private writeTranscriptionToFile(transcriptionChunks: TranscriptionChunk[]) {
    if (!process.env.TRANSCRIBE_FILE_PATH) {
      throw new Error("TRANSCRIBE_FILE_PATH environment variable is not set.");
    }
  
    const filePath = path.join(process.env.TRANSCRIBE_FILE_PATH, `${this.sessionId}.json`);
  
    try {
      fs.writeFileSync(filePath, JSON.stringify(transcriptionChunks, null, 2), "utf-8");
      logger.info(`Transcription chunks written to file: ${filePath}`);
    } catch (error : any) {
      logger.error(`Error writing transcription to file: ${error.message}`);
    }
  }


  private logDetailedTranscriptionEvent(event: TranscriptResultStream) {
    try {
      // Extract details from the event
      const { TranscriptEvent } = event;
  
      if (TranscriptEvent?.Transcript?.Results) {
        TranscriptEvent.Transcript.Results.forEach((result) => {
          // Only log finalized results (not partial)
          if (!result.IsPartial) {
            result.Alternatives?.forEach((alternative) => {
              // Extract speaker labels, offsets, and sequence number
              const words = alternative.Items?.map((item) => ({
                word: item.Content,
                startTime: item.StartTime,
                endTime: item.EndTime,
                speaker: item.Speaker || "Unknown",
                confidence: item.Confidence,
              })) || [];
  
              logger.info("Finalized transcription result:", {
                transcript: alternative.Transcript,
                sequenceNumber: result.ResultId,
                words,
              });
            });
          }
        });
      } else {
        logger.info("No transcript results available in the event.");
      }
    } catch (error) {
      logger.error("Error processing transcription event:", error);
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
