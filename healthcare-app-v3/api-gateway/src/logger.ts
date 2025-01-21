import winston from "winston";
import moment from "moment-timezone"; // Install moment-timezone: npm install moment-timezone

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => moment().tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss"), // Localized to Chicago
    }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(metadata).length ? JSON.stringify(metadata) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console({level: "debug" }),
    new winston.transports.File({
      filename: "/app/logs/api-service.log",
      level: "info",
    }),
  ],
});

export default logger;