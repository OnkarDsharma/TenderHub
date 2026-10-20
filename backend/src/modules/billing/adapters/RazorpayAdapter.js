/**
 * @file backend/src/modules/billing/adapters/RazorpayAdapter.js
 * @description Razorpay payment gateway implementation with automatic mock fallback.
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import pino from 'pino';
import { IPaymentGateway } from './IPaymentGateway.js';
import { env } from '../../../config/env.js';

const logger = pino();

export class RazorpayAdapter extends IPaymentGateway {
  constructor() {
    super();
    this.keyId = env.RAZORPAY_KEY_ID;
    this.keySecret = env.RAZORPAY_KEY_SECRET;
    this.isMockMode = !this.keyId || !this.keySecret;

    if (!this.isMockMode) {
      this.client = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
      logger.info('Razorpay Adapter initialized in LIVE/TEST mode.');
    } else {
      logger.warn('Razorpay keys not detected in .env. Razorpay Adapter running in MOCK mode for development.');
    }
  }

  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    if (this.isMockMode) {
      const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      logger.info(`[MockRazorpay] Generated mock order: ${mockOrderId} for amount ₹${amount / 100}`);
      return {
        orderId: mockOrderId,
        amount,
        currency,
        keyId: 'rzp_mock_key_test',
        isMock: true,
      };
    }

    try {
      const order = await this.client.orders.create({
        amount: Math.round(amount), // in paise
        currency,
        receipt,
        notes,
      });

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: this.keyId,
        isMock: false,
      };
    } catch (err) {
      logger.error(`Razorpay order creation failed: ${err.message}`);
      throw new Error(`Payment gateway order error: ${err.message}`);
    }
  }

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (this.isMockMode) {
      if (env.NODE_ENV === 'production') {
        logger.error('CRITICAL: Attempted mock payment signature verification in PRODUCTION environment.');
        return false;
      }
      return signature === 'mock_valid_signature' || signature?.startsWith('mock_');
    }

    try {
      if (!signature || typeof signature !== 'string') return false;
      const body = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(body.toString())
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const sigBuf = Buffer.from(signature, 'utf8');
      if (expectedBuf.length !== sigBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, sigBuf);
    } catch (err) {
      logger.error(`Signature verification failed: ${err.message}`);
      return false;
    }
  }

  verifyWebhookSignature(rawBody, signature) {
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      if (env.NODE_ENV === 'production') {
        logger.error('CRITICAL: RAZORPAY_WEBHOOK_SECRET is not configured in production. Rejecting webhook.');
        return false;
      }
      logger.warn('RAZORPAY_WEBHOOK_SECRET is not configured. Webhook verification bypassed for dev.');
      return true;
    }

    if (!signature || typeof signature !== 'string') {
      logger.error('Missing or invalid X-Razorpay-Signature header in webhook request.');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(typeof rawBody === 'string' ? rawBody : (rawBody?.toString('utf8') || ''))
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const sigBuf = Buffer.from(signature, 'utf8');
      if (expectedBuf.length !== sigBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, sigBuf);
    } catch (err) {
      logger.error(`Webhook signature verification error: ${err.message}`);
      return false;
    }
  }

  async fetchPayment(paymentId) {
    if (this.isMockMode) {
      return {
        id: paymentId,
        status: 'captured',
        method: 'upi',
        amount: 39900,
      };
    }

    return await this.client.payments.fetch(paymentId);
  }
}

export const razorpayAdapter = new RazorpayAdapter();
