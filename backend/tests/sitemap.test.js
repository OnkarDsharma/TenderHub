/**
 * Sitemap generation and routes. The Tender model and Redis are stubbed, so
 * this never touches a real database or cache.
 */
import test, { mock, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import Tender from '../src/models/Tender.js';
import { redis } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import {
  CHUNK_SIZE,
  buildUrlset,
  buildSitemapIndex,
  escapeXml,
  activeTenderFilter,
  activeGemFilter,
  siteUrl,
} from '../src/services/sitemap.service.js';
import sitemapRoutes from '../src/routes/sitemap.routes.js';

const SITE = 'https://tenders.example.in';
env.SITE_URL = SITE;

// --- Stubs ------------------------------------------------------------------
const cache = new Map();
mock.method(redis, 'get', async (k) => cache.get(k) ?? null);
mock.method(redis, 'setex', async (k, _ttl, v) => { cache.set(k, v); return 'OK'; });

const oid = (n) => `66a1f0c2a9b3e41d2c7f${String(n).padStart(4, '0')}`;
let tenderDocs = [];
let gemDocs = [];
const isGemQuery = (filter) => filter.sourcePortal === 'GEM';

/** Minimal chainable query that records what the code asked for. */
const query = (rows) => {
  const q = { _skip: 0, _limit: Infinity };
  q.select = () => q;
  q.sort = () => q;
  q.skip = (n) => { q._skip = n; return q; };
  q.limit = (n) => { q._limit = n; return q; };
  q.lean = () => q;
  q.maxTimeMS = () => q;
  q.then = (res, rej) => Promise.resolve(rows.slice(q._skip, q._skip + q._limit)).then(res, rej);
  return q;
};
mock.method(Tender, 'find', (filter) => query(isGemQuery(filter) ? gemDocs : tenderDocs));
mock.method(Tender, 'countDocuments', (filter) => {
  const n = (isGemQuery(filter) ? gemDocs : tenderDocs).length;
  return { maxTimeMS: () => Promise.resolve(n) };
});
mock.method(Tender, 'findOne', (filter) => {
  const rows = isGemQuery(filter) ? gemDocs : tenderDocs;
  const q = query(rows.slice(-1));
  q.then = (res, rej) => Promise.resolve(rows.at(-1) ?? null).then(res, rej);
  return q;
});

const app = express();
app.use(sitemapRoutes);
app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const get = (path) => fetch(`${base}${path}`);

after(() => {
  server.close();
  redis.disconnect();
});

// --- Pure builders ----------------------------------------------------------
test('escapeXml escapes all five XML entities', () => {
  assert.equal(escapeXml(`a&b<c>"d"'e'`), 'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
});

test('buildUrlset emits loc, date-only lastmod, and skips invalid dates', () => {
  const xml = buildUrlset([
    { loc: `${SITE}/a?x=1&y=2`, lastmod: new Date('2026-11-05T10:20:00Z'), changefreq: 'daily' },
    { loc: `${SITE}/b`, lastmod: 'not a date' },
  ]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/tenders\.example\.in\/a\?x=1&amp;y=2<\/loc><lastmod>2026-11-05<\/lastmod><changefreq>daily<\/changefreq>/);
  assert.match(xml, /<url><loc>https:\/\/tenders\.example\.in\/b<\/loc><\/url>/);
});

test('buildSitemapIndex wraps entries in sitemapindex', () => {
  const xml = buildSitemapIndex([{ loc: `${SITE}/sitemap-static.xml` }]);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<sitemap><loc>https:\/\/tenders\.example\.in\/sitemap-static\.xml<\/loc><\/sitemap>/);
});

test('active filters exclude GeM from tenders and require confirmed GeM listings', () => {
  const now = new Date('2026-11-11T00:00:00Z');
  const t = activeTenderFilter(now);
  assert.deepEqual(t.sourcePortal, { $ne: 'GEM' });
  assert.equal(t.status, 'ACTIVE');
  assert.deepEqual(t.closingDate, { $gte: now });
  const g = activeGemFilter(now);
  assert.equal(g.sourcePortal, 'GEM');
  assert.equal(g.gemStatus, 'ACTIVE');
  assert.ok(g.lastSeenInListingAt.$gte < now);
});

test('siteUrl refuses a localhost origin in production', () => {
  const saved = { NODE_ENV: env.NODE_ENV, SITE_URL: env.SITE_URL };
  try {
    env.NODE_ENV = 'production';
    env.SITE_URL = 'http://localhost:5173';
    assert.throws(() => siteUrl(), (err) => err.status === 503);
    env.SITE_URL = 'https://tenders.example.in/';
    assert.equal(siteUrl(), 'https://tenders.example.in');
  } finally {
    Object.assign(env, saved);
  }
});

// --- Routes -----------------------------------------------------------------
test('sitemap index lists static file and one chunk per CHUNK_SIZE records', async () => {
  cache.clear();
  tenderDocs = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => ({ _id: oid(i), publishedDate: new Date('2026-11-01') }));
  gemDocs = [{ _id: oid(9000), createdAt: new Date('2026-11-09') }];

  const res = await get('/sitemap.xml');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/xml/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const xml = await res.text();
  assert.ok(xml.includes(`<loc>${SITE}/sitemap-static.xml</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/sitemap-tenders-1.xml</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/sitemap-tenders-2.xml</loc>`));
  assert.ok(!xml.includes('sitemap-tenders-3.xml'));
  assert.ok(xml.includes(`<loc>${SITE}/sitemap-gem-1.xml</loc><lastmod>2026-11-09</lastmod>`));
});

test('static sitemap lists the public marketing and list pages only', async () => {
  const xml = await (await get('/sitemap-static.xml')).text();
  for (const p of ['/', '/tenders', '/gem-tenders', '/pricing', '/about', '/contact', '/services']) {
    assert.ok(xml.includes(`<loc>${SITE}${p}</loc>`), p);
  }
  assert.ok(!/\/(login|signup|profile)</.test(xml));
});

test('tender and GeM chunks use the frontend detail paths', async () => {
  cache.clear();
  tenderDocs = [{ _id: oid(1), publishedDate: new Date('2026-11-02') }];
  gemDocs = [{ _id: oid(2), createdAt: new Date('2026-11-03') }];

  const t = await (await get('/sitemap-tenders-1.xml')).text();
  assert.ok(t.includes(`<loc>${SITE}/tenders/${oid(1)}</loc><lastmod>2026-11-02</lastmod>`));
  const g = await (await get('/sitemap-gem-1.xml')).text();
  assert.ok(g.includes(`<loc>${SITE}/gem-tenders/${oid(2)}</loc><lastmod>2026-11-03</lastmod>`));
});

test('second chunk holds the overflow; out-of-range and unknown files are 404', async () => {
  cache.clear();
  tenderDocs = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => ({ _id: oid(i), publishedDate: new Date('2026-11-01') }));
  const second = await (await get('/sitemap-tenders-2.xml')).text();
  assert.equal((second.match(/<url>/g) || []).length, 1);
  assert.ok(second.includes(`/tenders/${oid(CHUNK_SIZE)}<`));

  assert.equal((await get('/sitemap-tenders-3.xml')).status, 404);
  assert.equal((await get('/sitemap-users-1.xml')).status, 404);
  assert.equal((await get('/sitemap-tenders-abc.xml')).status, 404);
  assert.equal((await get('/sitemap-tenders-0.xml')).status, 404);
});

test('an empty first chunk is still a valid urlset', async () => {
  cache.clear();
  gemDocs = [];
  const res = await get('/sitemap-gem-1.xml');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<urlset[^>]*>\s*<\/urlset>/);
});

test('responses are served from cache and survive a Redis outage', async () => {
  cache.clear();
  tenderDocs = [{ _id: oid(7), publishedDate: new Date('2026-11-04') }];
  await get('/sitemap-tenders-1.xml');
  tenderDocs = [];
  const cachedXml = await (await get('/sitemap-tenders-1.xml')).text();
  assert.ok(cachedXml.includes(oid(7)), 'second request should come from cache');

  redis.get.mock.mockImplementationOnce(async () => { throw new Error('redis down'); });
  const res = await get('/sitemap-static.xml');
  assert.equal(res.status, 200);
});
