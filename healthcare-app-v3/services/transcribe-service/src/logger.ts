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
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "/app/logs/transcribe-service.log",
      level: "debug", // Ensure debug level is logged
    }),
  ],
});

/**
 * Log debug information with raw transcript and message payload
 * @param {string} rawTranscript - The raw transcript text
 * @param {Object} messagePayload - The message payload object
 */
function logDebug(rawTranscript: string, messagePayload: MessagePayload) {
  logger.debug("Processing transcript and message payload", {
    rawTranscript,
    messagePayload,
  });
}

// Example usage
const rawTranscript = "This is a raw transcript example.";
const messagePayload = { id: 123, text: "Sample message payload" };

logDebug(rawTranscript, messagePayload);

export default logger;