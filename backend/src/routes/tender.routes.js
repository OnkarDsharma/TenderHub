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
import { aiAnalyzeLimiter } from '../middleware/rateLimiter.middleware.js';

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
 * Protected by authentication.
 */
router.get('/:id/zip', verifyToken, downloadTenderZip);

/**
 * @route GET /api/tenders/:id
 * Fetch a single tender document by its unique MongoDB ObjectId.
 * Strictly protected by authentication and limited to 10 tender detail views per day per user.
 */
router.get('/:id', verifyToken, getTenderById);

/**
 * @route POST /api/tenders/:id/analyze
 * Trigger the background AI worker to process a specific tender.
 * Strictly protected by authentication and rate limiting.
 */
router.post('/:id/analyze', verifyToken, aiAnalyzeLimiter, triggerAiAnalysis);

export default router;
