import { createClient, RedisClientType } from "redis";
import { connect, NatsConnection, StringCodec } from "nats";
import { ComprehendMedicalClient, DetectEntitiesV2Command } from "@aws-sdk/client-comprehendmedical";
import * as dotenv from "dotenv";
import logger from "./logger";
import { processDiagnosisStream } from "./aws-medical-service/processDiagnosisStream";
import { aggregateEntitiesByCategory } from "./aws-medical-service/aggregateEntitiesByCategory";
import { DiagnosisStream } from "./aws-medical-service/types";
import * as fs from "fs/promises";
import path from "path";
import { SessionInitiation, TranscriptionChunk } from "shared-interfaces/transcription";


dotenv.config({ path: ".env" }); // Load environment variables

export class DiagnosisService {
  private redisClient: RedisClientType;
  private nc?: NatsConnection;
  private diagnosisClient: ComprehendMedicalClient;

  constructor() {
    logger.info("Initializing Diagnosis Service...");
    this.diagnosisClient = new ComprehendMedicalClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });

    this.redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.initRedis();
    this.init();
  }

  private async initRedis() {
    try {
      await this.redisClient.connect();
      logger.info("Connected to Redis.");
    } catch (error) {
      logger.error("Failed to connect to Redis:", error);
    }
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
    const retries = 5;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const nc = await connect({ servers: process.env.NATS_SERVER || "nats://localhost:4222" });
        logger.info("Connected to NATS.");
        return nc;
      } catch (error) {
        logger.warn(`NATS connection attempt ${attempt + 1} failed. Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    throw new Error("Unable to connect to NATS after multiple attempts.");
  }

  private subscribeToEvents() {
    const sc = StringCodec();
    const queueGroup = "diagnosis-workers";
    logger.info("Subscribing to transcribe events.");
    this.nc?.subscribe("command.transcribe.start", {
      queue: queueGroup,
      callback: (_err, msg) => this.handleStartEvent(_err, msg, sc),
    });

    this.nc?.subscribe("command.transcribe.stop", {
      queue: queueGroup,
      callback: (_err, msg) => this.handleStopEvent(_err, msg, sc),
    });

    this.nc?.subscribe("command.transcribe.resume", {
      queue: queueGroup,
      callback: (_err, msg) => this.handleResumeEvent(_err, msg, sc),
    });

    logger.info("Subscribed to diagnosis events.");
    this.nc?.subscribe("transcription.word.transcribed", {
      queue: queueGroup,
      callback: (_err, msg) => this.handleTranscribeEvent(_err, msg, sc),
    });

  }

  private getUniqueSessionId(sessionId: string) {
    return `${sessionId}:diagnosis-service`;
  }

  private async setSession(sessionId: string, sessionData: any) {
    try {
      const uniqueSessionId = this.getUniqueSessionId(sessionId);
      await this.redisClient.set(uniqueSessionId, JSON.stringify(sessionData), { EX: 3600 }); // Expire in 1 hour
      logger.info(`Session ${uniqueSessionId} stored in Redis.`);
    } catch (error) {
      logger.error("Failed to store session in Redis:", error);
    }
  }

  private async getSession(sessionId: string): Promise<any | null> {
    try {
      const uniqueSessionId = this.getUniqueSessionId(sessionId);
      const sessionData = await this.redisClient.get(uniqueSessionId);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      logger.error("Failed to retrieve session from Redis:", error);
      return null;
    }
  }

  private async deleteSession(sessionId: string) {
    try {
      const uniqueSessionId = this.getUniqueSessionId(sessionId);
      await this.redisClient.del(uniqueSessionId);
      logger.info(`Session ${uniqueSessionId} deleted from Redis.`);
    } catch (error) {
      logger.error("Failed to delete session from Redis:", error);
    }
  }

  private handleStartEvent(_err: any, msg: any, sc: ReturnType<typeof StringCodec>) {
    if (_err) {
      logger.error("Error receiving diagnosis start event:", _err);
      return;
    }
    try {
      const sessionData = JSON.parse(sc.decode(msg.data)) as SessionInitiation;
      this.startDiagnosis(sessionData);
    } catch (error) {
      logger.error("Error processing diagnosis start event:", error);
    }
  }

  private handleStopEvent(_err: any, msg: any, sc: ReturnType<typeof StringCodec>) {
    if (_err) {
      logger.error("Error receiving diagnosis stop event:", _err);
      return;
    }
    try {
      const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
      this.stopDiagnosis(data.sessionId);
    } catch (error) {
      logger.error("Error processing diagnosis stop event:", error);
    }
  }

  private async handleResumeEvent(_err: any, msg: any, sc: ReturnType<typeof StringCodec>) {
    if (_err) {
      logger.error("Error receiving diagnosis resume event:", _err);
      return;
    }
    try {
      const data = JSON.parse(sc.decode(msg.data)) as { sessionId: string };
      await this.resumeDiagnosis(data.sessionId);
    } catch (error) {
      logger.error("Error processing diagnosis resume event:", error);
    }
  }

  private async handleTranscribeEvent(_err: any, msg: any, sc: ReturnType<typeof StringCodec>) {
    if (_err) {
      logger.error("Error processing transcribe event:", _err);
      return;
    }
    try {
      logger.info("Received transcribe event.");
      const data = JSON.parse(sc.decode(msg.data)) as TranscriptionChunk;
      const sessionData = await this.getSession(data.sessionId);

      if (!sessionData) {
        logger.warn(`No session data found for session ${data.sessionId}`);
        return;
      }

      sessionData.transcription = sessionData.transcription || [];
      sessionData.transcription.push(data);

      const medicalTextChunk = await this.analyzeMedicalText(data.transcript);
      sessionData.medicalTexts = sessionData.medicalTexts || [];
      sessionData.medicalTexts.push(medicalTextChunk);
      logger.info("Medical text analysis:", sessionData.medicalTexts);

      // const processedMedTextChunk = processDiagnosisStream(sessionData.medicalTexts);
      const processedMedTextChunk = aggregateEntitiesByCategory(sessionData.medicalTexts);
      sessionData.processMedText = sessionData.processMedText || [];
      sessionData.processMedText = [...processedMedTextChunk.flat(), ...sessionData.processMedText];

      // Deduplicate the combined data based on unique `category` and `attributes`
      sessionData.processMedText = Array.from(
        new Map<string, typeof sessionData.processMedText[0]>(
          sessionData.processMedText.map((item: { category: string; attributes: any }) => [`${item.category}:${item.attributes}`, item])
        ).values()
      );
      logger.info("Processed medical text analysis:", sessionData.processMedText);
      await this.setSession(data.sessionId, sessionData);

      logger.info("Updated session data with transcription and diagnosis.");
      this.nc?.publish("diagnosis.text.processed", sc.encode(JSON.stringify(sessionData.processMedText)));
    } catch (error) {
      logger.error("Error processing transcribe event:", error);
    }
  }

  private async startDiagnosis(sessionData: SessionInitiation) {
    await this.setSession(sessionData.sessionId, sessionData);
    logger.info(`Started diagnosis for session ${sessionData.sessionId}`);
  }


  private async stopDiagnosis(sessionId: string) {
    // Retrieve the session data
    const sessionData = await this.getSession(sessionId);
  
    if (sessionData) {
      try {
        // Define the base directory from environment variable
        const baseDir = process.env.MED_TEXT_FILE_PATH || "./medicalTexts";
  
        // Define file paths
        const medicalTextsFilePath = path.join(baseDir, `${sessionId}-medicalTexts.json`);
        const processedMedicalTextsFilePath = path.join(baseDir, `${sessionId}-processedMedicalTexts.json`);
  
        // Ensure directory exists
        await fs.mkdir(path.dirname(medicalTextsFilePath), { recursive: true });
  
        // Save medicalTexts to file
        if (sessionData.medicalTexts) {
          await fs.writeFile(
            medicalTextsFilePath,
            JSON.stringify(sessionData.medicalTexts, null, 2),
            "utf-8"
          );
          logger.info(`Saved medicalTexts to file: ${medicalTextsFilePath}`);
        } else {
          logger.warn(`No medicalTexts found for session ${sessionId}`);
        }
  
        // Save processMedText to file
        if (sessionData.processMedText) {
          await fs.writeFile(
            processedMedicalTextsFilePath,
            JSON.stringify(sessionData.processMedText, null, 2),
            "utf-8"
          );
          logger.info(
            `Saved processedMedicalTexts to file: ${processedMedicalTextsFilePath}`
          );
        } else {
          logger.warn(`No processedMedicalTexts found for session ${sessionId}`);
        }
  
        // Delete session from Redis
        await this.deleteSession(sessionId);
      } catch (error) {
        logger.error(
          `Failed to save session data for session ${sessionId}:`,
          error
        );
      }
    } else {
      logger.warn(`No session data found for session ${sessionId}`);
    }
  
    logger.info(`Stopped diagnosis for session ${sessionId}`);
  }

  private async resumeDiagnosis(sessionId: string) {
    const sessionData = await this.getSession(sessionId);
    if (sessionData) {
      logger.info(`Resuming diagnosis for session ${sessionId}`);
    } else {
      logger.warn(`No session data found for session ${sessionId}`);
    }
  }

  private handleError(error: Error) {
    logger.error("Diagnosis service encountered an error:", error);
    this.nc?.publish("diagnosis.error", StringCodec().encode(error.message));
  }

  private async analyzeMedicalText(transcript: string) {
    try {
      const command = new DetectEntitiesV2Command({ Text: transcript });
      const response = await this.diagnosisClient.send(command);
      logger.info("AWS med comp response:", response);
      return response;
    } catch (error) {
      logger.error("Failed to diagnose transcript:", error);
      return null;
    }
  }
}