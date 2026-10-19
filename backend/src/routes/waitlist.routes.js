import { Router } from 'express';
import { joinWaitlist } from '../controllers/waitlist.controller.js';

const router = Router();
router.post('/', joinWaitlist);

export default router;
