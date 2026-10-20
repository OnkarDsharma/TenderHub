import express from 'express';
import {
  getTenders,
  getTenderStats, // Imported the newly created stats controller
  getTenderById,
  downloadTenderZip,
  streamTenderDocument,
  triggerAiAnalysis
} from '../controllers/tender.controller.js';
import { verifyToken, optionalAuth } from '../middleware/auth.middleware.js';
import { aiDossierLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

/**
 * @route GET /api/tenders
 * Fetch a paginated list of all tenders (safe summary projected, guest pagination capped).
 */
router.get('/', optionalAuth, getTenders);

/**
 * @route GET /api/tenders/stats
 * Fetch real-time aggregated statistics for the dashboard.
 * 
 * CRITICAL ROUTE ORDERING: This static route MUST be placed BEFORE the 
 * dynamic '/:id' route. Otherwise, Express will mistakenly treat the word 
 * "stats" as a document ID and pass it to getTenderById, causing a database error.
 */
router.get('/stats', getTenderStats);

// Public tender documents are streamed from the private R2 bucket by the API.
router.get('/:id/documents/:kind/:index', streamTenderDocument);

/**
 * @route GET /api/tenders/:id/zip
 * Stream the ZIP archive directly with CORS headers to avoid client browser CORS blocks.
 * Accessible to all visitors.
 */
router.get('/:id/zip', optionalAuth, downloadTenderZip);

/**
 * @route GET /api/tenders/:id
 * Fetch a single tender document by its unique MongoDB ObjectId or sourceTenderId.
 * Unrestricted access for all visitors.
 */
router.get('/:id', optionalAuth, getTenderById);

/**
 * @route POST /api/tenders/:id/analyze
 * Trigger the background AI worker to process a specific tender.
 * Strictly protected by authentication and rate limiting.
 */
router.post('/:id/analyze', verifyToken, aiDossierLimiter, triggerAiAnalysis);

export default router;
