import winston from "winston";

// Configure logging levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // Default to "info"
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      (info) =>
        `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console(), // Console transport for development
    new winston.transports.File({
      filename: "logs/app.log",
      level: "info",
    }), // Write logs to file
  ],
});

export default logger;