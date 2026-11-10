import { env } from './env.js';

/**
 * Build ioredis/BullMQ connection options from REDIS_URL.
 *
 * TLS is enabled only when the server expects it: a `rediss://` URL or an
 * Upstash host (Upstash requires TLS). Forcing TLS against a plain `redis://`
 * server fails with ERR_SSL_WRONG_VERSION_NUMBER.
 */
export const buildRedisConnectionOptions = (url = env.REDIS_URL) => {
  const redisUrl = new URL(url);
  const useTls = redisUrl.protocol === 'rediss:' || redisUrl.hostname.includes('upstash.io');

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    tls: useTls ? { rejectUnauthorized: false } : undefined,
    family: 4, // Force IPv4 to prevent socket resets on Render
  };
};
