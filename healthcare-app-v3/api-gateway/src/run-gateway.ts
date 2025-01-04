import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import logger from "./logger";
import { SessionInitiation, TranscriptPreferences, AudioConfig } from "shared-interfaces/transcription"; // see tsconfig compiler options to manage local vs docker paths
import dotenv from "dotenv";
import axios from "axios";
import os from "os";
import swaggerUi from "swagger-ui-express";
import swaggerDocs from "./swagger-config";
import { initWebSocketServer } from "./webSocketServer";
import initNATS from "./nats-server";
import setupRoutes from "./routes";
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add Swagger UI
app.use("/api/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
logger.info("Swagger UI available at /api/api-docs");


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


// Main initialization
const main = async () => {
  const nc = await initNATS();
  setupRoutes(nc);
  initWebSocketServer(nc);
};

main().catch((err) => {
  logger.error("Failed to initialize API Gateway", { error: err });
});
