import { Router } from 'express';
import { joinWaitlist } from '../controllers/waitlist.controller.js';
import { waitlistLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();
router.post('/', waitlistLimiter, joinWaitlist);

export default router;
