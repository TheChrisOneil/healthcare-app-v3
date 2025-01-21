
import express, { Request, Response } from "express";
import { createClient, RedisClientType } from "redis";
import { promisify } from "util";
import os from "os";
import { connect, NatsConnection, Msg, StringCodec, JSONCodec } from "nats";
import { PassThrough, Readable } from "stream";
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
  AudioChunk,
  SessionInitiation,
  TranscriptionChunk,
  TranscriptPreferences,
  AudioConfig,
  Transcribed,
  JsonEncodedAudioData
} from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths


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
  private audioFilePath: string;
  private transcriptFilePath: string;
  private redisClient!: RedisClientType;
  // private setAsync!: (key: string, value: string) => Promise<void>;
  // private getAsync!: (key: string) => Promise<string | null>;
  // private lpushAsync!: (key: string, value: string) => Promise<number>;
  // private lrangeAsync!: (key: string, start: number, stop: number) => Promise<string[]>;

  constructor() {
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
      // Add a buffer to store audio chunks
    this.audioFilePath = process.env.AUDIO_FILE_PATH || "/tmp";
    this.transcriptFilePath = process.env.TRANSCRIBE_FILE_PATH || "/tmp";
    this.init();
  }

  private async init() {
    try {
      await this.initRedis();
      logger.info("Successfully initialized REDIS connection")
      this.nc = await this.initNATS();
      logger.info("Successfully initialized NATS connection.");
      this.subscribeToEvents();
      logger.info("Successfully subscribed to transcription events.");        
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), "");
    }
  }
  private async initRedis() {
    try {
      // Create a Redis client
      this.redisClient = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
      });

      // Handle Redis events
      this.redisClient.on("connect", () => {
        console.log("Connected to Redis");
      });

      this.redisClient.on("ready", () => {
        console.log("Redis client is ready");
      });

      this.redisClient.on("error", (err) => {
        console.error("Redis connection error:", err);
      });

      this.redisClient.on("end", () => {
        console.log("Redis client connection has closed");
      });

      // Connect to Redis
      await this.redisClient.connect();

      // Graceful shutdown handling
      process.on("SIGINT", async () => {
        try {
          console.log("SIGINT received. Closing Redis connection...");
          await this.redisClient.quit();
          console.log("Redis client disconnected gracefully");
          process.exit(0);
        } catch (error) {
          console.error("Error while disconnecting Redis:", error);
          process.exit(1);
        }
      });
    } catch (error) {
      console.error("Failed to initialize Redis:", error);
      throw error;
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
    const jc = JSONCodec();
    const queueGroup = "transcribe-workers"; // Define the queue group name
  
    // Subscription: transcription.audio.chunks
    this.nc.subscribe("transcription.audio.chunks", {
      queue: queueGroup,
      callback: async (_err, msg) => {
        if (_err) {
          logger.error("Error receiving audio chunk event:", _err);
          return;
        }
        try {
          // Decode and parse the message
          const audioMessage: AudioChunk = jc.decode(msg.data) as AudioChunk;
          const chunkToProcess = this.parseAudioBuffer(audioMessage.audioData)
          
          // logger.debug("chunk to process", chunkToProcess);
          const audioStream = this.createAudioStream(chunkToProcess); // Create a stream from the chunk

          await this.processAudioChunk(audioStream, audioMessage); // Process the chunk
    
          // // Accumulate the audio data for the transcribe service
          // this.audioBufferAccumulator = Buffer.concat([
          //   this.audioBufferAccumulator,
          //   this.parseAudioBuffer(audioMessage.sessionId, audioMessage.audioData), 
          // ]);
          // // Process if the accumulator reaches threshold size
          // if (this.audioBufferAccumulator.length >= 16 * 1024) {
          //   const chunkToProcess = this.audioBufferAccumulator.slice(0, 16 * 1024); // Extract chunks to process
          //   this.audioBufferAccumulator = this.audioBufferAccumulator.slice(16 * 1024); // Retain the rest            
          //   const audioStream = this.createAudioStream(chunkToProcess); // Create a stream from the chunk
          //   await this.processAudioChunk(audioStream); // Process the chunk
          // }


        } catch (error) {
          logger.error("Error processing audio chunk event:", error);
        }
      },
    });
    

/**
 * Subscription: transcription.session.started
 */
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

      // Validate the sessionData structure
      const {
        sessionId,
        patientDID,
        clinicianDID,
        clinicName,
        startTime,
        audioConfig,
        transcriptPreferences,
      } = sessionData;

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
      logger.debug("Received transcription start event:", sessionData);
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
  
        logger.debug(`Recieved Transcription session stop event: ${data.sessionId}`);
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
  
      },
    });
  
    // Subscription: transcription.session.resumed
    this.nc.subscribe("command.transcribe.resume", {
      queue: queueGroup,
      callback: (_err, msg) => {
        if (_err) {
          logger.error("Error receiving transcription resumed event:", _err);
          return;
        }
      },
    });
  }

  private startTranscription(sessionData: SessionInitiation) {
    // store session state
    this.saveSessionStateToRedis(sessionData);
  }

  private async stopTranscription(sessionId: string) {
    try {
      // Finalize and save the transcript to a file or persistent storage
      await this.finalizeAndSave(sessionId);
  
      // Clean up Redis session state
      await this.deleteSessionStateFromRedis(sessionId);
  
      logger.debug(`Transcription session stopped: ${sessionId}`);
    } catch (error) {
      logger.error(`Error stopping transcription for session ${sessionId}:`, error);
    }
  }
  // /**
  //  * Flushes the remaining audio buffer to the Transcribe service
  //  * and saves it to Redis
  //  */
  // private async flushAudioBuffer() {
  //   if (this.audioBufferAccumulator.length > 0) {
  //     logger.debug(
  //       `Flushing remaining audio buffer with size: ${this.audioBufferAccumulator.length}`
  //     );
  //     const audioStream = this.createAudioStream(this.audioBufferAccumulator);
  //     await this.processAudioChunk(audioStream);
  //     this.audioBufferAccumulator = Buffer.alloc(0); // Reset the accumulator
  //   }
  // }
  /**
   * Extracts the audio buffer from the JSON data, saves it and converts it to a Buffer.
   * The JSON data is expected to have a 'data' field containing the byte array.
   * The UX client sends the audio data in this format.
   * @param jsonData 
   * @returns Buffer
   */
  private parseAudioBuffer(jsonData: JsonEncodedAudioData) {
    const byteArray = jsonData.data; // Extract the byte array from JSON
    const buffer = Buffer.from(byteArray); // Convert the byte array to a Buffer
    return buffer;
  }

  /**
   * Provides a throttled stream to the Transcribe service.
   * The AWS Transcribe service requires a stream of audio chunks.
   * Manages the flow of audio data to the Transcribe service.
   * @param buffer 
   * @returns 
   */
  private createAudioStream(buffer: Buffer) {
    
    // Create a readable stream from the buffer
    const sourceStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null); // End the stream
      },
    });

    // Add a PassThrough stream to control flow
    const throttledStream = new PassThrough({ highWaterMark: 4 * 1024 }); // 4KB chunks
    sourceStream.pipe(throttledStream);

    return throttledStream;
  }

  /**
   * Process audio chunks. This function is called when the audio buffer reaches a certain size.
   * It sends the audio chunks to the AWS Transcribe service and processes the transcription results.
   * It saves the transcript chunks to Redis.
   * @param audioStream
   * @returns 
   */
  private async processAudioChunk(audioStream: PassThrough, audioMetadata: AudioChunk) {
    logger.debug('Started processing chunks from audio message.');
    try {
      await this.saveAudioChunksToRedis(audioMetadata);
      // create autostream generator
      const autoStreamGenerator = async function* () {
        for await (const chunk of audioStream) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      };

    // Initialize the StartStreamTranscriptionCommand
    const command = new StartStreamTranscriptionCommand({
      LanguageCode:  (audioMetadata.transcriptPreferences?.language as LanguageCode) || "en-US",
      MediaEncoding: (audioMetadata.audioConfig?.encoding as MediaEncoding) || "pcm",
      MediaSampleRateHertz: audioMetadata.audioConfig?.sampleRate || 16000,
      ShowSpeakerLabel: audioMetadata.transcriptPreferences?.showSpeakerLabel || true,
      AudioStream: autoStreamGenerator(),
    });

    // Wrap the transcription command in retry logic
    const response = await this.retryWithExponentialBackoff(() =>
      this.transcribeClient.send(command)
    );
    // Process the transcription results. Due to the nature of the Transcribe service,
    // the results are streamed back in real-time.
    for await (const event of response.TranscriptResultStream!) {
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
              wordOffset:0,
              hasCorrections: (item.Confidence || 1) < 0.8,
            },
          })) || [];

          const transcriptChunk: TranscriptionChunk = {
            sessionId: audioMetadata.sessionId!,
            sequence: audioMetadata.sequence,
            timestamp: new Date(),
            transcript: result.Alternatives?.[0]?.Transcript || "",
            words,
            confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length || 0,
            metadata: {
              wordCount: words.length,
              hasCorrections: words.some((word) => word.metadata.hasCorrections),
              chunkOffset: 0
            },
          };
          // Send the transcription chunk to NATS
          // this.sendTranscriptionToNATS(transcriptChunk);
          logger.debug(`Processed words count per audio chunk: ${words.length}`);
          // Save the audio and transcript chunks to Redis
          await this.saveTranscriptChunkToRedis(audioMetadata, transcriptChunk);
        }
      }
    }
  } catch (error) {
    this.handleError(error instanceof Error ? error : new Error(String(error)), audioMetadata.sessionId!);
  } finally {
    if (this.nc) {
      logger.debug("Completed processing chunks from audio message.");
    }
  }
}

  /**
   * Publish transcribe chunk to NATS
   * @param transcriptChunk 
   */
private sendTranscriptionToNATS(transcriptChunk: TranscriptionChunk ) {
  // Publish the chunk to NATS
  if (this.nc) {
    const sc = StringCodec();
    this.nc.publish(
      "transcription.word.transcribed",
      sc.encode(JSON.stringify(transcriptChunk))
    );
  }
}

/**
 * Retries any function with exponential backoff.
 * Used for the AWS Transcribe service.
 * @param fn Function to retry
 * @param maxRetries Maximum retry attempts
 * @param baseDelay Initial delay in milliseconds
 */
private async retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 500
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(); // Execute the function
    } catch (error) {
      if (
        attempt === maxRetries || 
        !(error instanceof Error && error.name === "ThrottlingException")
      ) {
        throw error; // Rethrow if max retries reached or non-retryable error
      }

      const delay = baseDelay * 2 ** (attempt - 1); // Exponential backoff
      logger.warn(`Retry attempt ${attempt} due to ${error.name}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
    }
  }
  throw new Error("Retries exhausted");
}

private async finalizeAndSave(sessionId: string) {
  try {
    // Recall audio and transcript chunks from Redis
    const audioChunks = await this.getListRange(`session:${sessionId}:audioChunk`, 0, -1);
    const transcriptChunks = await this.getListRange(`session:${sessionId}:transcriptChunk`, 0, -1);

    // Convert Base64 strings to Buffers and concatenate
    const buffers = audioChunks.map((chunk, index) => {
      if (typeof chunk !== "string") {
        throw new Error(`Invalid chunk type at index ${index}: ${typeof chunk}`);
      }
      return Buffer.from(chunk, "base64");
    });
    const completeAudio = Buffer.concat(buffers);

    // Log the size of the final audio buffer
    //logger.debug(`Complete audio buffer length: ${completeAudio.length} bytes`);

    // Combine transcript chunks into a single string
    const transcriptionChunkStr = `[${transcriptChunks.join(", ")}]`;
    const transcriptionChunkArray = JSON.parse(transcriptionChunkStr);
    const sortedChunks = transcriptionChunkArray.sort((a: TranscriptionChunk, b: TranscriptionChunk) => (a.sequence || 0) - (b.sequence || 0));
    // Log the final transcript
    logger.debug(JSON.stringify(sortedChunks, null, 2));
    this.concatenateTranscripts(sortedChunks);

    // Define file paths
    const wavFilePath = path.join(this.audioFilePath, `${sessionId}.wav`);
    const transcriptFilePath = path.join(this.transcriptFilePath, `${sessionId}.json`);

    // Save audio to WAV file
    this.savePcmToWavFile(completeAudio, wavFilePath, 16000, 1, 16); // Assuming 16kHz, mono, 16-bit PCM
    logger.debug(`Audio file saved at ${wavFilePath}`);

    // Save transcript to a JSON file
    const transcriptJson = { sessionId, transcript: sortedChunks };
    fs.writeFileSync(transcriptFilePath, JSON.stringify(transcriptJson, null, 2), "utf-8");
    logger.debug(`Transcript file saved at ${transcriptFilePath}`);

  } catch (error) {
    logger.error(`Error finalizing session ${sessionId}:`, error);
  }
}

/**
 * Concatenate transcripts from an array of TranscriptionChunk objects.
 * @param transcriptionChunks Array of TranscriptionChunk objects.
 */
private concatenateTranscripts(transcriptionChunks: TranscriptionChunk[]): string {
  try {
    // Validate input
    if (!Array.isArray(transcriptionChunks)) {
      throw new Error("Invalid input: transcriptionChunks must be an array.");
    }

    // Extract, filter, and concatenate all transcripts
    const fullTranscript = transcriptionChunks
      .map((chunk) => chunk.transcript?.trim()) // Extract and trim each `transcript` field
      .filter((transcript) => transcript && transcript.length > 0) // Exclude null/undefined/empty transcripts
      .join(" "); // Concatenate with a space between transcripts

    // Log the concatenated transcript
    logger.debug(`Full Transcript: ${fullTranscript}`);

    return fullTranscript;
  } catch (error) {
    // Log any errors that occur
    logger.error("Error concatenating transcripts:", error);
    return ""; // Return an empty string on failure
  }
}

/**
 * Convert PCM audio to a WAV file and save it.
 * @param pcmBuffer Buffer containing raw PCM audio data.
 * @param outputPath Path to save the WAV file.
 * @param sampleRate Sample rate of the audio (e.g., 16000 Hz).
 * @param numChannels Number of channels (e.g., 1 for mono).
 * @param bitDepth Bit depth of the PCM data (e.g., 16).
 */
private savePcmToWavFile(pcmBuffer: Buffer, outputPath: string, sampleRate: number, numChannels: number, bitDepth: number) {
  // Calculate WAV header values
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const wavHeader = Buffer.alloc(44);

  // Write WAV header
  wavHeader.write("RIFF", 0); // Chunk ID
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4); // Chunk Size
  wavHeader.write("WAVE", 8); // Format
  wavHeader.write("fmt ", 12); // Subchunk1 ID
  wavHeader.writeUInt32LE(16, 16); // Subchunk1 Size
  wavHeader.writeUInt16LE(1, 20); // Audio Format (1 = PCM)
  wavHeader.writeUInt16LE(numChannels, 22); // Number of Channels
  wavHeader.writeUInt32LE(sampleRate, 24); // Sample Rate
  wavHeader.writeUInt32LE(byteRate, 28); // Byte Rate
  wavHeader.writeUInt16LE(blockAlign, 32); // Block Align
  wavHeader.writeUInt16LE(bitDepth, 34); // Bits Per Sample
  wavHeader.write("data", 36); // Subchunk2 ID
  wavHeader.writeUInt32LE(pcmBuffer.length, 40); // Subchunk2 Size

  // Combine the header and PCM data
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  // Save the WAV file
  fs.writeFileSync(outputPath, wavBuffer);
}
/**
 * Util: Get a range of items from a list in Redis
 */
private async getListRange(key: string, start: number, stop: number): Promise<string[]> {
  try {
    return await this.redisClient.lRange(key, start, stop);
  } catch (error) {
    logger.error(`Error getting list range for key ${key}:`, error);
    return [];
  }
}

/**
 * Util: Delete session state from Redis
 * @param sessionId 
 */
  private async deleteSessionStateFromRedis(sessionId: string) {
    await this.redisClient.del(`session:${sessionId}:state`);
    await this.redisClient.del(`session:${sessionId}:transcriptChunk`);
    await this.redisClient.del(`session:${sessionId}:audioChunk`);
    logger.debug(`Deleted session state from Redis for session ${sessionId}`);
  }

  /**
   * Generic service error handler
   */
  private handleError = (error: Error, sessionId: string) => {
    logger.error("Transcription service encountered an error:", error);
    if (this.nc) {
      const sc = StringCodec();
      this.nc.publish(
        "transcription.error",
        sc.encode(JSON.stringify({ sessionId: sessionId, error: error.message }))
      );
    }
  };

/**
 * Recall the session state from Redis.
 * @param sessionId 
 * @throws Error if no session data is found.
 */
private async recallSessionStateFromRedis(sessionId: string): Promise<any> {
  try {
    // Retrieve session metadata from Redis
    const sessionStateString = await this.redisClient.get(`session:${sessionId}:state`);
    if (!sessionStateString) {
      throw new Error(`No session state found for session ${sessionId}`);
    }

    // Parse and return the session state
    const sessionState = JSON.parse(sessionStateString);
    logger.debug(`Session metadata restored from Redis for session ${sessionId}`);
    return sessionState;
  } catch (error) {
    logger.error(`Error recalling session state from Redis for session ${sessionId}:`, error);
    throw error; // Re-throw the error to propagate it
  }
}

/**
 * Save a new transcript chunk to Redis
 * @param sessionId
 * @param chunk
 */
private async saveTranscriptChunkToRedis(audioMetadata: AudioChunk, chunk: TranscriptionChunk) {
  let sessionId = audioMetadata.sessionId;
  try {
    // Add the new chunk to the Redis list
    await this.redisClient.rPush(
      `session:${sessionId}:transcriptChunk`,
      JSON.stringify(chunk)
    );

  } catch (error) {
    logger.error(
      `Error adding transcript chunk to Redis for session ${sessionId}:`,
      error
    );
  }
}

/**
 * Save transcribe session state
 * @param sessionId 
 */
  private async saveSessionStateToRedis(sessionData: SessionInitiation) {
    try {

      // Save session metadata to Redis
      await this.redisClient.set(`session:${sessionData.sessionId}:state`, JSON.stringify(sessionData));
      logger.debug(`Session state saved to Redis for session ${sessionData.sessionId}`);
    } catch (error) {
      logger.error(`Error saving session state to Redis for session ${sessionData.sessionId}:`, error);
    }
  }
  /**
   * Save audio chunks to Redis
   */
  private async saveAudioChunksToRedis(audioMetadata: AudioChunk) {
      const chunk = this.parseAudioBuffer(audioMetadata.audioData);
        let base64Chunk: string;
      try {
        if (Array.isArray(chunk)) {
          // If chunk is number[], convert to Buffer first
          base64Chunk = Buffer.from(chunk).toString("base64");
        } else if (typeof chunk === "string") {
          // If chunk is already a string, assume it’s Base64
          base64Chunk = chunk;
        } else if (Buffer.isBuffer(chunk)) {
          // If chunk is a Buffer, convert to Base64
          base64Chunk = chunk.toString("base64");
        } else if (typeof chunk === "number") {
          // If chunk is a single number (byte), convert it to a Buffer
          base64Chunk = Buffer.from([chunk]).toString("base64");
        } else {
          throw new Error(`Unsupported chunk type: ${typeof chunk}`);
        }
        // Save to Redis                                         
        await this.redisClient.rPush(`session:${audioMetadata.sessionId}:audioChunk`, base64Chunk);
      
    } catch (error) {
      logger.error(`Error saving session state to Redis for session ${audioMetadata.sessionId}:`, error);
    }
  }
}

// Start the Transcribe Service
new TranscribeService();
