/**
 * Verified-crawler detection and crawler HTML for tender pages.
 * DNS, the Tender model and Redis are stubbed: no network or database access.
 */
import test, { mock, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import Tender from '../src/models/Tender.js';
import { redis } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import {
  claimedCrawler,
  verifiedCrawlerName,
  _resetCrawlerCache,
} from '../src/utils/crawlerVerify.js';
import {
  renderTenderPage,
  renderNotFound,
  tenderState,
  shouldNoindex,
  seoFor,
  formatINR,
} from '../src/services/prerender.service.js';
import prerenderRoutes from '../src/routes/prerender.routes.js';

const SITE = 'https://www.tndrr.com';
env.SITE_URL = SITE;

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

/** Fake resolver: reverse map ip -> hostnames, forward map host -> ips. */
const resolver = (reverse, forward) => ({
  reverse: async (ip) => { if (!reverse[ip]) throw new Error('ENOTFOUND'); return reverse[ip]; },
  lookup: async (host) => (forward[host] || []).map((address) => ({ address, family: 4 })),
});

// --- Crawler verification ---------------------------------------------------
test('claimedCrawler recognises crawler User-Agents and ignores browsers', () => {
  assert.equal(claimedCrawler(GOOGLEBOT_UA)?.name, 'google');
  assert.equal(claimedCrawler('Mozilla/5.0 (compatible; bingbot/2.0)')?.name, 'bing');
  assert.equal(claimedCrawler('Mozilla/5.0 (compatible; Google-InspectionTool/1.0)')?.name, 'google');
  assert.equal(claimedCrawler(BROWSER_UA), null);
  assert.equal(claimedCrawler(''), null);
});

test('real Googlebot passes reverse + forward DNS', async () => {
  _resetCrawlerCache();
  const r = resolver({ '66.249.66.1': ['crawl-66-249-66-1.googlebot.com'] }, { 'crawl-66-249-66-1.googlebot.com': ['66.249.66.1'] });
  assert.equal(await verifiedCrawlerName('66.249.66.1', GOOGLEBOT_UA, r), 'google');
});

test('fake Googlebot from a non-Google host is rejected', async () => {
  _resetCrawlerCache();
  const r = resolver({ '203.0.113.9': ['scraper.example.net'] }, { 'scraper.example.net': ['203.0.113.9'] });
  assert.equal(await verifiedCrawlerName('203.0.113.9', GOOGLEBOT_UA, r), null);
});

test('spoofed reverse DNS that does not resolve back is rejected', async () => {
  _resetCrawlerCache();
  // Attacker controls PTR for their IP, but googlebot.com forward DNS points elsewhere.
  const r = resolver({ '203.0.113.10': ['crawl-1.googlebot.com'] }, { 'crawl-1.googlebot.com': ['66.249.66.2'] });
  assert.equal(await verifiedCrawlerName('203.0.113.10', GOOGLEBOT_UA, r), null);
});

test('lookalike domains do not pass the suffix check', async () => {
  _resetCrawlerCache();
  const r = resolver({ '203.0.113.11': ['evilgooglebot.com'] }, { 'evilgooglebot.com': ['203.0.113.11'] });
  assert.equal(await verifiedCrawlerName('203.0.113.11', GOOGLEBOT_UA, r), null);
});

test('results are cached per IP and browsers never trigger DNS', async () => {
  _resetCrawlerCache();
  let calls = 0;
  const r = resolver({ '66.249.66.3': ['crawl.googlebot.com'] }, { 'crawl.googlebot.com': ['66.249.66.3'] });
  const counting = { reverse: async (ip) => { calls += 1; return r.reverse(ip); }, lookup: r.lookup };
  await verifiedCrawlerName('66.249.66.3', GOOGLEBOT_UA, counting);
  await verifiedCrawlerName('66.249.66.3', GOOGLEBOT_UA, counting);
  assert.equal(calls, 1);
  assert.equal(await verifiedCrawlerName('66.249.66.3', BROWSER_UA, counting), null);
  assert.equal(calls, 1);
});

// --- Tender facts -------------------------------------------------------------
const NOW = new Date('2026-11-11T06:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

const stateTender = {
  _id: '6ab00aa8e8cbe3b62d060e01',
  sourcePortal: 'JK_TENDERS',
  sourceTenderId: '2026_JSD_322410_1',
  title: '[Laying and fitting of 150 mm DI K-9 pipe for WSS Bijbehara]',
  workDescription: 'Laying & fitting of DI pipe <including> trenching',
  organisationChain: 'Jal Shakti Department||Chief Engineer Kashmir',
  departmentCode: 'JSD',
  location: 'Bijbehara, Anantnag',
  state: 'Jammu & Kashmir',
  estimatedValue: 9860000,
  emdAmount: 197200,
  publishedDate: daysAgo(10),
  bidSubmissionEndDate: new Date(NOW.getTime() + 15 * 86400000),
  closingDate: new Date(NOW.getTime() + 15 * 86400000),
  status: 'ACTIVE',
  r2StorageKey: 'secret/path/should-not-leak.zip',
};

test('formatINR matches the frontend formatter', () => {
  assert.equal(formatINR(9860000), '₹98.60 Lakh');
  assert.equal(formatINR(25000000), '₹2.50 Cr');
  assert.equal(formatINR(0), 'Refer BOQ / Rate Contract');
  assert.equal(formatINR(null), null);
});

test('tenderState and shouldNoindex implement the closed-tender policy', () => {
  assert.equal(tenderState(stateTender, NOW), 'open');
  const closed = { ...stateTender, bidSubmissionEndDate: daysAgo(5), closingDate: daysAgo(5) };
  assert.equal(tenderState(closed, NOW), 'closed');
  assert.equal(shouldNoindex(closed, NOW), false);
  const stale = { ...stateTender, bidSubmissionEndDate: daysAgo(91), closingDate: daysAgo(91) };
  assert.equal(shouldNoindex(stale, NOW), true);
  assert.equal(tenderState({ ...stateTender, isDelisted: true }, NOW), 'cancelled');
  assert.equal(shouldNoindex({ ...stateTender, isDelisted: true }, NOW), true);
});

test('seoFor builds the same title shape as the React page, within length limits', () => {
  const { title, description } = seoFor(stateTender);
  assert.ok(title.endsWith(' | tndrr'));
  assert.ok(title.length <= 60 + ' | tndrr'.length);
  assert.ok(!title.includes('['));
  assert.match(description, /^Jal Shakti Department tender in Bijbehara, Anantnag · Value ₹98\.60 Lakh · Closes/);
  assert.ok(description.length <= 160);
});

test('renderTenderPage: head tags, escaped content, breadcrumbs, similar links, no internal fields', () => {
  const similar = [{ _id: '6ab00aa8e8cbe3b62d060e02', title: 'Augmentation of WSS Pahalgam', departmentName: 'Jal Shakti Department', location: 'Pahalgam', closingDate: daysAgo(-3) }];
  const html = renderTenderPage(stateTender, similar, NOW);

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.tndrr\.com\/tenders\/6ab00aa8e8cbe3b62d060e01-laying-and-fitting-of-150-mm-di-k-9-pipe-for-wss-bijbehara">/);
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<h1>Laying and fitting of 150 mm DI K-9 pipe for WSS Bijbehara<\/h1>/);
  assert.ok(html.includes('Laying &amp; fitting of DI pipe &lt;including&gt; trenching'), 'body text is HTML-escaped');
  assert.ok(html.includes('<dt>Estimated value</dt><dd>₹98.60 Lakh</dd>'));
  assert.ok(html.includes('<dt>Organisation</dt><dd>Jal Shakti Department › Chief Engineer Kashmir</dd>'));
  assert.ok(html.includes('Similar open tenders'));
  assert.ok(html.includes('href="https://www.tndrr.com/tenders/6ab00aa8e8cbe3b62d060e02-augmentation-of-wss-pahalgam"'));
  assert.ok(!html.includes('should-not-leak'), 'internal fields are not rendered');

  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.deepEqual(ld.itemListElement.map((i) => i.name).slice(0, 2), ['Home', 'Tenders']);
});

test('renderTenderPage: closed tender shows a notice; GeM bid uses the GeM path', () => {
  const closed = renderTenderPage({ ...stateTender, bidSubmissionEndDate: daysAgo(3), closingDate: daysAgo(3) }, [], NOW);
  assert.ok(closed.includes('This tender is closed.'));

  const gem = renderTenderPage({
    _id: '6acce40fc30b3d985b5c6332', sourcePortal: 'GEM', sourceTenderId: 'GEM/2026/B/7944446',
    title: 'PRE CAST UG BUNKER', departmentName: 'Department of Military Affairs', consigneeStates: ['JAMMU & KASHMIR'],
    officialState: 'Jammu & Kashmir', emdAmount: 0, closingDate: daysAgo(-5), gemStatus: 'ACTIVE',
  }, [], NOW);
  assert.match(gem, /<link rel="canonical" href="https:\/\/www\.tndrr\.com\/gem-tenders\/6acce40fc30b3d985b5c6332-pre-cast-ug-bunker">/);
  assert.ok(gem.includes('<dt>EMD</dt><dd>Exempted</dd>'));
  assert.ok(gem.includes('>GeM Bids</a>'));
});

test('JSON-LD cannot be broken out of with a </script> in tender text', () => {
  const html = renderTenderPage({ ...stateTender, title: 'Pipes </script><script>alert(1)</script>' }, [], NOW);
  const scripts = html.match(/<script/g) || [];
  assert.equal(scripts.length, 1, 'only the JSON-LD script tag exists');
});

test('renderNotFound is noindex', () => {
  assert.match(renderNotFound('/tenders/x'), /<meta name="robots" content="noindex, follow">/);
});

// --- Routes -------------------------------------------------------------------
const cache = new Map();
mock.method(redis, 'get', async (k) => cache.get(k) ?? null);
mock.method(redis, 'setex', async (k, _t, v) => { cache.set(k, v); return 'OK'; });

const chain = (value) => {
  const q = {};
  for (const m of ['select', 'sort', 'limit', 'lean', 'maxTimeMS']) q[m] = () => q;
  q.then = (res, rej) => Promise.resolve(value).then(res, rej);
  return q;
};
let findCalls = 0;
mock.method(Tender, 'findById', (id) => { findCalls += 1; return chain(id === stateTender._id ? stateTender : null); });
mock.method(Tender, 'findOne', () => chain(null));
mock.method(Tender, 'find', () => chain([]));

const app = express();
app.use(prerenderRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); redis.disconnect(); });

const CANONICAL_SEGMENT = '6ab00aa8e8cbe3b62d060e01-laying-and-fitting-of-150-mm-di-k-9-pipe-for-wss-bijbehara';

test('GET /prerender/tenders/:id serves HTML, uncacheable by CDNs, then from Redis', async () => {
  cache.clear(); findCalls = 0;
  const res = await fetch(`${base}/prerender/tenders/${CANONICAL_SEGMENT}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('cache-control'), /private/);
  assert.match(await res.text(), /<h1>Laying and fitting/);

  const again = await fetch(`${base}/prerender/tenders/${CANONICAL_SEGMENT}`);
  assert.equal(again.status, 200);
  assert.equal(findCalls, 1, 'second request served from cache');
});

test('unknown tender returns a real HTTP 404 (also when cached)', async () => {
  cache.clear();
  const first = await fetch(`${base}/prerender/tenders/000000000000000000000000`);
  assert.equal(first.status, 404);
  assert.match(await first.text(), /noindex/);
  const second = await fetch(`${base}/prerender/tenders/000000000000000000000000`);
  assert.equal(second.status, 404);
});

test('old id-only, outdated-slug and tender-number URLs 301 to the canonical readable URL', async () => {
  cache.clear();
  for (const variant of [stateTender._id, `${stateTender._id}-old-title`]) {
    const res = await fetch(`${base}/prerender/tenders/${variant}`, { redirect: 'manual' });
    assert.equal(res.status, 301, variant);
    assert.equal(res.headers.get('location'), `https://www.tndrr.com/tenders/${CANONICAL_SEGMENT}`);
  }
});
