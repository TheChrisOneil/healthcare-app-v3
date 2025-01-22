import { createClient, RedisClientType, RedisModules, RedisFunctions, RedisScripts } from "redis";
import logger from "../utils/logger";

/**
 * Define the type for the Redis client.
 * This includes extensions like Redis Graph if applicable.
 */
type CustomRedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;


/**
 * Save a key-value pair to Redis.
 * @param client Redis client instance.
 * @param key Redis key.
 * @param value Redis value (stringified JSON or raw string).
 */
export const saveToRedis = async (client: CustomRedisClient, key: string, value: string): Promise<void> => {
  try {
    await client.set(key, value);
    logger.debug(`Saved data to Redis key: ${key}`);
  } catch (error) {
    logger.error(`Error saving to Redis: ${key}`, error);
  }
};

/**
 * Retrieve a value by key from Redis.
 * @param client Redis client instance.
 * @param key Redis key.
 * @returns The value stored in Redis (or `null` if the key doesn't exist).
 */
export const getFromRedis = async (client: CustomRedisClient, key: string): Promise<string | null> => {
  try {
    return await client.get(key);
  } catch (error) {
    logger.error(`Error retrieving from Redis: ${key}`, error);
    return null;
  }
};

/**
 * Delete a key from Redis.
 * @param client Redis client instance.
 * @param key Redis key.
 */
export const deleteFromRedis = async (client: CustomRedisClient, key: string): Promise<void> => {
  try {
    await client.del(key);
  } catch (error) {
    logger.error(`Error deleting from Redis: ${key}`, error);
  }
};

/**
 * Save to the right of the list in Redis.
 * @param client Redis client instance.
 * @param key Redis key.
 */
export const saveAsFifoToRedis = async (client: CustomRedisClient, key: string, value: string): Promise<void> => {
  try {
    await client.rPush(key, value);
  } catch (error) {
    logger.error(`Error deleting from Redis: ${key}`, error);
  }
};