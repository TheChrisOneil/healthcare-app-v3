import { connect, NatsConnection, Msg, StringCodec, Subscription } from "nats";

// Main class for the Transcribe Service
class TranscribeService {
  private nc: NatsConnection | undefined; // Initialize as undefined
  private transcriptionActive = false;
  private sessionId: string | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.nc = await this.initNATS(); // Retry mechanism for NATS connection
    console.log("Successfully initialized NATS connection.");
    this.subscribeToEvents();
  }

  private async initNATS(): Promise<NatsConnection> {
    let retries = 5;
    while (retries > 0) {
      try {
        const nc = await connect({ servers: "nats://nats-server:4222" });
        console.log("Connected to NATS");
        return nc;
      } catch (error) {
        console.error("Failed to connect to NATS. Retrying...", error);
        retries--;
        await new Promise((res) => setTimeout(res, 5000)); // Wait 5 seconds before retrying
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

    // Subscribe to transcription start
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

    // Subscribe to transcription stop
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
    this.publishTranscribedWords();
  }

  private stopTranscription(sessionId: string) {
    if (this.sessionId === sessionId) {
      this.transcriptionActive = false;
      console.log(`Transcription session stopped: ${sessionId}`);
    }
  }

  private async publishTranscribedWords() {
    if (!this.nc) {
      console.error("NATS connection not established");
      return;
    }

    const sc = StringCodec();

    while (this.transcriptionActive) {
      const word = this.generateMockWord();
      this.nc.publish(
        "transcription.word.transcribed",
        sc.encode(
          JSON.stringify({
            sessionId: this.sessionId,
            word,
            timestamp: new Date().toISOString(),
          })
        )
      );
      console.log(`Published word: ${word}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private generateMockWord(): string {
    const words = ["example", "test", "transcription", "session", "NATS"];
    return words[Math.floor(Math.random() * words.length)];
  }
}

// Start the Transcribe Service
new TranscribeService();
