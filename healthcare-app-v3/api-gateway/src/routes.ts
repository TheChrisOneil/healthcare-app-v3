import express, { Request, Response } from "express";
import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import logger from "./logger";
import { SessionInitiation, TranscriptPreferences, AudioConfig } from "shared-interfaces/transcription"; // see tsconfig compiler options to manage local vs docker paths
import axios from "axios";
import os from "os";
import swaggerUi from "swagger-ui-express";
import swaggerDocs from "./swagger-config";

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
    logger.info(`Command '${command}' published`, { sessionId: sessionData.sessionId, payload });
  
    // Respond to the client
    res.status(200).json({
      message: `Command '${command}' published`,
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


  export default setupRoutes;