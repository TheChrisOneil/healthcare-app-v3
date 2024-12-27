import { connect, NatsConnection, Msg, StringCodec } from "nats";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import * as fs from "fs";
import * as stream from "stream";
import * as dotenv from "dotenv";
import os from "os";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

console.log("NATS_SERVER:", process.env.NATS_SERVER);
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log("AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID);
console.log("AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY);
console.log("AUDIO_FILE_PATH:", process.env.AUDIO_FILE_PATH);


interface TranscriptionEvent {
  sessionId: string;
}

interface TranscriptResult {
  IsPartial: boolean;
  Alternatives?: { Transcript: string }[];
}

interface TranscriptEvent {
  Transcript?: { Results: TranscriptResult[] };
}

interface TranscriptResponse {
  TranscriptResultStream?: AsyncIterable<TranscriptEvent>;
}



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
      console.log("Successfully initialized NATS connection.");
      this.subscribeToEvents();
    } catch (error) {
      console.error("Initialization failed:", error);
    }
  }

  private async initNATS(): Promise<NatsConnection> {
    let retries = 5;
    while (retries > 0) {
      try {
        const nc = await connect({ servers: "nats://nats-server:4222" });
        console.log("transcribe-service: Connected to NATS");
        return nc;
      } catch (error) {
        console.error("Failed to connect to NATS. Retrying...", error);
        retries--;
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
    throw new Error("Unable to connect to NATS after multiple attempts.");
  }

  private subscribeToEvents() {
    if (!this.nc) {
      console.error("NATS connection not established");
      return;
    }

    const sc = StringCodec();

    this.nc.subscribe("transcription.session.started", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("Error receiving transcription started event:", err);
          return;
        }
        const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
        this.startTranscription(data.sessionId);
      },
    });

    this.nc.subscribe("transcription.session.stopped", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("Error receiving transcription stopped event:", err);
          return;
        }
        const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
        this.stopTranscription(data.sessionId);
      },
    });
  }

  private startTranscription(sessionId: string) {
    this.sessionId = sessionId;
    this.transcriptionActive = true;
    console.log(`Transcription session started: ${sessionId}`);
    this.streamAudioFile();
  }

  private stopTranscription(sessionId: string) {
    if (this.sessionId === sessionId) {
      this.transcriptionActive = false;
      console.log(`Transcription session stopped: ${sessionId}`);
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
            console.log("Received transcript:", transcript);

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

      console.log("Streaming complete.");
    } catch (error) {
      console.error("Error during streaming:", error);
    } finally {
      if (this.nc) {
        console.log("Closing transcription session.");
      }
    }
  }
}

// Start the Transcribe Service
new TranscribeService();
