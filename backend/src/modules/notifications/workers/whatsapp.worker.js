/**
 * @file backend/src/modules/notifications/workers/whatsapp.worker.js
 * @description Standalone BullMQ Worker for processing WhatsApp notification deliveries.
 * Decoupled and ready for extraction into an independent microservice container.
 */
import { Worker } from 'bullmq';
import pino from 'pino';
import { env } from '../../../config/env.js';
import { getWhatsAppProvider } from '../adapters/whatsappProvider.js';
import ContractorPreference from '../models/ContractorPreference.js';

const logger = pino();

const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  tls: { rejectUnauthorized: false },
  family: 4,
};

export const whatsappWorker = new Worker(
  'WhatsAppQueue',
  async (job) => {
    logger.info(`[WhatsAppWorker] Processing Job: ${job.name} (ID: ${job.id})`);

    const { phone, tender, user, preferenceId } = job.data;

    const provider = getWhatsAppProvider();

    if (job.name === 'send-tender-alert') {
      const result = await provider.sendTenderAlert({
        phone,
        tender,
        user,
      });

      // Increment alert stats
      if (preferenceId) {
        await ContractorPreference.findByIdAndUpdate(preferenceId, {
          $inc: { totalAlertsSent: 1 },
          lastNotifiedAt: new Date(),
        }).catch(() => {});
      }

      logger.info(`[WhatsAppWorker] ✅ Successfully dispatched alert to ${phone} (MessageId: ${result.messageId})`);
      return result;
    }

    if (job.name === 'send-daily-digest') {
      const { tenders } = job.data;
      const result = await provider.sendDailyDigest({
        phone,
        tenders,
        user,
      });
      return result;
    }

    throw new Error(`Unknown job type: "${job.name}"`);
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 concurrent WhatsApp dispatches
  }
);

whatsappWorker.on('failed', (job, err) => {
  logger.error(`[WhatsAppWorker] ❌ Job ${job?.id} failed with error: ${err.message}`);
});
