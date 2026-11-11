/**
 * Readable URLs, landing pages and IndexNow. The Tender model, Redis and HTTP
 * are stubbed: no database, cache or network access.
 */
import test, { mock, after } from 'node:test';
import assert from 'node:assert/strict';

import Tender from '../src/models/Tender.js';
import { redis } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import * as backendUrl from '../src/utils/tenderUrl.js';
import * as frontendUrl from '../../frontend/src/utils/tenderUrl.js';
import { getLanding, landingSeo, landingPath, MIN_DEPARTMENT_TENDERS, LANDING_STATES } from '../src/services/landing.service.js';
import { renderLandingPage } from '../src/services/prerender.service.js';
import { generateLandingSitemap } from '../src/services/sitemap.service.js';
import { submitUrls, submitNewTenders, INDEXNOW_KEY } from '../src/services/indexNow.service.js';
import { LANDING_STATES as FRONTEND_LANDING_STATES } from '../../frontend/src/utils/landingStates.js';

env.SITE_URL = 'https://www.tndrr.com';
after(() => redis.disconnect());

// --- Readable URLs ------------------------------------------------------------
const ID = '6ab17d44e8cbe3b62d063346';
const samples = [
  { _id: ID, title: 'Request for Proposal for Selection of Consultants for formulation of GIS-Based Tourism Destination Master Plan' },
  { _id: ID, title: '[Construction of Road & Drain at Anantnag (Phase-II)]' },
  { _id: ID, title: 'Café Supply — Ñandu' },
  { _id: ID, title: '!!!' },
  { _id: ID, title: '' },
  { _id: ID, title: 'Bitumen VG-30', sourcePortal: 'GEM', sourceTenderId: 'GEM/2026/B/7944446' },
  { sourceTenderId: 'GEM/2026/B/7944446', title: 'No id' },
];

test('slugify: lowercase ASCII, & becomes and, max 60 chars cut on a word', () => {
  const { slugify } = backendUrl;
  assert.equal(slugify('Construction of Road & Drain at Anantnag (Phase-II)'), 'construction-of-road-and-drain-at-anantnag-phase-ii');
  assert.equal(slugify('Café Supply — Ñandu'), 'cafe-supply-nandu');
  assert.equal(slugify('!!!'), '');
  const long = slugify(samples[0].title);
  assert.ok(long.length <= 60, long);
  assert.ok(!long.endsWith('-'));
  assert.equal(long, 'request-for-proposal-for-selection-of-consultants-for');
});

test('tenderPath: id first, slug after; GeM under /gem-tenders; tender number fallback', () => {
  const { tenderPath } = backendUrl;
  assert.equal(tenderPath(samples[1]), `/tenders/${ID}-construction-of-road-and-drain-at-anantnag-phase-ii`);
  assert.equal(tenderPath(samples[3]), `/tenders/${ID}`);
  assert.equal(tenderPath(samples[5]), `/gem-tenders/${ID}-bitumen-vg-30`);
  assert.equal(tenderPath(samples[6]), '/gem-tenders/GEM%2F2026%2FB%2F7944446');
});

test('idFromParam: extracts the id from slugged, bare and non-id params', () => {
  const { idFromParam } = backendUrl;
  assert.equal(idFromParam(`${ID}-construction-of-road`), ID);
  assert.equal(idFromParam(ID), ID);
  assert.equal(idFromParam('2026_JSD_322410_1'), '2026_JSD_322410_1');
  assert.equal(idFromParam('GEM/2026/B/7944446'), 'GEM/2026/B/7944446');
  assert.equal(idFromParam(`${ID}abc`), `${ID}abc`, 'id must be followed by - or end');
});

test('frontend and backend URL helpers produce identical results', () => {
  for (const t of samples) {
    assert.equal(frontendUrl.tenderPath(t), backendUrl.tenderPath(t), JSON.stringify(t));
    assert.equal(frontendUrl.slugify(t.title), backendUrl.slugify(t.title));
  }
  for (const p of [`${ID}-x`, ID, 'GEM/2026/B/1', '']) assert.equal(frontendUrl.idFromParam(p), backendUrl.idFromParam(p));
  assert.deepEqual(FRONTEND_LANDING_STATES, LANDING_STATES.map(({ slug, name }) => ({ slug, name })));
});

// --- Landing pages --------------------------------------------------------------
const chain = (value) => {
  const q = {};
  for (const m of ['select', 'sort', 'limit', 'lean', 'maxTimeMS']) q[m] = () => q;
  q.then = (res, rej) => Promise.resolve(value).then(res, rej);
  return q;
};
const deptRows = [
  { _id: 'Jal Shakti Department', count: 12 },
  { _id: 'JAL SHAKTI DEPARTMENT', count: 3 }, // same slug, merged
  { _id: 'Tourism', count: 4 },
  { _id: 'Floriculture Department', count: MIN_DEPARTMENT_TENDERS - 1 }, // too thin
];
const aggregateCalls = [];
mock.method(Tender, 'aggregate', (pipeline) => {
  aggregateCalls.push(pipeline);
  const isGem = pipeline[0].$match.sourcePortal === 'GEM';
  const rows = isGem ? [{ _id: 'Portland Cement OPC 53', count: 9 }] : deptRows;
  return { option: () => Promise.resolve(rows) };
});
let lastFindFilter = null;
mock.method(Tender, 'find', (filter) => { lastFindFilter = filter; return chain([{ _id: ID, title: 'Augmentation of WSS Pahalgam', departmentName: 'Jal Shakti Department' }]); });
mock.method(Tender, 'countDocuments', () => ({ maxTimeMS: () => Promise.resolve(321) }));

test('state landing: totals, departments merged by slug, thin departments dropped', async () => {
  const data = await getLanding('tenders', 'jammu-and-kashmir');
  assert.equal(data.state.name, 'Jammu & Kashmir');
  assert.equal(data.total, 321);
  assert.deepEqual(data.departments, [
    { slug: 'jal-shakti-department', name: 'Jal Shakti Department', count: 15 },
    { slug: 'tourism', name: 'Tourism', count: 4 },
  ]);
  assert.equal(landingSeo(data).title, 'Jammu & Kashmir Government Tenders: 321 Open');
});

test('department landing: exact department names, siblings exclude itself', async () => {
  const data = await getLanding('tenders', 'jammu-and-kashmir', 'jal-shakti-department');
  assert.equal(data.department.name, 'Jal Shakti Department');
  assert.equal(data.total, 15);
  assert.deepEqual(lastFindFilter.departmentName, { $in: ['Jal Shakti Department', 'JAL SHAKTI DEPARTMENT'] });
  assert.deepEqual(data.departments.map((d) => d.slug), ['tourism']);
  assert.equal(landingPath('tenders', 'jammu-and-kashmir', 'jal-shakti-department'), '/tenders/in/jammu-and-kashmir/jal-shakti-department');
});

test('unknown state, unknown or thin department, and GeM department pages do not exist', async () => {
  assert.equal(await getLanding('tenders', 'goa'), null);
  assert.equal(await getLanding('tenders', 'jammu-and-kashmir', 'floriculture-department'), null);
  assert.equal(await getLanding('tenders', 'jammu-and-kashmir', 'nope'), null);
  assert.equal(await getLanding('gem', 'punjab', 'anything'), null);
});

test('GeM state landing includes categories; crawler HTML has breadcrumbs and item list', async () => {
  const data = await getLanding('gem', 'punjab');
  assert.deepEqual(data.categories, [{ name: 'Portland Cement OPC 53', count: 9 }]);
  const seo = landingSeo(data);
  const html = renderLandingPage(data, seo, '/gem-tenders/in/punjab');
  assert.match(html, /<h1>GeM Bids in Punjab<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.tndrr\.com\/gem-tenders\/in\/punjab">/);
  assert.ok(html.includes(`href="https://www.tndrr.com/tenders/${ID}-augmentation-of-wss-pahalgam"`));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(ld.map((x) => x['@type']), ['BreadcrumbList', 'ItemList']);
  assert.ok(html.includes('href="https://www.tndrr.com/gem-tenders/in/jammu-and-kashmir"'), 'links to other states');
});

test('landing sitemap lists state, GeM state and qualifying department pages', async () => {
  const xml = await generateLandingSitemap();
  assert.ok(xml.includes('<loc>https://www.tndrr.com/tenders/in/punjab</loc>'));
  assert.ok(xml.includes('<loc>https://www.tndrr.com/gem-tenders/in/ladakh</loc>'));
  assert.ok(xml.includes('<loc>https://www.tndrr.com/tenders/in/jammu-and-kashmir/jal-shakti-department</loc>'));
  assert.ok(!xml.includes('floriculture'));
});

// --- IndexNow -------------------------------------------------------------------
test('submitUrls batches 10,000 URLs per request with host, key and keyLocation', async () => {
  const posts = [];
  const http = { post: async (url, body) => { posts.push({ url, body }); return { status: 200 }; } };
  const urls = Array.from({ length: 10001 }, (_, i) => `https://www.tndrr.com/tenders/${i}`);
  assert.equal(await submitUrls(urls, http), 10001);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].url, 'https://api.indexnow.org/indexnow');
  assert.equal(posts[0].body.host, 'www.tndrr.com');
  assert.equal(posts[0].body.key, INDEXNOW_KEY);
  assert.equal(posts[0].body.keyLocation, `https://www.tndrr.com/${INDEXNOW_KEY}.txt`);
  assert.equal(posts[1].body.urlList.length, 1);
});

test('submitNewTenders only runs in production and advances the marker only on success', async () => {
  const store = new Map();
  mock.method(redis, 'get', async (k) => store.get(k) ?? null);
  mock.method(redis, 'set', async (k, v) => { store.set(k, v); return 'OK'; });

  const saved = env.NODE_ENV;
  try {
    env.NODE_ENV = 'development';
    assert.equal(await submitNewTenders(), null);

    env.NODE_ENV = 'production';
    const now = new Date('2026-11-11T10:00:00Z');
    const failing = { post: async () => ({ status: 429 }) };
    const r1 = await submitNewTenders({ http: failing, now });
    assert.equal(r1.submitted, 0);
    assert.equal(store.size, 0, 'marker not advanced after a rejected batch');

    const posts = [];
    const ok = { post: async (u, body) => { posts.push(body); return { status: 202 }; } };
    const r2 = await submitNewTenders({ http: ok, now });
    assert.equal(r2.submitted, r2.found);
    assert.equal(store.get('indexnow:last-created-at'), now.toISOString());
    assert.ok(posts[0].urlList[0].startsWith(`https://www.tndrr.com/tenders/${ID}-`));
  } finally {
    env.NODE_ENV = saved;
  }
});

// --- Readable department names ------------------------------------------------
import { displayDepartmentName } from '../src/utils/departmentNames.js';

test('department codes expand per state; unknown names are tidied, not invented', () => {
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'HAUDD'), 'Housing and Urban Development Department');
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'DC-PDD'), 'Power Development Department');
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'I and FC'), 'Irrigation and Flood Control Department');
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'PWD'), 'Public Works (R&B) Department');
  assert.equal(displayDepartmentName('himachal-pradesh', 'PWD'), 'Public Works Department', 'same code, different state');
  assert.equal(displayDepartmentName('punjab', 'CE-PWD(B and R)'), 'Public Works Department (B&R)');
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'FOREST DEPARTMENT'), 'Forest Department');
  assert.equal(displayDepartmentName('jammu-and-kashmir', 'SHRI MATA VAISHNO DEVI SHRINE BOARD'), 'Shri Mata Vaishno Devi Shrine Board');
  assert.equal(displayDepartmentName('punjab', 'Deptt of School Education'), 'Department of School Education');
  assert.equal(displayDepartmentName('haryana', 'Haryana Government'), 'Haryana Government');
  assert.equal(displayDepartmentName('delhi', 'DTTDC'), 'Delhi Tourism and Transportation Development Corporation (DTTDC)');
  assert.equal(displayDepartmentName('ladakh', 'XYZ'), 'XYZ', 'short unknown codes are left alone');
});

test('department pages use readable names, merge code + full name, and accept the old code URL', async () => {
  deptRows.push({ _id: 'HAUDD', count: 5 }, { _id: 'Housing and Urban Development Department', count: 2 });
  try {
    const state = await getLanding('tenders', 'jammu-and-kashmir');
    const housing = state.departments.find((d) => d.slug === 'housing-and-urban-development-department');
    assert.deepEqual(housing, { slug: 'housing-and-urban-development-department', name: 'Housing and Urban Development Department', count: 7 });
    assert.ok(!state.departments.some((d) => d.slug === 'haudd'));

    const viaOldUrl = await getLanding('tenders', 'jammu-and-kashmir', 'haudd');
    assert.equal(viaOldUrl.department.slug, 'housing-and-urban-development-department', 'old /haudd URL resolves');
    assert.deepEqual(lastFindFilter.departmentName, { $in: ['HAUDD', 'Housing and Urban Development Department'] });
    assert.equal(landingSeo(viaOldUrl).title, 'Housing and Urban Development Department Tenders in Jammu & Kashmir');
  } finally {
    deptRows.splice(-2, 2);
  }
});

test('crawler routes: old department URL 301s, unknown landing page says "Page not found" with 404', async () => {
  const express = (await import('express')).default;
  const prerenderRoutes = (await import('../src/routes/prerender.routes.js')).default;
  mock.method(redis, 'get', async () => null);
  mock.method(redis, 'setex', async () => 'OK');
  deptRows.push({ _id: 'HAUDD', count: 5 });
  const app = express();
  app.use(prerenderRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const old = await fetch(`${base}/prerender/landing/tenders/jammu-and-kashmir/haudd`, { redirect: 'manual' });
    assert.equal(old.status, 301);
    assert.equal(old.headers.get('location'), 'https://www.tndrr.com/tenders/in/jammu-and-kashmir/housing-and-urban-development-department');

    const current = await fetch(`${base}/prerender/landing/tenders/jammu-and-kashmir/housing-and-urban-development-department`);
    assert.equal(current.status, 200);
    assert.match(await current.text(), /<h1>Housing and Urban Development Department Tenders in Jammu &amp; Kashmir<\/h1>/);

    const missing = await fetch(`${base}/prerender/landing/tenders/goa`);
    assert.equal(missing.status, 404);
    const html = await missing.text();
    assert.match(html, /<h1>Page not found<\/h1>/);
    assert.match(html, /noindex/);
  } finally {
    server.close();
    deptRows.pop();
  }
});
