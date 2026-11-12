/**
 * @file backend/src/models/TenderAlert.js
 * @description In-app alert for a user whose saved tender moved on the portal's Tenders Status page
 * (new stage reached, contract awarded, or cancelled). Written by JKTenderStatusAdapter, read by the
 * navbar bell (GET /contractor/alerts).
 */
import mongoose from 'mongoose';

const ALERT_TTL_DAYS = 120;

const tenderAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
  // Copied so the bell can render without loading the tender.
  sourceTenderId: String,
  title: String,
  kind: { type: String, enum: ['STAGE', 'AWARDED', 'CANCELLED'], default: 'STAGE' },
  previousStage: String,
  currentStage: String,
  // Stages newly completed since the previous check, e.g. ['Financial Bid Opening'].
  completedStages: [String],
  // The tender's stageSignature at alert time: one alert per user per portal state.
  signature: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

tenderAlertSchema.index({ userId: 1, tenderId: 1, signature: 1 }, { unique: true });
tenderAlertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
tenderAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: ALERT_TTL_DAYS * 24 * 60 * 60 });

export default mongoose.model('TenderAlert', tenderAlertSchema);
