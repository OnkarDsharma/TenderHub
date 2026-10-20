/**
 * @file backend/src/modules/billing/billing.service.js
 * @description Core billing business logic orchestrating plans, checkouts, and activations.
 */
import Subscription from './models/Subscription.js';
import { razorpayAdapter } from './adapters/RazorpayAdapter.js';
import User from '../../models/User.js';
import ContractorPreference from '../notifications/models/ContractorPreference.js';
import ContractorAgentProfile from '../../models/ContractorAgentProfile.js';
import { whatsappNotificationService } from '../notifications/services/whatsapp.service.js';
import { env } from '../../config/env.js';
import pino from 'pino';

const logger = pino();

export const PLANS = {
  pro_monthly: {
    id: 'pro_monthly',
    name: 'TenderHub Pro Monthly',
    price: 10, // INR (Temporarily set to 10 for testing)
    periodDays: 30,
    cycle: 'monthly',
    popular: true,
    description: 'Perfect for active individual contractors and suppliers.',
    features: [
      'Unlimited tender views & full pagination',
      'Instant BOQ Excel & Price Schedule downloads',
      'Custom WhatsApp alerts (Department, District, Value filters)',
      'Unlimited saved tenders & contractor bookmarks',
      'Corrigendum & deadline extension notifications',
    ],
  },
  pro_quarterly: {
    id: 'pro_quarterly',
    name: 'TenderHub Pro Quarterly',
    price: 999, // INR
    periodDays: 90,
    cycle: 'quarterly',
    popular: false,
    description: 'Best for contractors during peak summer/autumn working season.',
    features: [
      'All Pro Monthly features included',
      'Save 17% compared to monthly renewal',
      'Priority WhatsApp alert delivery',
      'Dedicated contractor support',
    ],
  },
  pro_annual: {
    id: 'pro_annual',
    name: 'TenderHub Pro Annual',
    price: 2999, // INR
    periodDays: 365,
    cycle: 'annual',
    popular: false,
    description: 'Maximum savings for Class A/B engineering firms.',
    features: [
      'All Pro features for a full year',
      'Save 37% (~₹249/month effective rate)',
      'Direct WhatsApp priority support from engineering desk',
      'Early access to new department adapters',
    ],
  },
  ai_pay_per_tender: {
    id: 'ai_pay_per_tender',
    name: 'Pay-Per-Tender AI Dossier',
    price: 299,
    periodDays: 30,
    cycle: 'one-time',
    popular: false,
    dossierCredits: 1,
    chatQueries: 20,
    description: 'Instant full AI analysis for a single high-stakes tender.',
    features: [
      '1 Full Comprehensive AI Tender Dossier',
      'Instant BOQ Raw Material Extractor & Rates',
      'Personalized Turnover & Solvency Gap Check',
      'Mandatory Document & Affidavit Checklist',
      'Post-Award Milestone & Penalty Alert Sheet',
      '48-Hour Interactive Tender Copilot Access',
    ],
  },
  ai_copilot_starter: {
    id: 'ai_copilot_starter',
    name: 'Contractor Copilot Starter',
    price: 999,
    periodDays: 30,
    cycle: 'monthly',
    popular: true,
    dossierCredits: 10,
    chatQueries: 100,
    description: 'Continuous AI quantity surveying for active local contractors.',
    features: [
      '10 Full AI Tender Dossiers every month',
      'Personalized Contractor Profile Memory',
      'Turnover, Machinery & Solvency Gap Analysis',
      'Complete Raw Material BOQ Schedule & Rates',
      '100 Interactive Copilot AI Queries',
      'Email & WhatsApp Summary Alerts',
    ],
  },
  ai_bidding_pro: {
    id: 'ai_bidding_pro',
    name: 'Bidding Pro & Execution Suite',
    price: 2499,
    periodDays: 30,
    cycle: 'monthly',
    popular: false,
    dossierCredits: 35,
    chatQueries: 350,
    description: 'For Class A/B engineering firms executing multiple public works.',
    features: [
      '35 Full AI Tender Dossiers per month',
      'Advanced Multi-Agent Engineering Intelligence',
      'Auto-generated Excel BOQ Line Items & Rates',
      'Subcontractor Work Packaging & Safety Specs',
      '350 Interactive Copilot AI Queries',
      'Direct WhatsApp Priority Desk Support',
    ],
  },
};

export class BillingService {
  getPlans() {
    return Object.values(PLANS);
  }

  async createCheckoutOrder(userId, planId) {
    const plan = PLANS[planId];
    if (!plan) {
      throw new Error(`Invalid plan selected: "${planId}".`);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    // Amount in paise (1 INR = 100 paise)
    const amountInPaise = plan.price * 100;
    const receipt = `rcpt_${userId.toString().slice(-6)}_${Date.now()}`;

    const order = await razorpayAdapter.createOrder({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: userId.toString(),
        planId: plan.id,
        userEmail: user.email,
      },
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      isMock: order.isMock,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
      },
      prefill: {
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email,
      },
    };
  }

  async verifyAndActivateSubscription(userId, { orderId, paymentId, signature, planId, phone }, isInternalWebhook = false) {
    const plan = PLANS[planId];
    if (!plan) {
      throw new Error(`Invalid plan selected: "${planId}".`);
    }

    if (env.NODE_ENV === 'production' && razorpayAdapter.isMockMode) {
      throw new Error('Payment gateway is not configured for production transactions.');
    }

    // 1. Replay prevention: verify this paymentId has not already been used for another subscription
    const existingPaymentSub = await Subscription.findOne({ gatewayPaymentId: paymentId });
    if (existingPaymentSub) {
      throw new Error('This payment transaction has already been redeemed.');
    }

    // 2. Verify cryptographic signature from Gateway
    if (!isInternalWebhook) {
      if (!signature || signature === 'webhook_verified') {
        throw new Error('Valid cryptographic payment signature is required.');
      }

      const isValidSignature = razorpayAdapter.verifyPaymentSignature({
        orderId,
        paymentId,
        signature,
      });

      if (!isValidSignature) {
        logger.warn(`Signature verification failed for user ${userId}, order ${orderId}`);
        throw new Error('Payment signature verification failed. Untrusted payment payload.');
      }
    }

    // 3. For live mode, verify that the payment was captured and amount matches the plan!
    if (!razorpayAdapter.isMockMode) {
      const paymentData = await razorpayAdapter.fetchPayment(paymentId);
      if (!paymentData || paymentData.status !== 'captured') {
        throw new Error('Payment transaction is not in captured status.');
      }
      const expectedAmountPaise = Math.round(plan.price * 100);
      if (paymentData.amount < expectedAmountPaise) {
        logger.error(`Plan tampering attempt: user ${userId} paid ${paymentData.amount} paise, but requested plan ${plan.id} (${expectedAmountPaise} paise)`);
        throw new Error('Paid amount does not match the required price for this plan.');
      }
    }

    // 2. Calculate period duration
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);

    // 3. Upsert / Activate Subscription
    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      subscription = new Subscription({
        userId,
        planId: plan.id,
        billingCycle: plan.cycle,
        amount: plan.price,
        status: 'active',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        gateway: razorpayAdapter.isMockMode ? 'mock_test' : 'razorpay',
        gatewayOrderId: orderId,
        gatewayPaymentId: paymentId,
      });
    } else {
      subscription.planId = plan.id;
      subscription.billingCycle = plan.cycle;
      subscription.amount = plan.price;
      subscription.status = 'active';
      subscription.currentPeriodStart = startDate;
      // If user had existing active time left, extend from currentPeriodEnd
      const baseEnd = subscription.currentPeriodEnd > startDate ? subscription.currentPeriodEnd : startDate;
      subscription.currentPeriodEnd = new Date(baseEnd.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);
      subscription.gatewayOrderId = orderId;
      subscription.gatewayPaymentId = paymentId;
      subscription.cancelAtPeriodEnd = false;
    }

    await subscription.save();

    // 4. Update user role if currently basic contractor
    await User.findByIdAndUpdate(userId, {
      role: 'contractor',
      'dailyTenderViews.viewsLimit': 'Unlimited',
    });

    // 5. Update contractor WhatsApp phone if provided
    if (phone) {
      await ContractorPreference.findOneAndUpdate(
        { userId },
        { $set: { whatsappPhone: phone, whatsappEnabled: true } },
        { upsert: true }
      ).catch(() => {});
    }

    // 5b. If AI Service Plan purchased, credit the contractor's AI wallet
    if (plan.dossierCredits) {
      let agentProfile = await ContractorAgentProfile.findOne({ userId });
      if (!agentProfile) {
        agentProfile = new ContractorAgentProfile({ userId });
      }
      agentProfile.credits.planTier = plan.id.replace('ai_', '');
      agentProfile.credits.availableDossiers = (agentProfile.credits.availableDossiers || 0) + plan.dossierCredits;
      agentProfile.credits.copilotQueriesLimit = (agentProfile.credits.copilotQueriesLimit || 0) + (plan.chatQueries || 50);
      agentProfile.credits.planExpiresAt = endDate;
      await agentProfile.save();
      logger.info(`AI credits topped up for user ${userId}: +${plan.dossierCredits} dossiers, +${plan.chatQueries} queries.`);
    }

    // 6. Asynchronously send WhatsApp payment receipt & confirmation
    const user = await User.findById(userId);
    whatsappNotificationService.sendPaymentReceipt({
      user,
      plan,
      subscription,
      paymentId,
      phone,
    }).catch((err) => logger.warn(`WhatsApp payment receipt dispatch skipped: ${err.message}`));

    logger.info(`Subscription activated for user ${userId} on plan ${plan.id} until ${subscription.currentPeriodEnd.toISOString()}`);

    return subscription;
  }

  async getUserSubscription(userId) {
    if (!userId) return null;
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      return {
        hasActiveSubscription: false,
        status: 'free',
        plan: null,
      };
    }

    const isActive = subscription.isValid();

    return {
      hasActiveSubscription: isActive,
      status: isActive ? subscription.status : 'expired',
      planId: subscription.planId,
      billingCycle: subscription.billingCycle,
      currentPeriodEnd: subscription.currentPeriodEnd,
      features: subscription.features,
    };
  }

  async handleWebhook(rawBody, signature, payload) {
    const isValid = razorpayAdapter.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new Error('Invalid Razorpay webhook signature.');
    }

    const { event } = payload || {};
    logger.info(`Received verified Razorpay webhook event: "${event}"`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderEntity = payload.payload?.order?.entity;

      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || orderEntity?.id;
      const notes = paymentEntity?.notes || orderEntity?.notes || {};
      const userId = notes.userId;
      const planId = notes.planId;
      const phone = notes.phone;

      if (userId && planId && orderId && paymentId) {
        // Prevent duplicate processing if already activated
        const existingSub = await Subscription.findOne({ gatewayPaymentId: paymentId });
        if (!existingSub) {
          logger.info(`Activating subscription via webhook for user ${userId}, plan ${planId}`);
          await this.verifyAndActivateSubscription(userId, {
            orderId,
            paymentId,
            signature: 'webhook_verified',
            planId,
            phone,
          }, true);
        } else {
          logger.info(`Webhook event already processed for payment ${paymentId}`);
        }
      }
    }

    return { received: true };
  }
}

export const billingService = new BillingService();
