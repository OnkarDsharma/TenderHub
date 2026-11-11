/**
 * @file backend/src/routes/seo.routes.js
 * @description JSON endpoints behind SEO features in the React app:
 *   GET /api/v1/seo/landing/tenders/:state           state landing page
 *   GET /api/v1/seo/landing/tenders/:state/:dept     department landing page
 *   GET /api/v1/seo/landing/gem/:state               GeM state landing page
 *   GET /api/v1/seo/similar/:id                      similar open tenders for a detail page
 * Responses are Redis-cached (fail-open) because the aggregations are shared by
 * every visitor and change only as scrapers add tenders.
 */
import express from 'express';
import pino from 'pino';
import { redis } from '../config/redis.js';
import { getLanding, landingSeo, landingPath } from '../services/landing.service.js';
import { findTender, findSimilarOpen } from '../services/prerender.service.js';

const router = express.Router();
const logger = pino();
const CACHE_PREFIX = 'seo:v1:';

async function cachedJson(key, ttlSeconds, build) {
  try {
    const hit = await redis.get(`${CACHE_PREFIX}${key}`);
    if (hit) return JSON.parse(hit);
  } catch (err) {
    logger.warn(`[SEO] Redis read failed for ${key}: ${err.message}`);
  }
  const value = await build();
  redis.setex(`${CACHE_PREFIX}${key}`, ttlSeconds, JSON.stringify(value)).catch((err) =>
    logger.warn(`[SEO] Redis write failed for ${key}: ${err.message}`)
  );
  return value;
}

/** Landing data plus its SEO strings and path, or null (cached as null too). */
export const landingWithSeo = (kind, state, dept) =>
  cachedJson(`landing:${kind}:${state}:${dept || ''}`, 60 * 60, async () => {
    const data = await getLanding(kind, state, dept);
    return data ? { ...data, seo: landingSeo(data), path: landingPath(kind, data.state.slug, data.department?.slug) } : null;
  });

const landingHandler = (kind) => async (req, res, next) => {
  try {
    const { state, dept } = req.params;
    const data = await landingWithSeo(kind, String(state).slice(0, 60), dept ? String(dept).slice(0, 120) : undefined);
    if (!data) return res.status(404).json({ error: 'Page not found' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
};

router.get('/landing/tenders/:state', landingHandler('tenders'));
router.get('/landing/tenders/:state/:dept', landingHandler('tenders'));
router.get('/landing/gem/:state', landingHandler('gem'));

router.get('/similar/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').slice(0, 120);
    const similar = await cachedJson(`similar:${id}`, 60 * 60, async () => {
      const tender = await findTender(id);
      return tender ? findSimilarOpen(tender) : null;
    });
    if (!similar) return res.status(404).json({ error: 'Tender not found' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ data: similar });
  } catch (err) {
    return next(err);
  }
});

export default router;
