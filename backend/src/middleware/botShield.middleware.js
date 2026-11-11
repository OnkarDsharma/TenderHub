/**
 * @file backend/src/middleware/botShield.middleware.js
 * @description Advanced multi-layered bot defense and honeypot trapping system.
 * Detects automated scrapers, headless crawlers, and blacklists malicious IPs in Redis.
 */
import { redis } from '../config/redis.js';
import pino from 'pino';

const logger = pino();

// Known automated scrapers and headless clients
const SCRAPER_UA_PATTERNS = [
  /python-requests/i,
  /aiohttp/i,
  /scrapy/i,
  /curl\//i,
  /wget\//i,
  /go-http-client/i,
  /libwww-perl/i,
  /httpclient/i,
  /mechanize/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

/**
/**
 * Extracts normalized client IP address from express request.
 * Relies on Express trust proxy configuration to prevent client header spoofing.
 */
export const getClientIp = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  return ip;
};

/**
 * Global middleware checking whether the incoming IP is blacklisted.
 */
export const checkIpBlacklist = async (req, res, next) => {
  // Verified search-engine crawlers (see utils/crawlerVerify.js) are never blocked.
  if (req.verifiedCrawler) return next();
  try {
    const ip = getClientIp(req);
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      const isBlacklisted = await redis.get(`blacklist:ip:${ip}`);
      if (isBlacklisted) {
        return res.status(403).json({
          error: 'Access denied: automated scraping or abusive activity detected from this IP address.',
          code: 'IP_BLOCKED',
        });
      }
    }
    next();
  } catch (err) {
    // If Redis is temporarily unavailable, fail open gracefully
    next();
  }
};

/**
 * Middleware that inspects User-Agent headers for obvious scraper scripts.
 * Allows legitimate browsers and verified automated admin webhooks.
 */
export const blockScraperUserAgents = (req, res, next) => {
  // Never block during local testing or health checks
  if (req.path === '/health') return next();
  // Verified search-engine crawlers render pages with headless Chrome; let them through.
  if (req.verifiedCrawler) return next();

  const userAgent = req.headers['user-agent'] || '';
  const hasScraperUA = SCRAPER_UA_PATTERNS.some((pattern) => pattern.test(userAgent));

  if (hasScraperUA) {
    const ip = getClientIp(req);
    logger.warn(`[BotShield] Blocked scraper User-Agent "${userAgent}" from IP ${ip} on ${req.originalUrl}`);
    return res.status(403).json({
      error: 'Direct script access is prohibited. Please use the official web interface.',
      code: 'AUTOMATED_CLIENT_BLOCKED',
    });
  }

  next();
};

/**
 * Honeypot trap endpoint handler.
 * Any bot that follows invisible links in the HTML gets instantly blacklisted for 24 hours.
 */
export const handleHoneypotTrap = async (req, res) => {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Blacklist IP for 24 hours (86,400 seconds) in Redis.
    // Verified search-engine crawlers are never blacklisted: they may follow
    // any link, and banning Googlebot's shared IPs would hide the whole site.
    if (ip && ip !== '127.0.0.1' && ip !== '::1' && !req.verifiedCrawler) {
      await redis.setex(`blacklist:ip:${ip}`, 86400, `Trapped in honeypot: ${userAgent}`);
      logger.error(`[BotShield] 🚨 BOT TRAPPED: IP ${ip} touched honeypot endpoint! Blacklisted for 24 hours.`);
    }

    // Return generic not-found or forbidden so the bot doesn't know it was caught
    return res.status(403).json({
      error: 'Security alert: Automated crawler activity detected and restricted.',
      code: 'BOT_TRAPPED',
    });
  } catch (err) {
    return res.status(403).json({ error: 'Access denied' });
  }
};
