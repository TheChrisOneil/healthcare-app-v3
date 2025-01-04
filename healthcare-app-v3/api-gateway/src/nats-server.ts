import { connect, NatsConnection, StringCodec, Msg, Subscription } from "nats";
import logger from "./logger";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: '.env' }); // Load from root directory

// Initialize NATS
const initNATS = async (): Promise<NatsConnection> => {
    let retries = 5; // Number of retry attempts
    const retryDelay = 5000; // Delay between retries in milliseconds
  
    while (retries > 0) {
      try {
        const nc = await connect({ servers: process.env.NATS_SERVER || "nats://nats-server:4222" });
        logger.info("Connected to NATS");
        return nc;
      } catch (error) {
        console.error(`api-gateway: Failed to connect to NATS. Retries left: ${retries - 1}`, error);
        retries--;
  
        if (retries === 0) {
          logger.error("Unable to connect to NATS after multiple attempts");
          throw new Error("api-gateway: Unable to connect to NATS after multiple attempts.");
        }
  
        await new Promise((res) => setTimeout(res, retryDelay)); // Wait before retrying
      }
    }
  
    // This will never be reached due to the throw above, but TypeScript requires it.
    throw new Error("api-gateway: Unexpected error in NATS connection logic.");
  };

  export default initNATS;