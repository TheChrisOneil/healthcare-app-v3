import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger";
import { SessionInitiation, TranscriptPreferences, AudioConfig } from "shared-interfaces/transcription"; // see tsconfig compiler options to manage local vs docker paths
import dotenv from "dotenv";
import axios from "axios";
import os from "os";
import swaggerUi from "swagger-ui-express";
import swaggerDocs from "./swagger-config";

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

// Initialize mesaage subscriptions for UX updates
// Design Note: This is a simple example. In a production system, you would likely have separate queues for each worker.
// Design Note: This service cares providing all the messages espeically the AOF.
// Design Note: If a queue group member disconnects (e.g., API Gateway restarts), NATS tracks the last delivered message
//  and resumes delivery to new members of the same queue group when they reconnect.
const initSubscriptions = (nc: NatsConnection, ws: WebSocket) => {
  const sc = StringCodec();

  // Define durable queue name
  const durableQueueName = "api-gateway-durable-workers";

  const subscriptions: Subscription[] = [
    // AOF Messages
    nc.subscribe("aof.word.highlighted", {
      queue: durableQueueName, // Durable queue group
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          logger.error("Error in AOF message", err);
          return;
        }
        const data = sc.decode(msg.data);
        logger.debug("AOF message received", { topic: msg.subject, data });
        ws.send(JSON.stringify({ topic: msg.subject, data: JSON.parse(data) }));
      },
    }),

    // Transcription Messages
    nc.subscribe("transcription.word.transcribed", {
      queue: durableQueueName, // Durable queue group
      callback: (err: Error | null, msg: Msg) => {
        if (err) {
          logger.error("Error in transcription message", err);
          return;
        }
        const data = sc.decode(msg.data);
        logger.debug("Transcription message received", { topic: msg.subject, data });
        ws.send(JSON.stringify({ topic: msg.subject, data: JSON.parse(data) }));
      },
    }),
  ];
  return subscriptions;
  logger.info("Subscriptions initialized with durable queue groups.");
};


// Initialize WebSocket Server
const initWebSocketServer = (nc: any) => {
  const sc = StringCodec();
  const wss = new WebSocketServer({ port: 8080 });

  wss.on("connection", (ws: WebSocket) => {
    logger.debug("WebSocket client connected");

    // Subscribe to transcription topics
    logger.debug("Subscribing to Transcription events...");
    const subscriptions = initSubscriptions(nc, ws);

    ws.on("close", () => {
      logger.info("WebSocket client disconnected");
      subscriptions.forEach((sub) => sub.unsubscribe());
    });
  });

  logger.info("WebSocket server listening on port 8080");
};


// Set up Express endpoints
const setupRoutes = (nc: NatsConnection) => {
  // Valid commands for the transcription service
  const validCommands = ["start", "pause", "resume", "stop"] as const;
  type Command = typeof validCommands[number];
  const sc = StringCodec();
/**
 * @swagger
 * /api/controlTranscribeService:
 *   post:
 *     summary: Send a command to control the Transcribe Service
 *     tags: [Transcription Control]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               command:
 *                 type: string
 *                 enum: [start, pause, resume, stop]
 *                 description: The command to send to the transcribe service.
 *               sessionData:
 *                 type: object
 *                 properties:
 *                   sessionId:
 *                     type: string
 *                   patientDID:
 *                     type: string
 *                   clinicianDID:
 *                     type: string
 *                   clinicName:
 *                     type: string
 *                   startTime:
 *                     type: string
 *                     format: date-time
 *                   audioConfig:
 *                     type: object
 *                     properties:
 *                       sampleRate:
 *                         type: number
 *                       channels:
 *                         type: number
 *                       encoding:
 *                         type: string
 *                   transcriptPreferences:
 *                     type: object
 *                     properties:
 *                       language:
 *                         type: string
 *                       autoHighlight:
 *                         type: boolean
 *                       saveAudio:
 *                         type: boolean
 *     responses:
 *       200:
 *         description: Command sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 sessionId:
 *                   type: string
 */
app.post("/api/controlTranscribeService", (req: Request, res: Response) => {
  const { command, sessionData }: { command: Command; sessionData: SessionInitiation } = req.body;

  // Validate command
  if (!command || !validCommands.includes(command)) {
    return res.status(400).json({
      error: `Invalid command. Valid commands are: ${validCommands.join(", ")}`,
    });
  }

  // Validate sessionData
  if (
    !sessionData ||
    !sessionData.sessionId ||
    !sessionData.patientDID ||
    !sessionData.clinicianDID ||
    !sessionData.clinicName ||
    !sessionData.startTime ||
    !sessionData.audioConfig?.sampleRate ||
    !sessionData.audioConfig?.channels ||
    !sessionData.audioConfig?.encoding ||
    !sessionData.audioConfig?.languageCode ||
    !sessionData.transcriptPreferences?.language ||
    sessionData.transcriptPreferences.autoHighlight === undefined ||
    sessionData.transcriptPreferences.saveAudio === undefined
  ) {
    return res.status(400).json({ error: "Invalid sessionData payload" });
  }

  // Create the topic and payload
  const topic = `command.transcribe.${command}`;
  const payload = {
    ...sessionData,
    timestamp: new Date().toISOString(),
  };

  // Publish to NATS
  nc.publish(topic, sc.encode(JSON.stringify(payload)));

  // Log the action
  logger.info(`Command '${command}' sent to Transcribe Service`, { sessionId: sessionData.sessionId, payload });

  // Respond to the client
  res.status(200).json({
    message: `Command '${command}' sent to Transcribe Service`,
    sessionId: sessionData.sessionId,
  });
});

  /**
   * @swagger
   * /api/status:
   *   get:
   *     summary: Get the status of all services
   *     tags: [Status]
   *     responses:
   *       200:
   *         description: The status of all services.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 gateway:
   *                   type: object
   *                   properties:
   *                     name:
   *                       type: string
   *                       example: "api-gateway"
   *                     status:
   *                       type: string
   *                       example: "UP"
   *                 services:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       name:
   *                         type: string
   *                         example: "transcribe-service"
   *                       status:
   *                         type: string
   *                         example: "UP"
   */
  app.get("/api/status", async (req: Request, res: Response) => {
    const services = [
      { name: "transcribe-service", url: "http://transcribe-service:3002/status" },
      { name: "aof-service", url: "http://aof-service:3003/status" },
    ];

    const serviceStatuses = await Promise.all(
      services.map(async (service) => {
        try {
          const response = await axios.get(service.url);
          return { name: service.name, status: "UP", ...response.data };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { name: service.name, status: "DOWN", error: message };
        }
      })
    );

    res.status(200).json({ gateway: getGatewayStatus(), services: serviceStatuses });
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
