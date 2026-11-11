/**
 * @file backend/src/routes/sitemap.routes.js
 * @description Public XML sitemaps for search engines. Mounted at the app root,
 * before the IP blacklist and rate limiter, so crawlers are never blocked here.
 * The frontend host proxies /sitemap*.xml to these routes so the files live on
 * the same domain as the pages they list (a search engine requirement).
 *
 * Responses are cached in Redis for an hour; if Redis is unavailable the XML
 * is generated directly (fail open) so a cache outage never hides the sitemap.
 */
import express from 'express';
import pino from 'pino';
import { redis } from '../config/redis.js';
import {
  generateSitemapIndex,
  generateStaticSitemap,
  generateSectionSitemap,
} from '../services/sitemap.service.js';

const router = express.Router();
const logger = pino();

const CACHE_TTL_SECONDS = 60 * 60;
const CACHE_PREFIX = 'sitemap:v1:';

async function cached(key, build) {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) return hit;
  } catch (err) {
    logger.warn(`[Sitemap] Redis read failed for ${key}: ${err.message}`);
  }

  const xml = await build();
  if (xml) {
    redis.setex(cacheKey, CACHE_TTL_SECONDS, xml).catch((err) =>
      logger.warn(`[Sitemap] Redis write failed for ${key}: ${err.message}`)
    );
  }
  return xml;
}

function sendXml(res, xml) {
  res.set({
    'Content-Type': 'application/xml; charset=utf-8',
    // Shared caches (CDN / frontend proxy) can hold it for the same hour as Redis.
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    // The sitemap itself should never appear in search results.
    'X-Robots-Tag': 'noindex',
  });
  res.status(200).send(xml);
}

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    sendXml(res, await cached('index', generateSitemapIndex));
  } catch (err) {
    next(err);
  }
});

router.get('/sitemap-static.xml', async (req, res, next) => {
  try {
    sendXml(res, await cached('static', async () => generateStaticSitemap()));
  } catch (err) {
    next(err);
  }
});

router.get('/sitemap-:section-:page.xml', async (req, res, next) => {
  try {
    const { section } = req.params;
    const page = Number(req.params.page);
    if (!['tenders', 'gem'].includes(section) || !/^\d+$/.test(req.params.page)) {
      return res.status(404).type('text/plain').send('Sitemap not found');
    }
    const xml = await cached(`${section}:${page}`, () => generateSectionSitemap(section, page));
    if (!xml) return res.status(404).type('text/plain').send('Sitemap not found');
    return sendXml(res, xml);
  } catch (err) {
    return next(err);
  }
});

export default router;
