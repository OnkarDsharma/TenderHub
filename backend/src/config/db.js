import mongoose from 'mongoose';
import pino from 'pino';
import { env } from './env.js';

const logger = pino();

export let activeMongoUri = null;
export let isUsingSecondaryDb = false;

export const mongoOptions = {
  serverSelectionTimeoutMS: 30000, // 30 seconds (allows replica set primary election/failover recovery)
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  maxPoolSize: 20,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
};

export const connectDB = async (maxRetries = 3) => {
  // Listen to connection events (avoid duplicate listeners if called multiple times)
  if (mongoose.connection.listenerCount('connected') === 0) {
    mongoose.connection.on('connected', () => {
      logger.info(`MongoDB connected successfully [${isUsingSecondaryDb ? 'SECONDARY FALLBACK DB' : 'PRIMARY DB'}]`);
    });
    mongoose.connection.on('error', (err) => logger.error(`MongoDB connection error: ${err.message}`));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  }

  const primaryUri = env.MONGO_URI;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[Database] Connecting to Primary MongoDB cluster...${attempt > 1 ? ` (Attempt ${attempt}/${maxRetries})` : ''}`);
      activeMongoUri = primaryUri;
      isUsingSecondaryDb = false;
      await mongoose.connect(primaryUri, mongoOptions);
      return;
    } catch (primaryError) {
      if (attempt < maxRetries) {
        logger.warn(`⚠️ [MongoDB Transient Glitch] ${primaryError.message}. Retrying in 2.5s (Attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      logger.error(`❌ Primary MongoDB Connection Failed: ${primaryError.message}`);
      logger.warn('ℹ️ Automated failover to Secondary Server is DISABLED (Marked as Future Configuration pending Render paid plan).');
      process.exit(1);
    }
  }
};

/**
 * Ensures MongoDB is actively connected. If disconnected, automatically reconnects.
 */
export const ensureDbConnected = async () => {
  if (mongoose.connection.readyState === 1) return;
  logger.info('[Database] Re-establishing MongoDB connection...');
  await mongoose.connect(env.MONGO_URI, mongoOptions);
};

/**
 * Retries a database query/write with exponential backoff on transient network drops.
 */
export const withDbRetry = async (fn, maxRetries = 3, delayMs = 3000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureDbConnected();
      return await fn();
    } catch (err) {
      const isTransientError =
        err.name === 'MongoServerSelectionError' ||
        err.name === 'MongoNetworkError' ||
        err.name === 'MongoTimeoutError' ||
        err.name === 'MongoTopologyClosedError' ||
        err.message?.includes('connection') ||
        err.message?.includes('topology') ||
        err.message?.includes('socket') ||
        err.message?.includes('closed') ||
        err.message?.includes('buffering timed out');

      if (isTransientError && attempt < maxRetries) {
        const waitTime = delayMs * attempt;
        logger.warn(`⚠️ [MongoDB Transient Glitch] ${err.message}. Retrying in ${waitTime / 1000}s (Attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      throw err;
    }
  }
};

export const closeDB = async () => {
  await mongoose.connection.close();
};