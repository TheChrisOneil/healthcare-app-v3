import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import { WebSocketServer, WebSocket } from "ws";

// Define interfaces for events
interface TranscriptionStartedEvent {
  sessionId: string;
}

interface TranscriptionWordEvent {
  sessionId: string;
  word: string;
  timestamp: string;
}

const app = express();
const port = 3000;

// Initialize NATS
const initNATS = async (): Promise<NatsConnection> => {
    let retries = 5; // Number of retry attempts
    const retryDelay = 5000; // Delay between retries in milliseconds
  
    while (retries > 0) {
      try {
        const nc = await connect({ servers: "nats://nats-server:4222" });
        console.log("Connected to NATS");
        return nc;
      } catch (error) {
        console.error(`Failed to connect to NATS. Retries left: ${retries - 1}`, error);
        retries--;
  
        if (retries === 0) {
          throw new Error("Unable to connect to NATS after multiple attempts.");
        }
  
        await new Promise((res) => setTimeout(res, retryDelay)); // Wait before retrying
      }
    }
  
    // This will never be reached due to the throw above, but TypeScript requires it.
    throw new Error("Unexpected error in NATS connection logic.");
  };

// Initialize WebSocket Server
const initWebSocketServer = (nc: any) => {
  const sc = StringCodec();
  const wss = new WebSocketServer({ port: 8080 });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");

    // Subscribe to transcription topics
    const subscription: Subscription = nc.subscribe("transcription.*", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("WebSocket subscription error:", err);
          return;
        }

        const topic = msg.subject;
        const data = sc.decode(msg.data);

        // Forward message to WebSocket client
        ws.send(JSON.stringify({ topic, data: JSON.parse(data) }));
      },
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      subscription.unsubscribe();
    });
  });

  console.log("WebSocket server listening on port 8080");
};

// Set up Express endpoints
const setupRoutes = (nc: any) => {
  const sc = StringCodec();

  app.post("/api/startTranscription", (req: Request, res: Response) => {
    const event: TranscriptionStartedEvent = {
      sessionId: "abc123",
    };

    nc.publish("transcription.session.started", sc.encode(JSON.stringify(event)));
    res.status(200).send({ message: "Transcription started", sessionId: event.sessionId });
  });

  app.post("/api/stopTranscription", (req: Request, res: Response) => {
    const event: TranscriptionStartedEvent = {
      sessionId: "abc123",
    };

    nc.publish("transcription.session.stopped", sc.encode(JSON.stringify(event)));
    res.status(200).send({ message: "Transcription stopped", sessionId: event.sessionId });
  });

  app.listen(port, () => console.log(`API Gateway running on port ${port}`));
};

// Main initialization
const main = async () => {
  const nc = await initNATS();
  setupRoutes(nc);
  initWebSocketServer(nc);
};

main().catch((err) => {
  console.error("Failed to initialize API Gateway:", err);
});
