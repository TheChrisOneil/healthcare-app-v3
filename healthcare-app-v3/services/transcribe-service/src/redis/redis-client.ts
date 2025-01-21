import { createClient, RedisClientType, RedisModules, RedisFunctions, RedisScripts } from "redis";
import logger from "../utils/logger";

/**
 * Define the type for the Redis client.
 * This includes extensions like Redis Graph if applicable.
 */
type CustomRedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

/**
 * Initializes a Redis client connection.
 * @returns A connected Redis client instance.
 */
export const initializeRedis = async (): Promise<CustomRedisClient> => {
  const redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
  try { 
  //redisClient.on("connect", () => logger.info("Connected to Redis"));
  //redisClient.on("error", (err) => logger.error("Redis connection error:", err));
     // Handle Redis events
     redisClient.on("connect", () => {
      logger.info("Connected to Redis");
    });

    redisClient.on("ready", () => {
      logger.info("Redis client is ready");
    });

    redisClient.on("error", (err) => {
      logger.error("Redis connection error:", err);
    });

    redisClient.on("end", () => {
      logger.info("Redis client connection has closed");
    });

    // Connect to Redis
    await redisClient.connect();

    // Graceful shutdown handling
    process.on("SIGINT", async () => {
      try {
        console.log("SIGINT received. Closing Redis connection...");
        await redisClient.quit();
        console.log("Redis client disconnected gracefully");
        process.exit(0);
      } catch (error) {
        console.error("Error while disconnecting Redis:", error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    throw error;
  }
  return redisClient;
};