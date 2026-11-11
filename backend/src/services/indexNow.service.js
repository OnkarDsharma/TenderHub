/**
 * @file backend/src/services/indexNow.service.js
 * @description Tells IndexNow search engines (Bing, and through it DuckDuckGo,
 * Yahoo, Copilot and ChatGPT search; also Yandex, Seznam, Naver) about new
 * tender pages within minutes of them being scraped, instead of waiting for
 * the next crawl. Google does not use IndexNow; it relies on the sitemap.
 *
 * Runs every 30 minutes from the scheduler. Scrapers run both in this server
 * and in GitHub Actions, so rather than hooking each scraper this job looks
 * for tenders created since its last run (marker kept in Redis).
 *
 * The key is public by design: the same value is served at
 * https://www.tndrr.com/<key>.txt (frontend/public) to prove site ownership.
 */
import axios from 'axios';
import pino from 'pino';
import Tender from '../models/Tender.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { siteUrl, activeTenderFilter, activeGemFilter } from './sitemap.service.js';
import { tenderPath } from '../utils/tenderUrl.js';

const logger = pino();

export const INDEXNOW_KEY = env.INDEXNOW_KEY || 'a91c047ba7854f0d4297cc387e2f0cdf';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MARKER_KEY = 'indexnow:last-created-at';
const MAX_URLS_PER_REQUEST = 10000;
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_URLS_PER_RUN = 20000;

/**
 * Submits URLs to IndexNow in batches.
 * @param {string[]} urls absolute URLs on the site's host
 * @param {{post: Function}} [http] injectable for tests
 * @returns {Promise<number>} number of URLs accepted (2xx)
 */
export async function submitUrls(urls, http = axios) {
  if (!urls.length) return 0;
  const base = siteUrl();
  const host = new URL(base).host;
  let accepted = 0;
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    const batch = urls.slice(i, i + MAX_URLS_PER_REQUEST);
    const res = await http.post(
      INDEXNOW_ENDPOINT,
      { host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList: batch },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' }, timeout: 30000, validateStatus: () => true }
    );
    if (res.status >= 200 && res.status < 300) {
      accepted += batch.length;
    } else {
      // 403 = key file not reachable yet, 422 = URLs not on host, 429 = slow down
      logger.warn(`[IndexNow] batch of ${batch.length} rejected: HTTP ${res.status}`);
    }
  }
  return accepted;
}

/**
 * Finds open tenders and GeM bids created since the last run and submits
 * their URLs. Only runs in production with a real https SITE_URL.
 * @returns {Promise<{submitted: number, found: number}|null>} null when skipped
 */
export async function submitNewTenders({ http = axios, now = new Date() } = {}) {
  if (env.NODE_ENV !== 'production' || env.INDEXNOW_DISABLED === 'true') return null;
  let base;
  try {
    base = siteUrl();
  } catch {
    return null; // SITE_URL not configured
  }

  const stored = await redis.get(MARKER_KEY).catch(() => null);
  const since = stored ? new Date(stored) : new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);

  const createdSince = { createdAt: { $gt: since, $lte: now } };
  const [tenders, gem] = await Promise.all([
    Tender.find({ ...activeTenderFilter(now), ...createdSince }).select('_id title sourcePortal sourceTenderId departmentCode').limit(MAX_URLS_PER_RUN).lean(),
    Tender.find({ ...activeGemFilter(now), ...createdSince }).select('_id title sourcePortal sourceTenderId departmentCode').limit(MAX_URLS_PER_RUN).lean(),
  ]);
  const urls = [...tenders, ...gem].slice(0, MAX_URLS_PER_RUN).map((t) => `${base}${tenderPath(t)}`);

  const submitted = await submitUrls(urls, http);
  // Advance the marker only when everything found was accepted, so a failed
  // run is retried next time instead of silently skipping those tenders.
  if (submitted === urls.length) await redis.set(MARKER_KEY, now.toISOString()).catch(() => {});
  if (urls.length) logger.info(`[IndexNow] submitted ${submitted}/${urls.length} new tender URLs`);
  return { submitted, found: urls.length };
}
