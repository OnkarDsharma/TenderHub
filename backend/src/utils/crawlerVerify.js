/**
 * @file backend/src/utils/crawlerVerify.js
 * @description Identifies genuine search-engine crawlers so the bot shield
 * (IP blacklist, rate limiter, scraper User-Agent filter, honeypot) never
 * blocks them.
 *
 * A User-Agent alone is trivially faked, so a request only counts as a
 * verified crawler when BOTH hold (the method Google and Bing document):
 *   1. reverse DNS of the IP ends in the engine's official domain, and
 *   2. forward DNS of that hostname resolves back to the same IP.
 *
 * DNS is only consulted when the User-Agent claims to be a known crawler, and
 * results are cached per IP, so ordinary traffic pays nothing.
 */
import dns from 'node:dns/promises';

/** Crawler families: User-Agent pattern + hostname suffixes DNS must end in. */
export const CRAWLERS = [
  {
    name: 'google',
    ua: /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google|Mediapartners-Google|Google-Extended/i,
    hosts: ['.googlebot.com', '.google.com', '.googleusercontent.com'],
  },
  { name: 'bing', ua: /bingbot|BingPreview|msnbot|adidxbot/i, hosts: ['.search.msn.com'] },
  { name: 'duckduckgo', ua: /DuckDuckBot/i, hosts: ['.duckduckgo.com'] },
  { name: 'yandex', ua: /YandexBot|YandexMobileBot/i, hosts: ['.yandex.ru', '.yandex.net', '.yandex.com'] },
  { name: 'apple', ua: /Applebot/i, hosts: ['.applebot.apple.com'] },
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const DNS_TIMEOUT_MS = 2000;

const cache = new Map(); // ip -> { name: string|null, expires: number }

/** Exposed for tests. */
export const _resetCrawlerCache = () => cache.clear();

/** Returns the crawler family a User-Agent claims to be, or null. */
export const claimedCrawler = (userAgent = '') => CRAWLERS.find((c) => c.ua.test(userAgent)) || null;

const withTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS)),
  ]);

const normalizeIp = (ip = '') => (ip.startsWith('::ffff:') ? ip.slice(7) : ip);

/**
 * Two-way DNS check that `ip` belongs to `crawler`.
 * @param {string} ip
 * @param {{hosts: string[]}} crawler
 * @param {{reverse: Function, lookup: Function}} [resolver] injectable for tests
 */
export async function verifyCrawlerIp(ip, crawler, resolver = dns) {
  try {
    const hostnames = await withTimeout(resolver.reverse(ip));
    for (const host of hostnames) {
      const h = host.toLowerCase().replace(/\.$/, '');
      if (!crawler.hosts.some((suffix) => h.endsWith(suffix))) continue;
      const addresses = await withTimeout(resolver.lookup(h, { all: true }));
      if (addresses.some((a) => normalizeIp(a.address) === ip)) return true;
    }
  } catch {
    // NXDOMAIN, timeout, etc. => not verified
  }
  return false;
}

/**
 * Resolves to the verified crawler family name for this request, or null.
 * @param {string} ip client IP (already proxy-resolved by Express)
 * @param {string} userAgent
 */
export async function verifiedCrawlerName(ip, userAgent, resolver = dns) {
  const crawler = claimedCrawler(userAgent);
  const cleanIp = normalizeIp(ip || '');
  if (!crawler || !cleanIp) return null;

  const key = `${crawler.name}|${cleanIp}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.name;

  const ok = await verifyCrawlerIp(cleanIp, crawler, resolver);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { name: ok ? crawler.name : null, expires: Date.now() + (ok ? CACHE_TTL_MS : NEGATIVE_TTL_MS) });
  return ok ? crawler.name : null;
}

/**
 * Express middleware: sets req.verifiedCrawler to the crawler family name
 * (e.g. 'google') for genuine search-engine crawlers, otherwise null.
 * Must run before the bot shield and rate limiter.
 */
export const identifyCrawler = async (req, res, next) => {
  req.verifiedCrawler = null;
  const ua = req.headers['user-agent'] || '';
  if (claimedCrawler(ua)) {
    req.verifiedCrawler = await verifiedCrawlerName(req.ip || req.socket?.remoteAddress || '', ua);
  }
  next();
};
