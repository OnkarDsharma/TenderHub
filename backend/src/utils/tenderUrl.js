/**
 * @file backend/src/utils/tenderUrl.js
 * @description Readable, stable URLs for tender and GeM bid pages:
 *   /tenders/<24-hex id>-<slug from title>
 * The id comes first so links survive title changes and old id-only links
 * still resolve.
 *
 * KEEP IN SYNC with frontend/src/utils/tenderUrl.js (same algorithm; both are
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

/** Lookup id from a route param: the leading 24-hex id if present, else the param unchanged. */
export function idFromParam(param) {
  const value = String(param || '');
  const match = value.match(OBJECT_ID_PREFIX);
  return match ? match[1] : value;
}
