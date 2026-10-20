import express from 'express';
import {
  getAiPlans,
  getContractorProfile,
  updateContractorProfile,
  analyzeTender,
  getTenderDossier,
  postCopilotChat,
  getMyDossiers,
} from '../controllers/services.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { aiAnalyzeLimiter, aiDossierLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public routes (pricing and plan comparison)
router.get('/plans', getAiPlans);

// Authenticated / Test-bypass contractor routes
router.use(verifyToken);

router.get('/contractor-profile', getContractorProfile);
router.put('/contractor-profile', updateContractorProfile);

router.post('/analyze', aiDossierLimiter, analyzeTender);
router.post('/analyze/:tenderId', aiDossierLimiter, analyzeTender);
router.post('/analyze/*splat', aiDossierLimiter, analyzeTender);

router.get('/dossier', getTenderDossier);
router.get('/dossier/:tenderId', getTenderDossier);
router.get('/dossier/*splat', getTenderDossier);

router.post('/chat', aiAnalyzeLimiter, postCopilotChat);
router.post('/chat/:tenderId', aiAnalyzeLimiter, postCopilotChat);
router.post('/chat/*splat', aiAnalyzeLimiter, postCopilotChat);

router.get('/my-dossiers', getMyDossiers);

export default router;
