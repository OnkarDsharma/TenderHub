/**
 * @file backend/src/controllers/tenderAlert.controller.js
 * @description In-app alerts for saved tenders that moved on the portal (new stage, awarded, cancelled).
 * Alerts are created by the daily tender status scraper (JKTenderStatusAdapter.alertSavers).
 */
import mongoose from 'mongoose';
import TenderAlert from '../models/TenderAlert.js';

const LIST_LIMIT = 30;

/** GET /contractor/alerts — latest alerts plus the unread count for the bell. Guests get an empty list. */
export const getTenderAlerts = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(200).json({ success: true, unreadCount: 0, data: [] });

    const [data, unreadCount] = await Promise.all([
      TenderAlert.find({ userId }).sort({ createdAt: -1 }).limit(LIST_LIMIT).select('-__v -userId -signature').lean(),
      TenderAlert.countDocuments({ userId, isRead: false }),
    ]);
    return res.status(200).json({ success: true, unreadCount, data });
  } catch (error) {
    next(error);
  }
};

/** POST /contractor/alerts/read — body { ids?: string[] }; without ids marks all as read. */
export const markTenderAlertsRead = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)) : null;
    const filter = { userId, isRead: false, ...(ids ? { _id: { $in: ids } } : {}) };
    const result = await TenderAlert.updateMany(filter, { $set: { isRead: true } });
    const unreadCount = await TenderAlert.countDocuments({ userId, isRead: false });
    return res.status(200).json({ success: true, updated: result.modifiedCount || 0, unreadCount });
  } catch (error) {
    next(error);
  }
};
