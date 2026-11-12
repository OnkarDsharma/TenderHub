/**
 * @file backend/src/routes/contractor.routes.js
 * @description Routes for accessing and updating contractor profiles, preferences,
 * and saved tenders stored in MongoDB with contractor-level data scoping.
 */
import { Router } from 'express';
import {
  getContractorProfile,
  updateContractorProfile,
  getContractorPreferences,
  updateContractorPreferences,
  getSavedTenders,
  toggleSavedTender,
  syncSavedTenders,
} from '../controllers/contractor.controller.js';
import { getTenderAlerts, markTenderAlertsRead } from '../controllers/tenderAlert.controller.js';
import { optionalAuth, verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

// Profile & Preferences (reading supports guest preview; updating strictly requires authentication)
router.get('/profile', optionalAuth, getContractorProfile);
router.put('/profile', verifyToken, updateContractorProfile);
router.get('/preferences', optionalAuth, getContractorPreferences);
router.put('/preferences', verifyToken, updateContractorPreferences);

// Contractor-scoped Saved Tenders (Bookmarks)
router.get('/saved-tenders', optionalAuth, getSavedTenders);
router.post('/saved-tenders/toggle', verifyToken, toggleSavedTender);
router.post('/saved-tenders/sync', verifyToken, syncSavedTenders);

// Alerts when a saved tender moves on the portal (new stage, awarded, cancelled)
router.get('/alerts', optionalAuth, getTenderAlerts);
router.post('/alerts/read', verifyToken, markTenderAlertsRead);

export default router;
