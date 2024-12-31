import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger";
import { TranscriptionEvent, TranscriptionWord } from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths
import dotenv from "dotenv";
import axios from "axios";
import os from "os";
import swaggerUi from "swagger-ui-express";
import swaggerDocs from "./swagger-config";
import * as fs from "fs";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

logger.info("Environment Variables Loaded", {
  NATS_SERVER: process.env.NATS_SERVER,
  AWS_REGION: process.env.AWS_REGION,
  TEST_AUDIO_FILE_PATH: process.env.TEST_AUDIO_FILE_PATH,
  LOG_LEVEL: process.env.LOG_LEVEL,
  TEST_AUDIO_FILE_NAME: process.env.TEST_AUDIO_FILE_NAME,
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
        const nc = await connect({ servers: process.env.NATS_SERVER });
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


// TESTING Function to stream audio to NATS
const sessionStates: Record<string, { paused: boolean; stopped: boolean; sequence: number }> = {};



async function streamAudioToNATS(nc: NatsConnection, sessionId: string) {
  logger.debug(`Starting audio streaming for session ${sessionId}`);
  const chunkSize = 1024 * 6; // 4 KB chunk size
  const audioSubject = "audio.stream.transcribe";
  const audioFilePath = process.env.TEST_AUDIO_FILE_PATH || "/tmp";
  const filename = process.env.TEST_AUDIO_FILE_NAME || "foobar.pcm";
  const audioFilePathName = path.join(audioFilePath, filename);
  const sc = StringCodec();
  const audioStream = fs.createReadStream(audioFilePathName, { highWaterMark: chunkSize });
  const delay = 10; // Delay between sending chunks in milliseconds
  let sequence = sessionStates[sessionId]?.sequence || 0;
  let isHeaderStripped = false;
  // Initialize session state
  sessionStates[sessionId] = { paused: false, stopped: false, sequence: 0 };

  for await (const chunk of audioStream) {
    // Check if the session is stopped
    if (sessionStates[sessionId]?.stopped) {
      logger.info(`Streaming stopped for session ${sessionId}`);
      break;
    }

    // Wait if the session is paused
    while (sessionStates[sessionId]?.paused) {
      logger.debug(`Streaming paused for session ${sessionId}`);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Polling interval during pause
    }

    // Publish the chunk
    const sequence = sessionStates[sessionId]?.sequence || 0;

    logger.debug(`Streaming chunk ${sequence} for session ${sessionId}`);
    nc.publish(audioSubject, sc.encode(JSON.stringify({
      sessionId,
      sequence,
      chunk: chunk.toString("base64"),
      timestamp: new Date().toISOString()
    })));

    // Update sequence and state
    sessionStates[sessionId].sequence = sequence + 1;

    // Introduce a delay before sending the next chunk
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  logger.info(`Audio streaming complete for session ${sessionId}`);
  delete sessionStates[sessionId]; // Clean up session state
}

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
   *               sessionId:
   *                 type: string
   *                 description: The unique session ID.
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
   *                   example: "Command sent"
   *                 sessionId:
   *                   type: string
   *                   example: "abc123"
   */
  app.post("/api/controlTranscribeService", async (req: Request, res: Response) => {
    const { command, sessionId } = req.body;
  
    if (!command || !sessionId) {
      return res.status(400).json({ error: "Invalid request payload" });
    }
  
    const validCommands = ["start", "pause", "resume", "stop"];
    if (!validCommands.includes(command)) {
      return res
        .status(400)
        .json({ error: `Invalid command. Valid commands: ${validCommands.join(", ")}` });
    }
  
    const sc = StringCodec();
    const topic = `command.transcribe.${command}`;
    
    try {
  
    // Publish control command to NATS
    nc?.publish(topic, sc.encode(JSON.stringify({ sessionId, timestamp: new Date().toISOString() })));
    logger.info(`Command '${command}' sent to Transcribe Service`, { sessionId });

    await new Promise((resolve) => setTimeout(resolve, 500)); // wait to ensure the session state is updated
        // Handle the commands and manage the session states
    switch (command) {
      case "start":
        if (!sessionStates[sessionId]) {
          sessionStates[sessionId] = { paused: false, stopped: false, sequence: 0 };
          logger.info(`Initialized session state for ${sessionId}`);
        }
        if (sessionStates[sessionId]?.stopped) {
          sessionStates[sessionId].stopped = false; // Reset stopped flag for restarts
        }
        if (nc) {
          try{
            await streamAudioToNATS(nc, sessionId);
          }catch (err) {
            logger.debug("Ignore Error streaming audio to NATS", err);
          }
        }
        break;

      case "pause":
        if (sessionStates[sessionId]) {
          sessionStates[sessionId].paused = true;
          logger.info(`Paused streaming for session ${sessionId}`);
        } else {
          logger.warn(`Pause command received for unknown session ${sessionId}`);
        }
        
        break;

      case "resume":
        if (sessionStates[sessionId]) {
          sessionStates[sessionId].paused = false;
          logger.info(`Resumed streaming for session ${sessionId}`);
        } else {
          logger.warn(`Resume command received for unknown session ${sessionId}`);
        }
        break;

      case "stop":
        if (sessionStates[sessionId]) {
          sessionStates[sessionId].stopped = true;
          logger.info(`Stopped streaming for session ${sessionId}`);
          // Clean up the session state
          delete sessionStates[sessionId];
        } else {
          logger.warn(`Stop command received for unknown session ${sessionId}`);
        }
        break;
        logger.info(`Command '${command}' processed now will send to Transcribe Service`, { sessionId });
    

      default:
        logger.warn(`Unhandled command received: ${command}`);
        break;
    }
  
  
      res.status(200).json({ message: `Command '${command}' sent to Transcribe Service`, sessionId });
    } catch (err) {
      logger.error("Error processing transcribe control command", err);
      res.status(500).json({ error: "Failed to process transcribe command" });
    }
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
