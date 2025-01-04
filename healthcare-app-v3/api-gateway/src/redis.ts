import Redis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Redis connection using URL
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

// Initialize Redis
const redis = new Redis(redisUrl);

// Event listeners for Redis connection
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

export default redis;