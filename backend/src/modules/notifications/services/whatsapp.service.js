/**
 * @file backend/src/modules/notifications/services/whatsapp.service.js
 * @description WhatsApp orchestration service dispatching matches and managing contractor queues.
 */
import { Queue } from 'bullmq';
import pino from 'pino';
import ContractorPreference from '../models/ContractorPreference.js';
import Subscription from '../../billing/models/Subscription.js';
import User from '../../../models/User.js';
import ContractorAgentProfile from '../../../models/ContractorAgentProfile.js';
import { matchingEngine } from './matching.engine.js';
import { getWhatsAppProvider } from '../adapters/whatsappProvider.js';
import { env } from '../../../config/env.js';

const logger = pino();

const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  tls: { rejectUnauthorized: false },
  family: 4,
};

// Isolated BullMQ queue for WhatsApp alerts (Microservice ready)
export const whatsappQueue = new Queue('WhatsAppQueue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export class WhatsAppNotificationService {
  /**
   * Process a newly ingested tender: match against all active subscribers and enqueue WhatsApp alerts.
   * @param {Object} tender - Saved tender object
   */
  async processNewTender(tender) {
    try {
      // 1. Fetch active subscriptions (Pro members with WhatsApp enabled)
      const activeSubs = await Subscription.find({
        status: { $in: ['active', 'trialing'] },
        currentPeriodEnd: { $gt: new Date() },
        'features.whatsappAlerts': true,
      }).select('userId');

      const eligibleUserIds = activeSubs.map((s) => s.userId);
      const freeProfiles = await ContractorAgentProfile.find({ 'credits.planTier': 'free_trial' }).select('userId');
      for (const profile of freeProfiles) {
        if (!eligibleUserIds.some((id) => id.toString() === profile.userId.toString())) eligibleUserIds.push(profile.userId);
      }

      // In development mode, also include test admin user if present
      if (env.NODE_ENV !== 'production') {
        const testUser = await User.findOne({ email: 'bgmiwale@gmail.com' });
        if (testUser && !eligibleUserIds.some(id => id.toString() === testUser._id.toString())) {
          eligibleUserIds.push(testUser._id);
        }
      }

      if (eligibleUserIds.length === 0) {
        return { matched: 0, queued: 0 };
      }

      // 2. Fetch preferences for eligible contractors
      const preferences = await ContractorPreference.find({
        userId: { $in: eligibleUserIds },
        whatsappEnabled: true,
        whatsappPhone: { $exists: true, $ne: '' },
      }).populate('userId', 'name email');

      let queuedCount = 0;

      for (const pref of preferences) {
        if (matchingEngine.matches(tender, pref)) {
          // Enqueue job with idempotency key
          const jobId = `wa_${pref.userId._id}_${tender._id || tender.tenderId}`;
          await whatsappQueue.add(
            'send-tender-alert',
            {
              preferenceId: pref._id,
              userId: pref.userId._id,
              phone: pref.whatsappPhone,
              tender: {
                _id: tender._id,
                tenderId: tender.tenderId,
                title: tender.title,
                department: tender.department || tender.organisationChain,
                tenderValue: tender.tenderValue,
                tenderValueFormatted: tender.tenderValueFormatted,
                closingDateFormatted: tender.closingDateFormatted || tender.bidSubmissionEndDate,
              },
              user: {
                name: pref.userId.name,
              },
            },
            { jobId, delay: 1000 }
          );

          queuedCount++;
        }
      }

      logger.info(`Tender ${tender.tenderId || tender._id}: Matched & queued WhatsApp alerts for ${queuedCount} contractors.`);
      return { matched: queuedCount, queued: queuedCount };
    } catch (err) {
      logger.error(`Error processing WhatsApp matching for tender: ${err.message}`);
      return { matched: 0, queued: 0, error: err.message };
    }
  }

  /**
   * Dispatch instant test message to verify contractor phone number
   */
  async sendTestMessage(phone, user) {
    const provider = getWhatsAppProvider();
    const message = `👋 Hello ${user?.name || 'Contractor'}!\n\nThis is a verification test from *TenderHub J&K*. Your WhatsApp tender alerts are active.\n\nYou will automatically receive instant updates whenever new tenders match your saved departments and districts!`;
    return await provider.sendTextMessage({ phone, message });
  }

  /**
   * Dispatch payment receipt & plan confirmation to contractor WhatsApp
   */
  async sendPaymentReceipt({ user, plan, subscription, paymentId, phone }) {
    try {
      const provider = getWhatsAppProvider();
      let targetPhone = phone;

      // If phone wasn't passed directly, find it from contractor preferences
      if (!targetPhone && user?._id) {
        const pref = await ContractorPreference.findOne({ userId: user._id });
        if (pref && pref.whatsappPhone) {
          targetPhone = pref.whatsappPhone;
        }
      }

      if (!targetPhone) {
        logger.warn(`No phone number available to send payment confirmation for user ${user?._id}`);
        return { success: false, reason: 'NO_PHONE' };
      }

      if (typeof provider.sendPaymentConfirmation === 'function') {
        const result = await provider.sendPaymentConfirmation({
          phone: targetPhone,
          user,
          plan,
          subscription,
          paymentId,
        });
        logger.info(`Payment receipt WhatsApp alert sent to ${targetPhone}`);
        return result;
      }
    } catch (err) {
      logger.error(`Failed to send WhatsApp payment receipt: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

export const whatsappNotificationService = new WhatsAppNotificationService();
