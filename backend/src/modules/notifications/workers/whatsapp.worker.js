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
import ContractorAgentProfile from '../../../models/ContractorAgentProfile.js';

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
      if (job.data.userId) {
        const profile = await ContractorAgentProfile.findOne({ userId: job.data.userId });
        if (profile?.credits?.planTier === 'free_trial') {
          const now = new Date();
          const weekStart = profile.credits.weekStartDate || now;
          if (now.getTime() - new Date(weekStart).getTime() >= 7 * 24 * 60 * 60 * 1000) {
            profile.credits.weeklyWhatsAppUsed = 0;
            profile.credits.weekStartDate = now;
          }
          if (profile.credits.weeklyWhatsAppUsed >= profile.credits.weeklyWhatsAppLimit) {
            logger.info(`[WhatsApp] Weekly free quota reached (2/2) for user: ${job.data.userId}. Skipping WhatsApp ping.`);
            await profile.save();
            return { success: false, suppressed: true, reason: 'WEEKLY_FREE_QUOTA_REACHED' };
          }
          profile.credits.weeklyWhatsAppUsed += 1;
          if (profile.credits.weeklyWhatsAppUsed === profile.credits.weeklyWhatsAppLimit) user.weeklyQuotaFooter = "⚡ You've used your 2 free weekly WhatsApp alerts. Upgrade to Starter for real-time daily alerts.";
          await profile.save();
        }
      }
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
