/**
 * @file backend/src/routes/prerender.routes.js
 * @description Crawler HTML for tender detail pages ("dynamic rendering").
 *
 * The frontend host (vercel.json) rewrites /tenders/:id and /gem-tenders/:id
 * to these routes ONLY when the User-Agent is a search-engine or link-preview
 * crawler; humans always get the React app. Mounted before the blacklist and
 * rate limiter because requests arrive via the frontend proxy, so they share
 * its IP addresses. HTML is cached in Redis for an hour (fail-open).
 */
import express from 'express';
import pino from 'pino';
import { redis } from '../config/redis.js';
import { findTender, findSimilarOpen, renderTenderPage, renderNotFound, renderLandingPage, pathFor } from '../services/prerender.service.js';
import { landingWithSeo } from './seo.routes.js';
import { siteUrl } from '../services/sitemap.service.js';

const router = express.Router();
const logger = pino();

const CACHE_TTL_SECONDS = 60 * 60;
const CACHE_PREFIX = 'prerender:v2:'; // bump when crawler HTML changes
const MAX_ID_LENGTH = 120;

async function readCache(key) {
  try {
    return await redis.get(`${CACHE_PREFIX}${key}`);
  } catch (err) {
    logger.warn(`[Prerender] Redis read failed: ${err.message}`);
    return null;
  }
}

function writeCache(key, html) {
  redis.setex(`${CACHE_PREFIX}${key}`, CACHE_TTL_SECONDS, html).catch((err) =>
    logger.warn(`[Prerender] Redis write failed: ${err.message}`)
  );
}

function sendHtml(res, status, html) {
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    // Never let a CDN cache this: the same URL serves the React app to humans.
    'Cache-Control': 'private, no-cache',
    Vary: 'User-Agent',
  });
  res.status(status).send(html);
}

const handler = (section) => async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const publicPath = `/${section}/${encodeURIComponent(id)}`;
    if (!id || id.length > MAX_ID_LENGTH) return sendHtml(res, 404, renderNotFound(publicPath));

    const cacheKey = `${section}:${id}`;
    const cached = await readCache(cacheKey);
    if (cached) {
      const [status, body] = [Number(cached.slice(0, 3)), cached.slice(3)];
      if (status === 301) return res.redirect(301, body);
      return sendHtml(res, status, body);
    }

    const tender = await findTender(id);
    if (!tender) {
      const html = renderNotFound(publicPath);
      writeCache(cacheKey, `404${html}`);
      return sendHtml(res, 404, html);
    }

    // One official URL per tender: old id-only links, outdated slugs, tender
    // numbers, or a GeM bid opened under /tenders/ all 301 to the canonical path.
    const canonicalPath = pathFor(tender);
    if (decodeURIComponent(publicPath) !== decodeURIComponent(canonicalPath)) {
      const location = `${siteUrl()}${canonicalPath}`;
      writeCache(cacheKey, `301${location}`);
      return res.redirect(301, location);
    }

    const similar = await findSimilarOpen(tender).catch((err) => {
      logger.warn(`[Prerender] similar-tender lookup failed for ${id}: ${err.message}`);
      return [];
    });
    const html = renderTenderPage(tender, similar);
    writeCache(cacheKey, `200${html}`);
    return sendHtml(res, 200, html);
  } catch (err) {
    return next(err);
  }
};

const landingHandler = (kind) => async (req, res, next) => {
  try {
    const { state, dept } = req.params;
    const requested = `/${kind === 'gem' ? 'gem-tenders' : 'tenders'}/in/${state}${dept ? `/${dept}` : ''}`;
    const data = await landingWithSeo(kind, String(state).slice(0, 60), dept ? String(dept).slice(0, 120) : undefined);
    if (!data) return sendHtml(res, 404, renderNotFound(requested, 'page'));
    // Earlier or alternative department URLs (e.g. /haudd) 301 to the readable one.
    if (requested.toLowerCase() !== data.path) return res.redirect(301, `${siteUrl()}${data.path}`);
    return sendHtml(res, 200, renderLandingPage(data, data.seo, data.path));
  } catch (err) {
    return next(err);
  }
};

router.get('/prerender/landing/tenders/:state', landingHandler('tenders'));
router.get('/prerender/landing/tenders/:state/:dept', landingHandler('tenders'));
router.get('/prerender/landing/gem/:state', landingHandler('gem'));
router.get('/prerender/tenders/:id', handler('tenders'));
router.get('/prerender/gem-tenders/:id', handler('gem-tenders'));

export default router;
