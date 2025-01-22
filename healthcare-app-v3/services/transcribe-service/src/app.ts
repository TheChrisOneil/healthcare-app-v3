import dotenv from "dotenv";
import { startApiServer } from "./api/routes";
import { initializeRedis } from "./redis/redis-client";
import { initializeNatsClient } from "./messaging/nats-client";
import { subscribeToNatsMessages } from "./messaging/nats-subscribers";
import logger from "./utils/logger";

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Initialize Redis connection pool
    const redisClient = await initializeRedis();
    logger.info("Redis initialized successfully.");

    // Initialize NATS connection
    const natsClient = await initializeNatsClient();
    logger.info("NATS client initialized successfully.");

    // Subscribe to NATS messages
    await subscribeToNatsMessages(natsClient, redisClient);
    logger.info("NATS message subscriptions started.");

    // Optionally start an API server (if required)
    startApiServer();
    logger.info("API server started successfully.");
  } catch (error) {
    logger.error("Error during application startup:", error);
    process.exit(1);
  }
}

main();