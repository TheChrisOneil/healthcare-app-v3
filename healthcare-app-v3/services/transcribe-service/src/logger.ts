import winston from "winston";
import moment from "moment-timezone";
import dotenv from "dotenv";
import {
  TranscriptionEvent,
  TranscriptResult,
  TranscriptEvent,
  TranscriptResponse,
  TranscriptionError,
  TranscriptionWord,
} from "shared-interfaces/transcription"; 
// Load environment variables
dotenv.config();

// Define the type for the message payload
interface MessagePayload {
  id: number; // Example property
  text: string; // Example property
  [key: string]: any; // Additional dynamic properties
}


const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "debug",
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => moment().tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss"), // Localized to Chicago
    }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      return `${timestamp} [${level}]: ${message} ${
        Object.keys(metadata).length ? JSON.stringify(metadata) : ""
      }`;
    })
  ),
  transports: [
    new winston.transports.Console({level: "debug" }),
    new winston.transports.File({
      filename: "/app/logs/transcribe-service.log",
      level: "debug", // Ensure debug level is logged
    }),
  ],
});

export default logger;