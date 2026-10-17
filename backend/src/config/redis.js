import Redis from 'ioredis';
import pino from 'pino';
import { env } from './env.js';

const logger = pino();

// Parse Redis connection details dynamically from env.REDIS_URL
const redisUrl = new URL(env.REDIS_URL);
const isSecure = redisUrl.protocol === 'rediss:' || redisUrl.hostname.includes('upstash.io');

export const redis = new Redis({
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  tls: isSecure ? { rejectUnauthorized: false } : undefined,
  family: 4, // Force IPv4 to prevent socket resets
  keepAlive: 30000,
  connectTimeout: 10000,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
});

redis.on('connect', () => logger.info('Redis Connected Successfully'));
redis.on('error', (err) => {
  if (!err.message.includes('ECONNRESET') && !err.message.includes('ETIMEDOUT')) {
    logger.error(`Redis Error: ${err.message}`);
  }
});