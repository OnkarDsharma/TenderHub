/**
 * @file backend/src/services/sitemap.service.js
 * @description Builds XML sitemaps for search engines.
 *
 * Layout (all URLs are on the public frontend domain, SITE_URL):
 *   /sitemap.xml              sitemap index listing every file below
 *   /sitemap-static.xml       marketing and list pages
 *   /sitemap-tenders-N.xml    active state e-procurement tenders, CHUNK_SIZE per file
 *   /sitemap-gem-N.xml        active GeM bids, CHUNK_SIZE per file
 *
 * Only ACTIVE records are listed, using the same rules as the public list
 * endpoints, so every URL in the sitemap resolves to a live, indexable page.
 *
 * lastmod uses publishedDate (falling back to createdAt), NOT updatedAt:
 * scrapers re-save records on every pass, so updatedAt changes daily even
 * when nothing a reader would see changed. Search engines stop trusting
 * lastmod values that are always "today".
 */
import Tender from '../models/Tender.js';
import { env } from '../config/env.js';
import { confirmedActiveFilter } from '../routes/gem.routes.js';

/** URLs per child sitemap. Google allows 50,000; smaller files keep each query light. */
export const CHUNK_SIZE = 10000;

export const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/tenders', changefreq: 'hourly', priority: '0.9' },
  { path: '/gem-tenders', changefreq: 'hourly', priority: '0.9' },
  { path: '/services', changefreq: 'weekly', priority: '0.6' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.5' },
  { path: '/about', changefreq: 'monthly', priority: '0.4' },
  { path: '/contact', changefreq: 'monthly', priority: '0.4' },
];

/**
 * Public origin of the frontend, without a trailing slash.
 * In production a missing or localhost origin is a configuration error: a
 * sitemap full of localhost URLs would be worse than none, so we refuse.
 */
export const siteUrl = () => {
  const origin = String(env.SITE_URL || env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (env.NODE_ENV === 'production' && (!/^https:\/\//.test(origin) || /localhost|127\.0\.0\.1/.test(origin))) {
    const err = new Error('SITE_URL must be set to the public https frontend origin to serve sitemaps');
    err.status = 503;
    throw err;
  }
  return origin;
};

export const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const toW3CDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * @param {Array<{loc: string, lastmod?: Date|string, changefreq?: string, priority?: string}>} entries
 * @returns {string} urlset XML
 */
export function buildUrlset(entries) {
  const body = entries
    .map(({ loc, lastmod, changefreq, priority }) => {
      const parts = [`<loc>${escapeXml(loc)}</loc>`];
      const mod = lastmod && toW3CDate(lastmod);
      if (mod) parts.push(`<lastmod>${mod}</lastmod>`);
      if (changefreq) parts.push(`<changefreq>${changefreq}</changefreq>`);
      if (priority) parts.push(`<priority>${priority}</priority>`);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/**
 * @param {Array<{loc: string, lastmod?: Date|string}>} entries
 * @returns {string} sitemapindex XML
 */
export function buildSitemapIndex(entries) {
  const body = entries
    .map(({ loc, lastmod }) => {
      const mod = lastmod && toW3CDate(lastmod);
      return `  <sitemap><loc>${escapeXml(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</sitemap>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** Active state-portal tenders: mirrors the "active" tab of GET /tenders. */
export const activeTenderFilter = (now = new Date()) => ({
  sourcePortal: { $ne: 'GEM' },
  status: 'ACTIVE',
  isDelisted: { $ne: true },
  closingDate: { $gte: now },
  $or: [
    { bidSubmissionEndDate: { $exists: false } },
    { bidSubmissionEndDate: null },
    { bidSubmissionEndDate: { $gte: now } },
  ],
});

/** Active GeM bids: mirrors the "active" status of GET /gem/tenders. */
export const activeGemFilter = (now = new Date()) => ({
  sourcePortal: 'GEM',
  ...confirmedActiveFilter(now),
});

/** Frontend detail paths; must match detailHref in frontend TenderCard.jsx. */
export const tenderPath = (doc) => `/tenders/${encodeURIComponent(String(doc._id))}`;
export const gemPath = (doc) => `/gem-tenders/${encodeURIComponent(String(doc._id))}`;

const SECTIONS = {
  tenders: { filter: activeTenderFilter, path: tenderPath },
  gem: { filter: activeGemFilter, path: gemPath },
};

const lastmodOf = (doc) => doc.publishedDate || doc.createdAt;

export function generateStaticSitemap() {
  const base = siteUrl();
  return buildUrlset(STATIC_PAGES.map((p) => ({ ...p, loc: `${base}${p.path}` })));
}

/**
 * One chunk of a section's sitemap.
 * @param {'tenders'|'gem'} section
 * @param {number} page 1-based chunk number
 * @returns {Promise<string|null>} XML, or null when the chunk is out of range
 */
export async function generateSectionSitemap(section, page) {
  const cfg = SECTIONS[section];
  if (!cfg || !Number.isInteger(page) || page < 1) return null;

  const docs = await Tender.find(cfg.filter())
    .select({ _id: 1, publishedDate: 1, createdAt: 1 })
    .sort({ _id: 1 })
    .skip((page - 1) * CHUNK_SIZE)
    .limit(CHUNK_SIZE)
    .lean()
    .maxTimeMS(20000);

  // Page 1 always exists (an empty urlset is valid); later empty pages are 404s.
  if (docs.length === 0 && page > 1) return null;

  const base = siteUrl();
  return buildUrlset(
    docs.map((doc) => ({ loc: `${base}${cfg.path(doc)}`, lastmod: lastmodOf(doc), changefreq: 'daily' }))
  );
}

/** Sitemap index pointing at the static file and every tender/GeM chunk. */
export async function generateSitemapIndex() {
  const base = siteUrl();
  const now = new Date();
  const entries = [{ loc: `${base}/sitemap-static.xml`, lastmod: now }];

  for (const [section, cfg] of Object.entries(SECTIONS)) {
    const filter = cfg.filter(now);
    const [count, newest] = await Promise.all([
      Tender.countDocuments(filter).maxTimeMS(20000),
      Tender.findOne(filter).select({ publishedDate: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean().maxTimeMS(20000),
    ]);
    const chunks = Math.max(1, Math.ceil(count / CHUNK_SIZE));
    const lastmod = newest ? lastmodOf(newest) : undefined;
    for (let i = 1; i <= chunks; i += 1) {
      entries.push({ loc: `${base}/sitemap-${section}-${i}.xml`, lastmod });
    }
  }

  return buildSitemapIndex(entries);
}
