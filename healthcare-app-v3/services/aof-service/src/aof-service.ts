import express, { Request, Response } from "express";
import os from "os";
import { connect, NatsConnection, Msg, StringCodec } from "nats";
import * as dotenv from "dotenv";
import logger from "./logger";

// Load environment variables from .env file
dotenv.config({ path: ".env" });

logger.info("Environment Variables Loaded", {
  NATS_SERVER: process.env.NATS_SERVER,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

const app = express();
const port = 3003; // HTTP server port for the service

app.get("/status", (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  res.status(200).json({
    service: {
      name: "aof-service",
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

app.listen(port, () => {
  logger.info(`AOF service status endpoint running on port ${port}`);
});

class AOFService {
  private nc: NatsConnection | undefined;
  private isRunning: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.nc = await this.initNATS();
      logger.info("Successfully initialized NATS connection.");

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

    this.nc.subscribe("transcription.word.transcribed", {
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          logger.error("Error receiving transcribed word event:", err);
          return;
        }
        const data = JSON.parse(sc.decode(msg.data)) as { word: string };
        this.processWord(data.word);
      },
    });

    this.nc.subscribe("command.transcribe.*", {
        queue: "aof-service-queue", // Durable queue group for message handling
        callback: (err: Error | null, msg: Msg) => {
          if (err) {
            logger.error("Error receiving control message:", err);
            return;
          }
      
          try {
            // Extract the command from the topic
            const topicSegments = msg.subject.split(".");
            const command = topicSegments[topicSegments.length - 1]; // Get the last segment
      
            // Decode and parse the message
            const controlMessage = JSON.parse(sc.decode(msg.data));
            const { sessionId } = controlMessage;
      
            if (!command || !sessionId) {
              logger.error("Invalid control message format or missing sessionId:", controlMessage);
              return;
            }
      
            this.handleControlMessage(command, sessionId);
          } catch (error) {
            logger.error("Failed to parse control message:", error);
          }
        },
      });

    logger.info("Subscribed to transcription and control events.");
  }

  private handleControlMessage(command: string, sessionId: string) {
    switch (command) {
      case "start":
        this.startProcessing(sessionId);
        break;
      case "pause":
        this.pauseProcessing(sessionId);
        break;
      case "resume":
        this.resumeProcessing(sessionId);
        break;
      case "stop":
        this.stopProcessing(sessionId);
        break;
      default:
        logger.warn(`Unknown command received: ${command}`);
    }
  }
  
  private startProcessing(sessionId: string) {
    logger.info(`Starting processing for session: ${sessionId}`);
    this.isRunning = true;
  }
  
  private pauseProcessing(sessionId: string) {
    logger.info(`Pausing processing for session: ${sessionId}`);
    this.isRunning = false;
    // Save the state to Redis or other state store
  }
  
  private resumeProcessing(sessionId: string) {
    logger.info(`Resuming processing for session: ${sessionId}`);
    this.isRunning = true;
    // Restore the state from Redis or other state store
  }
  
  private stopProcessing(sessionId: string) {
    logger.info(`Stopping processing for session: ${sessionId}`);
    this.isRunning = false;
    // Clean up state or persist final data if necessary
  }
  
  private processWord(word: string) {
    if (!this.isRunning) {
      logger.warn("Received word while service is paused or stopped.");
      return;
    }
  
    const highlightedWord = word.length > 8 ? `**${word}**` : word;
    logger.info(`Processed word: ${highlightedWord}`);
  
    // Publish the processed word back to NATS
    if (this.nc) {
      const sc = StringCodec();
      this.nc.publish(
        "aof.word.highlighted",
        sc.encode(JSON.stringify({ word: highlightedWord, timestamp: new Date().toISOString() }))
      );
    }
  }


  private handleError = (error: Error) => {
    logger.error("AOF service encountered an error:", error);
    if (this.nc) {
      const sc = StringCodec();
      this.nc.publish(
        "aof.error",
        sc.encode(JSON.stringify({ error: error.message }))
      );
    }
  };
}

// Start the AOF Service
new AOFService();