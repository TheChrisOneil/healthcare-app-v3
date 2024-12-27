import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // Controlled by an environment variable
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(), // Logs to stdout for Docker compatibility
    new winston.transports.File({ filename: "/app/logs/api-gateway.log", level: "info" }), // Logs to a file
  ],
});

export default logger;