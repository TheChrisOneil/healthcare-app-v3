import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger";
import { TranscriptionEvent, TranscriptionWord } from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths
import dotenv from "dotenv";
import axios from "axios";
import os from "os";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

logger.info("Environment Variables Loaded, if empty you will have issues", {
  NATS_SERVER: process.env.NATS_SERVER,
  AWS_REGION: process.env.AWS_REGION,
  AUDIO_FILE_PATH: process.env.AUDIO_FILE_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL,
});


const app = express();
const port = 3000;

// Initialize NATS
const initNATS = async (): Promise<NatsConnection> => {
    let retries = 5; // Number of retry attempts
    const retryDelay = 5000; // Delay between retries in milliseconds
  
    while (retries > 0) {
      try {
        const nc = await connect({ servers: "nats://nats-server:4222" });
        logger.info("Connected to NATS");
        return nc;
      } catch (error) {
        console.error(`api-gateway: Failed to connect to NATS. Retries left: ${retries - 1}`, error);
        retries--;
  
        if (retries === 0) {
          logger.error("Unable to connect to NATS after multiple attempts");
          throw new Error("api-gateway: Unable to connect to NATS after multiple attempts.");
        }
  
        await new Promise((res) => setTimeout(res, retryDelay)); // Wait before retrying
      }
    }
  
    // This will never be reached due to the throw above, but TypeScript requires it.
    throw new Error("api-gateway: Unexpected error in NATS connection logic.");
  };

  // Private function to get API Gateway status
const getGatewayStatus = (): Record<string, any> => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  return {
    service: {
      name: "api-gateway",
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
    timestamp: new Date().toISOString(),
  };
};


// Initialize WebSocket Server
const initWebSocketServer = (nc: any) => {
  const sc = StringCodec();
  const wss = new WebSocketServer({ port: 8080 });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("WebSocket client connected");

    // Subscribe to transcription topics
    console.log("api-gateway: Subscribing to Transcription events...");
    const subscription: Subscription = nc.subscribe("transcription.word.transcribed", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          logger.error("WebSocket subscription error", { error: err });
          return;
        }

        const topic = msg.subject;
        const data = sc.decode(msg.data);
        logger.debug("Received message from NATS", { topic, data });

        // Forward message to WebSocket client
        ws.send(JSON.stringify({ topic, data: JSON.parse(data) }));
      },
    });

    ws.on("close", () => {
      logger.info("WebSocket client disconnected");
      subscription.unsubscribe();
    });
  });

  logger.info("WebSocket server listening on port 8080");
};

// Set up Express endpoints
const setupRoutes = (nc: any) => {
  const sc = StringCodec();

  app.post("/api/startTranscription", (req: Request, res: Response) => {
    const event: TranscriptionEvent = {
      sessionId: "abc123",
    };

    nc.publish("transcription.session.started", sc.encode(JSON.stringify(event)));
    res.status(200).send({ message: "Transcription started", sessionId: event.sessionId });
    logger.info("Transcription started", { sessionId: event.sessionId });
  });

  app.post("/api/stopTranscription", (req: Request, res: Response) => {
    const event: TranscriptionEvent = {
      sessionId: "abc123",
    };

    nc.publish("transcription.session.stopped", sc.encode(JSON.stringify(event)));
    res.status(200).send({ message: "Transcription stopped", sessionId: event.sessionId });
    logger.info("Transcription stopped", { sessionId: event.sessionId });
  });

  app.post("/api/stopTranscription", (req: Request, res: Response) => {
    const event: TranscriptionEvent = { sessionId: "abc123" };

    nc.publish("transcription.session.stopped", sc.encode(JSON.stringify(event)));
    res.status(200).send({ message: "Transcription stopped", sessionId: event.sessionId });
    logger.info("Transcription stopped", { sessionId: event.sessionId });
  });

  app.get("/api/status", async (req: Request, res: Response) => {
    const services = [
      { name: "transcribe-service", url: "http://transcribe-service:3002/status" },
      { name: "api-gateway", url: "" },
    ];

    const serviceStatuses = await Promise.all(
      services.map(async (service) => {
        if (service.name === "api-gateway") {
          // Use the private function for API Gateway's status
          return getGatewayStatus();
        }

        try {
          const response = await axios.get(service.url);
          return { name: service.name, status: "UP", ...response.data };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error("Service health check failed", { service: service.name, error: message });
          return { name: service.name, status: "DOWN", error: message };
        }
      })
    );

    res.status(200).json({
      services: serviceStatuses,
    });
  });


  app.listen(port, () => logger.info(`api-gateway: API Gateway running on port ${port}`));
};

// Main initialization
const main = async () => {
  const nc = await initNATS();
  setupRoutes(nc);
  initWebSocketServer(nc);
};

main().catch((err) => {
  logger.error("Failed to initialize API Gateway", { error: err });
});
