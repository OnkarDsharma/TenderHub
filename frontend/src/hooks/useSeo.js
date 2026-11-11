/**
 * @file src/hooks/useSeo.js
 * @description Per-page SEO tags for the SPA. Updates <title>, meta description,
 * robots, canonical and Open Graph / Twitter tags in <head> whenever a page mounts
 * or its data changes. Tags are upserted (never duplicated) so the defaults in
 * index.html are overwritten in place, which is what Google's renderer reads.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const SITE_NAME = 'tndrr';

/**
 * Public origin used for canonical and og:url. Set VITE_SITE_URL in the
 * production env (e.g. https://www.tndrr.com); falls back to the current origin.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, '');

export const DEFAULT_DESCRIPTION =
  'Every tender. One search. Public procurement intelligence and government tender analytics across J&K, Ladakh, Punjab, and Himachal Pradesh.';

const DEFAULT_IMAGE = '/tndrr-logo.png';

/**
 * Closed-tender policy, mirrored in backend/src/services/prerender.service.js:
 * a tender stays indexable after it closes (it shows a Closed notice and keeps
 * its ranking value) until STALE_DAYS have passed, or immediately if delisted.
 */
export const STALE_DAYS = 90;
export const isStaleTender = (tender, now = Date.now()) => {
  if (!tender) return false;
  if (tender.isDelisted) return true;
  const closes = tender.bidSubmissionEndDate || tender.closingDate;
  if (!closes) return false;
  const t = new Date(closes).getTime();
  return !Number.isNaN(t) && now - t > STALE_DAYS * 24 * 60 * 60 * 1000;
};
const MAX_DESCRIPTION = 160;
const MAX_TITLE = 60;

/** Collapses whitespace and trims to ~160 chars on a word boundary. */
export const clampDescription = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 100 ? cut.lastIndexOf(' ') : cut.length)}…`;
};

/** Keeps the page part of the title short enough to show fully in search results. */
const clampTitle = (text) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE) return clean;
  const cut = clean.slice(0, MAX_TITLE - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > 30 ? cut.slice(0, space) : cut}…`;
};

const upsertMeta =(attr, key, content) => {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const upsertCanonical = (href) => {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

const absoluteUrl = (path) => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`);

/**
 * Sets SEO tags for the current page.
 * @param {object} opts
 * @param {string} [opts.title] Page title without the brand suffix.
 * @param {string} [opts.description] Meta description (clamped to ~160 chars).
 * @param {string} [opts.path] Canonical path; defaults to the current pathname (query string dropped).
 * @param {boolean} [opts.noindex] Mark the page noindex, nofollow.
 * @param {string} [opts.image] Social preview image path or URL.
 * @param {string} [opts.type] og:type, 'website' by default.
 */
export function useSeo({ title, description, path, noindex = false, image, type = 'website' } = {}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title ? `${clampTitle(title)} | ${SITE_NAME}` : `${SITE_NAME} | Every Tender. One Search.`;
    const desc = clampDescription(description || DEFAULT_DESCRIPTION);
    const canonical = absoluteUrl(path || pathname);
    const img = absoluteUrl(image || DEFAULT_IMAGE);

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    upsertCanonical(canonical);

    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', img);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:image', img);
  }, [title, description, path, pathname, noindex, image, type]);
}
