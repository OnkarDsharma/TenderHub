/**
 * @file backend/src/services/prerender.service.js
 * @description Server-rendered HTML for tender and GeM bid pages, served only
 * to search-engine and link-preview crawlers (routed here by the frontend
 * host based on User-Agent). Regular visitors get the React app.
 *
 * The HTML carries the same information the React page shows (title,
 * department, location, value, dates, description) so Google's "dynamic
 * rendering" guidance is met: equivalent content, no cloaking. On top it adds
 * what crawlers need: title/description/canonical/Open Graph tags, JSON-LD
 * breadcrumbs, and links to similar open tenders for crawl discovery.
 *
 * Closed-tender policy (mirrored in the React pages via useSeo):
 *   - closed or cancelled: page stays indexable, shows a "Closed" notice and
 *     links to similar open tenders (keeps ranking value, helps the visitor)
 *   - closed more than STALE_DAYS ago, or delisted: noindex
 */
import Tender from '../models/Tender.js';
import { siteUrl, escapeXml as escapeHtml, activeTenderFilter, activeGemFilter } from './sitemap.service.js';
import { tenderPath, idFromParam } from '../utils/tenderUrl.js';
import { LANDING_STATES } from './landing.service.js';

const LANDING_STATE_LINKS = (gem) => LANDING_STATES.map((s) => ({ slug: s.slug, name: s.name, path: `/${gem ? 'gem-tenders' : 'tenders'}/in/${s.slug}` }));

export const STALE_DAYS = 90;
const SITE_NAME = 'tndrr';
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

// ---------------------------------------------------------------------------
// Formatting helpers (kept in step with frontend/src/utils/formatters.js)
// ---------------------------------------------------------------------------
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
const cleanTitle = (v) => clean(String(v ?? '').replace(/[[\]]/g, ''));

const clamp = (text, max) => {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.5 ? cut.slice(0, space) : cut}…`;
};

export const formatINR = (amount) => {
  if (amount === undefined || amount === null || amount === '') return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  if (n === 0) return 'Refer BOQ / Rate Contract';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} Lakh`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

export const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

// ---------------------------------------------------------------------------
// Tender facts
// ---------------------------------------------------------------------------
export const isGemTender = (t) =>
  t.sourcePortal === 'GEM' || t.departmentCode === 'GEM' || String(t.sourceTenderId || '').startsWith('GEM/');

const closingOf = (t) => t.bidSubmissionEndDate || t.closingDate || null;

/** 'open' | 'closed' | 'cancelled' */
export function tenderState(t, now = new Date()) {
  if (t.isDelisted || t.status === 'CANCELLED' || t.gemStatus === 'CANCELLED') return 'cancelled';
  const closes = closingOf(t);
  if (closes && new Date(closes) < now) return 'closed';
  if (isGemTender(t) ? t.gemStatus === 'NOT_LISTED' : t.status === 'EXPIRED') return 'closed';
  return 'open';
}

/** Whether a page should be kept out of the index (closed > STALE_DAYS ago, or delisted). */
export function shouldNoindex(t, now = new Date()) {
  if (t.isDelisted) return true;
  const closes = closingOf(t);
  if (!closes) return false;
  return now.getTime() - new Date(closes).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

const departmentOf = (t) =>
  clean(t.departmentName || String(t.organisationChain || '').split('||')[0] || t.department) || null;

const locationOf = (t) => {
  if (isGemTender(t)) {
    const states = Array.isArray(t.consigneeStates) && t.consigneeStates.length ? t.consigneeStates.join(', ') : null;
    return clean([t.location, states].filter(Boolean).join(' · ')) || null;
  }
  // Skip the state when the location already names it ("Jammu and Kashmir" vs "Jammu & Kashmir").
  const norm = (v) => clean(v).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const loc = clean(t.location);
  const state = clean(t.state);
  return (state && norm(loc).includes(norm(state)) ? loc : clean([loc, state].filter(Boolean).join(', '))) || null;
};

export const pathFor = (t) => tenderPath(t);

/** Page title and description, matching the React pages' useSeo output. */
export function seoFor(t) {
  const gem = isGemTender(t);
  const title = gem ? cleanTitle(t.title) || 'GeM Bid' : cleanTitle(t.title) || 'Tender';
  const dept = departmentOf(t);
  const state = gem ? (t.officialState || t.state) : null;

  const pageTitle = gem
    ? [title, state && `GeM Bid ${state}`].filter(Boolean).join(' | ')
    : [title, dept && `${dept} Tender`].filter(Boolean).join(' | ');

  const description = gem
    ? ['GeM bid', t.sourceTenderId, dept && `by ${dept}`, state && `in ${state}`,
      `· ${t.productCategory || title}. View delivery locations, EMD, and bid documents on tndrr.`]
    : [dept && `${dept} tender`, (t.location || t.state) && `in ${t.location || t.state}`,
      t.estimatedValue ? `· Value ${formatINR(t.estimatedValue)}` : '',
      closingOf(t) ? `· Closes ${formatDate(closingOf(t))}` : '',
      `· ${title}. View documents, BOQ, and eligibility on tndrr.`];

  return {
    title: `${clamp(pageTitle, MAX_TITLE)} | ${SITE_NAME}`,
    description: clamp(description.filter(Boolean).join(' '), MAX_DESCRIPTION),
  };
}

/** Label/value rows shown in the page body (only populated fields). */
function factsFor(t) {
  const gem = isGemTender(t);
  const rows = gem
    ? [
      ['Bid number', t.sourceTenderId],
      ['Issuing department', departmentOf(t)],
      ['Organisation', clean(String(t.organisationChain || '').replace(/\|\|/g, ' › '))],
      ['Product category', t.productCategory],
      ['Delivery location', locationOf(t)],
      ['Buyer state', t.officialState],
      ['Contract type', t.formOfContract],
      ['EMD', t.emdAmount > 0 ? formatINR(t.emdAmount) : (t.emdAmount === 0 ? 'Exempted' : null)],
      ['Bid validity', t.bidValidityDays ? `${t.bidValidityDays} days` : null],
      ['Published', formatDate(t.publishedDate)],
      ['Bid closing', formatDate(closingOf(t))],
    ]
    : [
      ['Tender ID', t.sourceTenderId],
      ['Reference number', t.tenderReferenceNumber],
      ['Department', departmentOf(t)],
      ['Organisation', clean(String(t.organisationChain || '').replace(/\|\|/g, ' › '))],
      ['Location', locationOf(t)],
      ['Estimated value', t.estimatedValue ? formatINR(t.estimatedValue) : null],
      ['EMD', t.emdAmount > 0 ? formatINR(t.emdAmount) : null],
      ['Tender fee', t.tenderFee > 0 ? formatINR(t.tenderFee) : null],
      ['Tender type', t.tenderType],
      ['Category', t.tenderCategory || t.productCategory],
      ['Form of contract', t.formOfContract],
      ['Period of work', t.periodOfWorkDays ? `${t.periodOfWorkDays} days` : null],
      ['Tenderer class', t.tendererClass],
      ['Published', formatDate(t.publishedDate)],
      ['Bid submission closes', formatDate(closingOf(t))],
      ['Bid opening', formatDate(t.bidOpeningDate)],
      ['Inviting authority', t.invitingAuthorityName],
    ];
  return rows.filter(([, v]) => v && clean(v));
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const SUMMARY_FIELDS = 'title sourceTenderId tenderReferenceNumber departmentName organisationChain location state consigneeStates productCategory estimatedValue emdAmount publishedDate publishedDateStr closingDate closingDateStr bidSubmissionEndDate sourcePortal departmentCode';

/** Fetches a tender by ObjectId or sourceTenderId (same lookup as the API). */
export async function findTender(param) {
  const id = idFromParam(param);
  let t = null;
  if (/^[a-f0-9]{24}$/i.test(id)) t = await Tender.findById(id).lean().maxTimeMS(10000);
  if (!t) t = await Tender.findOne({ sourceTenderId: id }).lean().maxTimeMS(10000);
  return t;
}

/** Up to `limit` open tenders from the same department (falls back to same state/category). */
export async function findSimilarOpen(t, limit = 6) {
  const gem = isGemTender(t);
  const base = gem ? activeGemFilter() : activeTenderFilter();
  const scopes = gem
    ? [t.departmentName && { departmentName: t.departmentName }, t.productCategory && { productCategory: t.productCategory }]
    : [t.departmentCode && { departmentCode: t.departmentCode }, t.state && { state: t.state }];

  const found = [];
  for (const scope of scopes.filter(Boolean)) {
    if (found.length >= limit) break;
    const rows = await Tender.find({ ...base, ...scope, _id: { $nin: [t._id, ...found.map((r) => r._id)] } })
      .select(SUMMARY_FIELDS)
      .sort({ closingDate: 1 })
      .limit(limit - found.length)
      .lean()
      .maxTimeMS(10000);
    found.push(...rows);
  }
  return found;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

export function layout({ title, description, canonical, robots, ogType = 'website', body, structuredData = [] }) {
  const base = siteUrl();
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${e(canonical)}">
<link rel="icon" type="image/png" href="${base}/tndrr-mark.png">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:image" content="${base}/tndrr-logo.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${base}/tndrr-logo.png">
${structuredData.map(jsonLd).join('\n')}
</head>
<body>
<header><nav aria-label="Main"><a href="${base}/">tndrr</a> · <a href="${base}/tenders">Tenders</a> · <a href="${base}/gem-tenders">GeM Bids</a> · <a href="${base}/pricing">Pricing</a></nav></header>
<main>
${body}
</main>
<footer><p>tndrr: every government tender in Jammu &amp; Kashmir, Ladakh, Punjab, Himachal Pradesh, Haryana and Delhi, in one search.</p></footer>
</body>
</html>
`;
}

export function listItem(t) {
  const base = siteUrl();
  const e = escapeHtml;
  const bits = [departmentOf(t), locationOf(t), formatDate(closingOf(t)) && `closes ${formatDate(closingOf(t))}`].filter(Boolean);
  return `<li><a href="${e(base + pathFor(t))}">${e(cleanTitle(t.title) || t.sourceTenderId)}</a>${bits.length ? ` (${e(bits.join(' · '))})` : ''}</li>`;
}

/**
 * Full crawler HTML for one tender or GeM bid.
 * @param {object} t tender document (lean)
 * @param {object[]} similar open tenders to link to
 */
export function renderTenderPage(t, similar = [], now = new Date()) {
  const base = siteUrl();
  const e = escapeHtml;
  const gem = isGemTender(t);
  const { title, description } = seoFor(t);
  const canonical = `${base}${pathFor(t)}`;
  const state = tenderState(t, now);
  const heading = cleanTitle(t.title) || (gem ? 'GeM bid' : 'Tender');
  const sectionName = gem ? 'GeM Bids' : 'Tenders';
  const sectionPath = gem ? '/gem-tenders' : '/tenders';

  const statusNote = state === 'open'
    ? ''
    : `<p role="status"><strong>${state === 'cancelled' ? 'This tender has been cancelled or withdrawn.' : 'This tender is closed.'}</strong> Bids are no longer accepted. See the open tenders below.</p>`;

  const work = clean(t.workDescription);
  const facts = factsFor(t);

  const body = `<nav aria-label="Breadcrumb"><a href="${base}/">Home</a> › <a href="${base}${sectionPath}">${sectionName}</a> › <span>${e(heading)}</span></nav>
<article>
<h1>${e(heading)}</h1>
${statusNote}
${work && work !== heading ? `<p>${e(work)}</p>` : ''}
<dl>
${facts.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(clean(v))}</dd>`).join('\n')}
</dl>
<p><a href="${e(canonical)}">View full ${gem ? 'bid' : 'tender'} details, documents${gem ? '' : ' and BOQ'} on tndrr</a></p>
</article>
${similar.length ? `<section><h2>${state === 'open' ? 'Similar open tenders' : 'Open tenders you can still bid on'}</h2><ul>
${similar.map(listItem).join('\n')}
</ul></section>` : ''}`;

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: sectionName, item: `${base}${sectionPath}` },
      { '@type': 'ListItem', position: 3, name: clamp(heading, 110), item: canonical },
    ],
  };

  return layout({
    title,
    description,
    canonical,
    robots: shouldNoindex(t, now) ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    ogType: 'article',
    body,
    structuredData: [breadcrumbs],
  });
}

/** Real 404 page (sent with HTTP 404) for unknown tender IDs. */
export function renderNotFound(path) {
  const base = siteUrl();
  return layout({
    title: `Tender not found | ${SITE_NAME}`,
    description: 'This tender does not exist or has been removed. Browse live government tenders on tndrr.',
    canonical: `${base}${path}`,
    robots: 'noindex, follow',
    body: `<h1>Tender not found</h1><p>This tender does not exist or has been removed.</p><p><a href="${base}/tenders">Browse live tenders</a> · <a href="${base}/gem-tenders">Browse GeM bids</a></p>`,
  });
}

// ---------------------------------------------------------------------------
// Landing pages (/tenders/in/:state[/:dept], /gem-tenders/in/:state)
// ---------------------------------------------------------------------------
/**
 * Crawler HTML for a landing page.
 * @param {object} data result of landing.service getLanding()
 * @param {{heading: string, title: string, description: string}} seo landingSeo(data)
 * @param {string} path public path of the page
 */
export function renderLandingPage(data, seo, path) {
  const base = siteUrl();
  const e = escapeHtml;
  const gem = data.kind === 'gem';
  const sectionName = gem ? 'GeM Bids' : 'Tenders';
  const sectionPath = gem ? '/gem-tenders' : '/tenders';
  const statePath = `${sectionPath}/in/${data.state.slug}`;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: sectionName, path: sectionPath },
    { name: data.state.name, path: statePath },
    ...(data.department ? [{ name: data.department.name, path }] : []),
  ];

  const intro = gem
    ? `${data.total} Government e-Marketplace bids are currently open for delivery in ${data.state.name}. Bids are listed by closing date, soonest first.`
    : data.department
      ? `${data.total} tenders from ${data.department.name} in ${data.state.name} are currently open for bidding. Tenders are listed by closing date, soonest first.`
      : `${data.total} government e-procurement tenders are currently open in ${data.state.name}, across ${data.departments.length} departments with regular tenders. Tenders are listed by closing date, soonest first.`;

  const deptLinks = data.departments.length
    ? `<section><h2>${data.department ? `Other departments in ${e(data.state.name)}` : `Tenders by department in ${e(data.state.name)}`}</h2><ul>
${data.departments.map((d) => `<li><a href="${e(`${base}/tenders/in/${data.state.slug}/${d.slug}`)}">${e(d.name)} tenders</a> (${d.count} open)</li>`).join('\n')}
</ul></section>`
    : '';

  const categoryList = gem && data.categories?.length
    ? `<section><h2>Popular GeM categories in ${e(data.state.name)}</h2><ul>
${data.categories.map((c) => `<li>${e(c.name)} (${c.count} open)</li>`).join('\n')}
</ul></section>`
    : '';

  const otherStates = `<section><h2>${sectionName} in other states</h2><ul>
${LANDING_STATE_LINKS(gem).filter((s) => s.slug !== data.state.slug).map((s) => `<li><a href="${e(base + s.path)}">${e(s.name)}</a></li>`).join('\n')}
</ul></section>`;

  const body = `<nav aria-label="Breadcrumb">${crumbs.map((c, i) => (i === crumbs.length - 1 ? `<span>${e(c.name)}</span>` : `<a href="${e(base + c.path)}">${e(c.name)}</a>`)).join(' › ')}</nav>
<h1>${e(seo.heading)}</h1>
<p>${e(intro)}</p>
${data.tenders.length ? `<section><h2>Open ${gem ? 'bids' : 'tenders'}</h2><ul>
${data.tenders.map(listItem).join('\n')}
</ul></section>` : `<p>No open ${gem ? 'bids' : 'tenders'} right now. New ones are added daily.</p>`}
${deptLinks}
${categoryList}
${otherStates}`;

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${base}${c.path}` })),
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: seo.heading,
    numberOfItems: data.tenders.length,
    itemListElement: data.tenders.slice(0, 50).map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}${pathFor(t)}`, name: clamp(cleanTitle(t.title) || t.sourceTenderId, 110) })),
  };

  return layout({
    title: `${clamp(seo.title, MAX_TITLE)} | ${SITE_NAME}`,
    description: clamp(seo.description, MAX_DESCRIPTION),
    canonical: `${base}${path}`,
    robots: 'index, follow, max-image-preview:large',
    body,
    structuredData: [breadcrumbs, itemList],
  });
}
