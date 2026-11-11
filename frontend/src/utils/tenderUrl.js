/**
 * @file src/utils/tenderUrl.js
 * @description Readable, stable URLs for tender and GeM bid pages.
 *
 *   /tenders/6ab17d44e8cbe3b62d063346-request-for-proposal-for-selection-of
 *            └──────── database id ───────┘└──────── slug from title ────┘
 *
 * The 24-hex database id always comes first, so links keep working when a
 * title (and therefore the slug) changes, and old id-only links still resolve.
 * The slug is only for people and search engines.
 *
 * KEEP IN SYNC with backend/src/utils/tenderUrl.js (same algorithm; both are
 * covered by tests with identical expectations).
 */

const OBJECT_ID_PREFIX = /^([a-f0-9]{24})(?:-|$)/i;
const MAX_SLUG_LENGTH = 60;

/** Lowercase, ASCII, hyphen-separated slug from a title (max ~60 chars, cut on a word). */
export function slugify(text) {
  const slug = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH + 1);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 20 ? cut.slice(0, lastHyphen) : cut.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/, '');
}

export const isGemTender = (tender) =>
  tender?.sourcePortal === 'GEM' || tender?.departmentCode === 'GEM' || String(tender?.sourceTenderId || '').startsWith('GEM/');

/** URL segment for a tender: "<id>-<slug>", or the encoded tender number when no id is known. */
export function tenderSegment(tender) {
  if (!tender) return '';
  if (tender._id) {
    const slug = slugify(String(tender.title || '').replace(/[[\]]/g, ''));
    return slug ? `${tender._id}-${slug}` : String(tender._id);
  }
  return encodeURIComponent(tender.sourceTenderId || '');
}

/** Detail page path for any tender: /tenders/... or /gem-tenders/... */
export const tenderPath = (tender) => `/${isGemTender(tender) ? 'gem-tenders' : 'tenders'}/${tenderSegment(tender)}`;

/**
 * Extracts the lookup id from a route param: the 24-hex id when the param
 * starts with one (with or without slug), otherwise the param unchanged
 * (tender numbers like 2026_JSD_322410_1 or GEM/2026/B/7944446).
 */
export function idFromParam(param) {
  const value = String(param || '');
  const match = value.match(OBJECT_ID_PREFIX);
  return match ? match[1] : value;
}
