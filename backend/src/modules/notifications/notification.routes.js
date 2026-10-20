/**
 * @file backend/src/modules/notifications/notification.routes.js
 * @description API routes for contractor WhatsApp alert preferences and testing.
 */
import express from 'express';
import { 
  getPreferences, 
  updatePreferences, 
  sendTestAlert 
} from './notification.controller.js';
import { verifyToken } from '../../middleware/auth.middleware.js';
import { notificationLimiter } from '../../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/preferences', verifyToken, getPreferences);
router.put('/preferences', verifyToken, updatePreferences);
router.post('/test', verifyToken, notificationLimiter, sendTestAlert);

export default router;
