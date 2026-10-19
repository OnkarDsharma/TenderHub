/**
 * @file backend/src/modules/notifications/adapters/AiSensyWhatsAppAdapter.js
 * @description Official AiSensy WhatsApp Business API adapter for Indian payment & alert delivery.
 */
import pino from 'pino';
import { IWhatsAppProvider } from './IWhatsAppProvider.js';
import { env } from '../../../config/env.js';

const logger = pino();

export class AiSensyWhatsAppAdapter extends IWhatsAppProvider {
  constructor() {
    super();
    this.apiKey = env.AISENSY_API_KEY;
    this.campaignName = env.AISENSY_CAMPAIGN_NAME || 'tender_alert';
    this.isMockMode = !this.apiKey;

    if (!this.isMockMode) {
      logger.info('AiSensy WhatsApp Adapter initialized in LIVE mode.');
    } else {
      logger.warn('AISENSY_API_KEY not set in .env. Running in MOCK mode.');
    }
  }

  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return `91${cleaned}`;
    return cleaned;
  }

  /**
   * Send tender alert via AiSensy
   */
  async sendTenderAlert({ phone, tender, user }) {
    const formattedPhone = this.formatPhone(phone);
    if (!formattedPhone) throw new Error('Valid WhatsApp phone number required.');

    const tenderTitle = tender.title || tender.workDescription || 'New Tender Notice';
    const dept = tender.department || tender.organisationChain || 'Government of J&K';
    const valueStr = tender.tenderValueFormatted || (tender.tenderValue ? `₹${tender.tenderValue.toLocaleString('en-IN')}` : 'Notice');
    const closingDate = tender.closingDateFormatted || tender.bidSubmissionEndDate || 'Refer Document';
    const portalUrl = `${env.FRONTEND_URL}/tenders/${tender._id || tender.tenderId}`;

    const textSummary = 
      `🚨 *NEW TENDER ALERT — TenderHub J&K*\n\n` +
      `📋 *Title:* ${tenderTitle.slice(0, 140)}...\n` +
      `🏛️ *Department:* ${dept}\n` +
      `💰 *Estimated Value:* ${valueStr}\n` +
      `📅 *Bid Submission Deadline:* ${closingDate}\n\n` +
      `👉 *View Full Details & BOQ:* ${portalUrl}\n\n` +
      `_TenderHub J&K • Real-Time Contractor Intelligence_` + (user?.weeklyQuotaFooter ? `\n\n${user.weeklyQuotaFooter}` : '');

    if (this.isMockMode) {
      logger.info(`\n[AISENSY MOCK TENDER ALERT to ${formattedPhone}]:\n${textSummary}\n`);
      return { success: true, messageId: `mock_aisensy_${Date.now()}`, isMock: true };
    }

    try {
      const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName: this.campaignName,
          destination: formattedPhone,
          userName: user?.name || 'Contractor',
          templateParams: [
            tenderTitle.slice(0, 60),
            dept.slice(0, 40),
            valueStr,
            closingDate,
            portalUrl,
            user?.weeklyQuotaFooter || ''
          ],
          source: 'tenderhub-alert-engine'
        }),
      });

      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        throw new Error(data.message || 'AiSensy API error');
      }

      return { success: true, messageId: data.messageId || data.id, isMock: false };
    } catch (err) {
      logger.error(`AiSensy delivery error to ${formattedPhone}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Send payment confirmation and subscription activation details directly to WhatsApp
   */
  async sendPaymentConfirmation({ phone, user, plan, subscription, paymentId }) {
    const formattedPhone = this.formatPhone(phone);
    if (!formattedPhone) return { success: false, error: 'No phone number provided' };

    const validUntil = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const receiptMessage = 
      `🎉 *PAYMENT SUCCESSFUL! Welcome to TenderHub Pro*\n\n` +
      `Dear ${user?.name || 'Contractor'},\n` +
      `Thank you for subscribing. Your account has been upgraded to *${plan.name}*.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 *Amount Paid:* ₹${plan.price}\n` +
      `🆔 *Payment Reference:* ${paymentId}\n` +
      `📅 *Subscription Active Until:* ${validUntil}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *Your Pro Benefits Are Now Live:*\n` +
      `• Unlimited Tender Views & Full Pagination across J&K\n` +
      `• Instant BOQ Excel & Price Schedule Downloads\n` +
      `• Automated WhatsApp alerts for your chosen departments\n` +
      `• Corrigendum & Bid Extension updates\n\n` +
      `👉 *Access Your Dashboard:* ${env.FRONTEND_URL}/profile\n\n` +
      `_Need support? Reply directly to this WhatsApp message._`;

    if (this.isMockMode) {
      logger.info(`\n[AISENSY MOCK PAYMENT RECEIPT to ${formattedPhone}]:\n${receiptMessage}\n`);
      return { success: true, messageId: `mock_receipt_${Date.now()}`, isMock: true };
    }

    try {
      const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName: 'payment_confirmation', // or your transactional template name
          destination: formattedPhone,
          userName: user?.name || 'Contractor',
          templateParams: [
            plan.name,
            `₹${plan.price}`,
            paymentId,
            validUntil,
            `${env.FRONTEND_URL}/profile`
          ],
          source: 'tenderhub-billing'
        }),
      });

      const data = await response.json();
      return { success: response.ok, messageId: data.messageId || data.id };
    } catch (err) {
      logger.error(`AiSensy payment confirmation failed for ${formattedPhone}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendDailyDigest({ phone, tenders, user }) {
    return await this.sendTenderAlert({ phone, tender: tenders[0], user });
  }

  async sendTextMessage({ phone, message }) {
    const formattedPhone = this.formatPhone(phone);
    if (this.isMockMode) {
      logger.info(`\n[AISENSY MOCK TEXT to ${formattedPhone}]:\n${message}\n`);
      return { success: true, messageId: `mock_text_${Date.now()}`, isMock: true };
    }

    try {
      const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName: this.campaignName || 'test_alert',
          destination: formattedPhone,
          userName: 'Contractor',
          templateParams: [message],
        }),
      });
      const data = await response.json();
      if (!response.ok || data.status === 'error' || data.errorCode) {
        logger.error(`AiSensy test message failed: ${data.message || data.errorMessage || JSON.stringify(data)}`);
        return { 
          success: false, 
          error: data.message || data.errorMessage || 'AiSensy delivery error',
          details: data 
        };
      }
      return { success: true, messageId: data.messageId };
    } catch (err) {
      logger.error(`AiSensy request exception: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

export const aiSensyWhatsAppAdapter = new AiSensyWhatsAppAdapter();
