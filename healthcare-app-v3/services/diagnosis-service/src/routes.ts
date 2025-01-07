import express, { Request, Response } from "express";
import os from "os";
import logger from "./logger";

const app = express();
const port = process.env.REST_API_PORT; // HTTP server port for the service

// Health check endpoint
app.get("/status", (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  res.status(200).json({
    service: {
      name: "transcribe-service",
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
  });
});

// Start the Express server
export const startServer = () => {
  app.listen(port, () => {
    logger.info(`Transcribe service status endpoint running on port ${port}`);
  });
};