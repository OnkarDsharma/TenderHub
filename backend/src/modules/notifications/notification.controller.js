/**
 * @file backend/src/modules/notifications/notification.controller.js
 * @description HTTP controllers for contractor WhatsApp notification preferences and test alerts.
 */
import ContractorPreference from './models/ContractorPreference.js';
import { whatsappNotificationService } from './services/whatsapp.service.js';
import User from '../../models/User.js';

export const getPreferences = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let pref = await ContractorPreference.findOne({ userId });
    if (!pref) {
      pref = await ContractorPreference.create({
        userId,
        whatsappPhone: '',
        whatsappEnabled: true,
        departments: [],
        districts: [],
        keywords: [],
        minValue: 0,
      });
    }

    return res.status(200).json({ success: true, preferences: pref });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updatePreferences = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const {
      whatsappPhone,
      whatsappEnabled,
      departments,
      districts,
      keywords,
      minValue,
      maxValue,
      instantAlerts,
      dailyDigest,
    } = req.body;

    let pref = await ContractorPreference.findOne({ userId });
    if (!pref) {
      pref = new ContractorPreference({ userId });
    }

    if (whatsappPhone !== undefined) pref.whatsappPhone = whatsappPhone;
    if (whatsappEnabled !== undefined) pref.whatsappEnabled = Boolean(whatsappEnabled);
    if (departments !== undefined) pref.departments = Array.isArray(departments) ? departments : [];
    if (districts !== undefined) pref.districts = Array.isArray(districts) ? districts : [];
    if (keywords !== undefined) pref.keywords = Array.isArray(keywords) ? keywords : [];
    if (minValue !== undefined) pref.minValue = Number(minValue) || 0;
    if (maxValue !== undefined) pref.maxValue = Number(maxValue) || 0;
    if (instantAlerts !== undefined) pref.instantAlerts = Boolean(instantAlerts);
    if (dailyDigest !== undefined) pref.dailyDigest = Boolean(dailyDigest);

    await pref.save();

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully.',
      preferences: pref,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const sendTestAlert = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { phone } = req.body;

    const user = await User.findById(userId);
    const targetPhone = phone || req.user?.phone;

    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number for WhatsApp verification.',
      });
    }

    const result = await whatsappNotificationService.sendTestMessage(targetPhone, user);

    if (!result?.success && !result?.isMock) {
      return res.status(400).json({
        success: false,
        message: result?.error || 'WhatsApp provider returned a failure.',
        details: result?.details,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Test alert dispatched to ${targetPhone}.`,
      result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
