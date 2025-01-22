import { connect, NatsConnection } from "nats";
import logger from "../utils/logger";

export async function initializeNatsClient(): Promise<NatsConnection> {
  const natsUrl = process.env.NATS_SERVER || "nats://localhost:4222";
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const natsClient = await connect({ servers: natsUrl });
      logger.info("Connected to NATS server:", natsUrl);
      return natsClient;
    } catch (error) {
      logger.warn(
        `Failed to connect to NATS server. Attempt ${attempt} of ${maxRetries}. Retrying in ${retryDelay}ms...`
      );
      if (attempt === maxRetries) {
        logger.error("Unable to connect to NATS after multiple attempts.");
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error("Unable to connect to NATS after all retry attempts.");
}