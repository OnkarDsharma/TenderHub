/**
 * @file backend/src/modules/billing/billing.controller.js
 * @description HTTP controllers for plans, checkout initialization, and payment callbacks.
 */
import { billingService } from './billing.service.js';

export const getPlans = async (req, res) => {
  try {
    const plans = billingService.getPlans();
    return res.status(200).json({ success: true, plans });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createCheckoutOrder = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { planId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!planId) {
      return res.status(400).json({ success: false, message: 'planId is required.' });
    }

    const orderData = await billingService.createCheckoutOrder(userId, planId);
    return res.status(200).json({ success: true, ...orderData });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { orderId, paymentId, signature, planId, phone } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!orderId || !paymentId || !signature || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters (orderId, paymentId, signature, planId).',
      });
    }

    const subscription = await billingService.verifyAndActivateSubscription(userId, {
      orderId,
      paymentId,
      signature,
      planId,
      phone,
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription successfully activated! All Pro features unlocked.',
      subscription,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(200).json({ success: true, subscription: { hasActiveSubscription: false, status: 'free' } });
    }

    const subscription = await billingService.getUserSubscription(userId);
    return res.status(200).json({ success: true, subscription });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);
    await billingService.handleWebhook(rawBody, signature, req.body);
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
};
