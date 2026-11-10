import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeMAdapter,
  GeMHttpClient,
  buildListingUpdate,
  buildPdfUpdate,
  canonicalRegionState,
  computeConsigneeStates,
  listConsigneeState,
  listingRowFromDoc,
  mergeStateListings,
  parseGeMListingDate,
  resolveConsigneeStates,
} from '../src/services/adapters/GeMAdapter.js';
import { buildGeMScopeConditions } from '../src/routes/gem.routes.js';
import { parseGeMBidPdfText, GEM_PARSER_VERSION } from '../src/utils/gemPdfParser.js';

const NOW = new Date('2026-11-05T06:00:00Z');
const [JK, HP, PB, LADAKH] = resolveConsigneeStates('ALL');

// Shape of a real search-bids row (GeM stores IST wall-clock with a "Z").
const doc = (n, overrides = {}) => ({
  b_id: [9965000 + n],
  b_bid_number: [`GEM/2026/B/81000${String(n).padStart(2, '0')}`],
  b_bid_type: [1],
  b_category_name: [`Item ${n}`],
  b_total_quantity: [n],
  ba_official_details_minName: ['Ministry of Defence'],
  ba_official_details_deptName: ['Department of Military Affairs'],
  final_start_date_sort: ['2026-10-23T20:16:15Z'],
  final_end_date_sort: ['2026-11-13T20:00:00Z'],
  ...overrides,
});
const row = (n, overrides) => listingRowFromDoc(doc(n, overrides));

test('listing timestamps are IST wall-clock despite the Z suffix', () => {
  // The PDF for this bid says "13-11-2026 20:00:00" (IST).
  assert.equal(parseGeMListingDate(['2026-11-13T20:00:00Z']).toISOString(), '2026-11-13T14:30:00.000Z');
  assert.equal(parseGeMListingDate(null), null);
  assert.equal(parseGeMListingDate('garbage'), null);
});

test('state inputs resolve to the six supported consignee states only', () => {
  assert.deepEqual(resolveConsigneeStates('ALL').map((s) => s.key), ['JAMMU & KASHMIR', 'HIMACHAL PRADESH', 'PUNJAB', 'LADAKH', 'HARYANA', 'DELHI']);
  assert.equal(resolveConsigneeStates('HR')[0].key, 'HARYANA');
  assert.equal(resolveConsigneeStates('nct of delhi')[0].key, 'DELHI');
  assert.equal(canonicalRegionState('DL'), 'Delhi');
  assert.equal(resolveConsigneeStates('J&K')[0].canonical, 'Jammu & Kashmir');
  assert.equal(resolveConsigneeStates('punjab')[0].key, 'PUNJAB');
  assert.throws(() => resolveConsigneeStates('Gujarat'), /Unsupported GeM state/);
  assert.equal(canonicalRegionState('Gujarat'), null);
  assert.equal(canonicalRegionState('HP'), 'Himachal Pradesh');
});

test('listing rows map bid and RA document URLs and reject rows without ids', () => {
  assert.match(row(1).pdfUrl, /showbidDocument\/9965001$/);
  assert.match(row(2, { b_bid_type: [2] }).pdfUrl, /showradocumentPdf\/9965002$/);
  assert.match(row(3, { b_bid_type: [5] }).pdfUrl, /showdirectradocumentPdf\/9965003$/);
  assert.equal(listingRowFromDoc({ b_id: [1] }), null);
  assert.equal(listingRowFromDoc({ b_bid_number: ['GEM/2026/B/1'] }), null);
});

test('a complete pass is authoritative for its state; an incomplete one changes nothing', () => {
  // Seen in Punjab now; J&K pass complete and bid absent -> J&K removed.
  assert.deepEqual(computeConsigneeStates(['Jammu & Kashmir'], ['Punjab'], ['Jammu & Kashmir', 'Punjab']), ['Punjab']);
  // J&K pass failed/incomplete -> J&K kept.
  assert.deepEqual(computeConsigneeStates(['Jammu & Kashmir'], ['Punjab'], ['Punjab']), ['Jammu & Kashmir', 'Punjab']);
  // Repeated sweeps of the same lists are stable.
  const once = computeConsigneeStates([], ['Ladakh'], ['Ladakh']);
  assert.deepEqual(computeConsigneeStates(once, ['Ladakh'], ['Ladakh']), ['Ladakh']);
});

test('a bid delivering to several states keeps all of them', () => {
  const shared = row(7);
  const merged = mergeStateListings([
    { state: JK, rows: [shared, row(8)] },
    { state: LADAKH, rows: [shared] },
  ]);
  assert.deepEqual(merged.get(shared.bidNumber).states, ['Jammu & Kashmir', 'Ladakh']);
  const op = buildListingUpdate(shared, merged.get(shared.bidNumber).states, ['Jammu & Kashmir', 'Ladakh'], null, NOW);
  assert.deepEqual(op.updateOne.update.$set.consigneeStates, ['Jammu & Kashmir', 'Ladakh']);
  assert.equal(op.updateOne.update.$set.state, 'Jammu & Kashmir');
});

test('Ministry of Defence bids listed under J&K are J&K bids (not "Other")', () => {
  const op = buildListingUpdate(row(1), ['Jammu & Kashmir'], ['Jammu & Kashmir'], null, NOW);
  const set = op.updateOne.update.$set;
  assert.deepEqual(set.consigneeStates, ['Jammu & Kashmir']);
  assert.equal(set.state, 'Jammu & Kashmir');
  assert.equal(set.gemStatus, 'ACTIVE');
  assert.equal(set.gemPdfRefreshDue, true);
  assert.equal(set.closingDate.toISOString(), '2026-11-13T14:30:00.000Z');
  assert.equal(op.updateOne.upsert, true);
});

test('listing updates never touch PDF-derived official fields', () => {
  const existing = { consigneeStates: ['Punjab'], pdfParseStatus: 'COMPLETED', gemParserVersion: GEM_PARSER_VERSION, gemPdfUrl: row(4).pdfUrl, closingDate: row(4).closingDate };
  for (let sweep = 0; sweep < 3; sweep += 1) {
    const set = buildListingUpdate(row(4), ['Punjab'], ['Punjab'], existing, NOW).updateOne.update.$set;
    for (const key of ['officialState', 'rawMinistryStateName', 'departmentName', 'title', 'location', 'deliveryStations']) {
      assert.equal(key in set, false, `${key} must not be overwritten by listing data`);
    }
    assert.equal(set.gemPdfRefreshDue, false);
  }
});

test('changed closing date, document link or parser version re-queues the PDF', () => {
  const base = { consigneeStates: ['Punjab'], pdfParseStatus: 'COMPLETED', gemParserVersion: GEM_PARSER_VERSION, gemPdfUrl: row(4).pdfUrl, closingDate: row(4).closingDate };
  const extended = row(4, { final_end_date_sort: ['2026-11-20T20:00:00Z'] });
  const ext = buildListingUpdate(extended, ['Punjab'], ['Punjab'], base, NOW).updateOne.update.$set;
  assert.equal(ext.gemPdfRefreshDue, true);
  assert.equal(ext.closingDate.toISOString(), '2026-11-20T14:30:00.000Z', 'current listing date wins (extension)');
  assert.equal(buildListingUpdate(row(4), ['Punjab'], ['Punjab'], { ...base, gemPdfUrl: 'https://bidplus.gem.gov.in/showbidDocument/1' }, NOW).updateOne.update.$set.gemPdfRefreshDue, true);
  assert.equal(buildListingUpdate(row(4), ['Punjab'], ['Punjab'], { ...base, gemParserVersion: '1.0.0' }, NOW).updateOne.update.$set.gemPdfRefreshDue, true);
});

test('a listed bid past its closing time is CLOSED_BY_DATE', () => {
  const past = row(5, { final_end_date_sort: ['2026-11-01T10:00:00Z'] });
  const set = buildListingUpdate(past, ['Ladakh'], ['Ladakh'], null, NOW).updateOne.update.$set;
  assert.equal(set.gemStatus, 'CLOSED_BY_DATE');
  assert.equal(set.status, 'CLOSED');
});

const PDF_TEXT = ({ bid = 'GEM/2026/B/8100001', ministry = 'Ministry Of Defence', delivery = '1 ***********KARGIL 1 60' } = {}) => `Bid Document
Bid Number: ${bid}
Dated: 23-10-2026
Bid End Date/Time 13-11-2026 20:00:00
Bid Opening Date/Time 14-11-2026 20:30:00
Ministry/State Name ${ministry}
Department Name Department Of Military Affairs
Organisation Name Indian Army
Item Category Punjabi Masala, Srinagar Saffron
EMD Amount 25000
Consignees/Reporting Officer and Quantity
S.No. Consignee Reporting/Officer Address Quantity Delivery Days
${delivery}
Buyer Added Bid Specific Terms and Conditions
Leh Jammu Amritsar are mentioned here only in terms text`;

test('bid documents: opening after closing is normal, not a date error', () => {
  const parsed = parseGeMBidPdfText(PDF_TEXT());
  assert.equal(parsed.documentType, 'BID');
  assert.equal(parsed.validationFlags.includes('DATE_ORDER_INVALID'), false);
  assert.equal(parsed.bidEndDate.toISOString(), '2026-11-13T14:30:00.000Z');
});

test('RA documents: start must precede end', () => {
  const ok = parseGeMBidPdfText('RA Details\nBid Number: GEM/2026/R/762098\nRA Start Date/Time 10-11-2026 10:00:00\nRA End Date/Time 12-11-2026 10:00:00\nMinistry/State Name Punjab');
  assert.equal(ok.documentType, 'RA');
  assert.equal(ok.validationFlags.includes('DATE_ORDER_INVALID'), false);
  const bad = parseGeMBidPdfText('RA Details\nBid Number: GEM/2026/R/762098\nRA Start Date/Time 12-11-2026 10:00:00\nRA End Date/Time 10-11-2026 10:00:00');
  assert.equal(bad.validationFlags.includes('DATE_ORDER_INVALID'), true);
});

test('PDF update records buyer ministry/state but never sets geography', () => {
  const r = row(1);
  const parsed = parseGeMBidPdfText(PDF_TEXT({ bid: r.bidNumber, ministry: 'Gujarat' }));
  const { ok, update } = buildPdfUpdate({ row: r, parsed, rawText: 'x', sha256: 'abc', now: NOW });
  assert.equal(ok, true);
  assert.equal(update.$set.officialState, 'Gujarat');
  for (const key of ['state', 'consigneeStates', 'closingDate']) assert.equal(key in update.$set, false, `${key} must come from the listing`);
});

test('delivery cities come only from the consignee section', () => {
  const r = row(1);
  const { update } = buildPdfUpdate({ row: r, parsed: parseGeMBidPdfText(PDF_TEXT({ bid: r.bidNumber })), rawText: 'x', now: NOW });
  // "Srinagar" (item name) and Leh/Jammu/Amritsar (terms text) are not delivery stations.
  assert.deepEqual(update.$set.deliveryStations, ['Kargil']);
  assert.equal(update.$set.location, 'Kargil');
  assert.equal(update.$set.locationVerificationStatus, 'VERIFIED');
});

test('multiple delivery stations are all retained', () => {
  const r = row(1);
  const parsed = parseGeMBidPdfText(PDF_TEXT({ bid: r.bidNumber, delivery: '1 ***LEH 1 60\n2 ***KARGIL 2 60\n3 ***SRINAGAR 1 60' }));
  assert.deepEqual(buildPdfUpdate({ row: r, parsed, now: NOW }).update.$set.deliveryStations.sort(), ['Kargil', 'Leh', 'Srinagar']);
});

test('missing consignee section gives no location, never a J&K default', () => {
  const r = row(1);
  const parsed = parseGeMBidPdfText(`Bid Number: ${r.bidNumber}\nMinistry/State Name Ministry Of Defence\nItem Category Jammu Kashmir Srinagar supplies`);
  const set = buildPdfUpdate({ row: r, parsed, now: NOW }).update.$set;
  assert.equal(set.location, null);
  assert.deepEqual(set.deliveryStations, []);
  assert.equal(set.locationVerificationStatus, 'NOT_PROVIDED');
  assert.ok(parsed.validationFlags.includes('DELIVERY_SECTION_NOT_FOUND'));
});

test('a PDF for a different bid is rejected and attaches nothing', () => {
  const r = row(1);
  const parsed = parseGeMBidPdfText(PDF_TEXT({ bid: 'GEM/2026/B/9999999' }));
  const { ok, update, error } = buildPdfUpdate({ row: r, parsed, now: NOW });
  assert.equal(ok, false);
  assert.match(error, /mismatch/);
  assert.equal(update.$set.pdfParseStatus, 'FAILED');
  assert.equal('officialState' in update.$set, false);
  assert.deepEqual(update.$inc, { gemPdfFailCount: 1 });
});

test('PDF closing date disagreeing with the listing is flagged, listing kept', () => {
  const r = row(1, { final_end_date_sort: ['2026-11-20T20:00:00Z'] });
  const { update } = buildPdfUpdate({ row: r, parsed: parseGeMBidPdfText(PDF_TEXT({ bid: r.bidNumber })), now: NOW });
  assert.ok(update.$set.gemValidationFlags.includes('SOURCE_CONFLICT'));
  assert.equal('closingDate' in update.$set, false);
});

// --- HTTP client against recorded GeM response shapes ---------------------

// Fake bidplus: `bids` maps GeM state key -> docs. Like the real endpoint it
// filters by closing-date window and, with `unstable`, returns each page from
// a freshly shuffled order (page 2 may repeat page 1 and skip others).
function fakeGeM(bids, { failOn, unstable = false } = {}) {
  const calls = [];
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    const headers = { getSetCookie: () => ['ci_session=abc; path=/'] };
    if (url.endsWith('/advance-search')) {
      return { ok: true, status: 200, headers, text: async () => "data: {'payload': x, 'csrf_bd_gem_nk': '290f694c755324f65929dff99a58a36b'}" };
    }
    const payload = JSON.parse(new URLSearchParams(opts.body).get('payload'));
    if (failOn && failOn(payload)) return { ok: false, status: 503, headers, json: async () => ({}) };
    let docs = (bids[payload.state_name_con] || []).filter((d) => {
      const day = d.final_end_date_sort[0].slice(0, 10);
      return (!payload.bidEndFromCon || day >= payload.bidEndFromCon) && (!payload.bidEndToCon || day <= payload.bidEndToCon);
    });
    if (unstable) docs = [...docs].sort(() => rand() - 0.5);
    const pageDocs = docs.slice((payload.page - 1) * 10, payload.page * 10);
    const body = docs.length ? { code: 200, response: { response: { numFound: docs.length, start: (payload.page - 1) * 10, docs: pageDocs } } } : { status: 0, code: 404, message: 'No data found' };
    // Real GeM sends "No data found" with HTTP 404.
    return { ok: Boolean(docs.length), status: docs.length ? 200 : 404, headers, json: async () => body };
  };
  return { fetchImpl, calls };
}
const closingOn = (n, day) => doc(n, { final_end_date_sort: [`${day}T20:00:00Z`] });

test('client sends the consignee search payload with CSRF and session cookie', async () => {
  const { fetchImpl, calls } = fakeGeM({ LADAKH: [doc(1)] });
  const client = new GeMHttpClient({ fetchImpl });
  const res = await client.searchConsigneeState('LADAKH', 1);
  assert.equal(res.numFound, 1);
  const post = calls.at(-1);
  assert.match(post.url, /\/search-bids$/);
  const form = new URLSearchParams(post.opts.body);
  assert.equal(form.get('csrf_bd_gem_nk'), '290f694c755324f65929dff99a58a36b');
  assert.deepEqual(JSON.parse(form.get('payload')), { searchType: 'con', state_name_con: 'LADAKH', city_name_con: '', bidEndFromCon: '', bidEndToCon: '', page: 1 });
  assert.equal(post.opts.headers.Cookie, 'ci_session=abc');
});

test('client treats "No data found" as empty and rejects unknown shapes', async () => {
  const { fetchImpl } = fakeGeM({});
  const client = new GeMHttpClient({ fetchImpl });
  assert.deepEqual(await client.searchConsigneeState('LADAKH', 1), { numFound: 0, docs: [] });
  const broken = new GeMHttpClient({ fetchImpl: async (url) => (url.endsWith('/advance-search')
    ? { ok: true, status: 200, headers: {}, text: async () => "'csrf_bd_gem_nk': 'abc123'" }
    : { ok: true, status: 200, headers: {}, json: async () => ({ code: 200, response: {} }) }) });
  await assert.rejects(broken.searchConsigneeState('LADAKH', 1), /not recognised/);
});

test('unstable paging still collects every bid via closing-date windows', async () => {
  // 35 bids closing on one busy day plus a sparse tail: pages are shuffled per request.
  const bids = [
    ...Array.from({ length: 35 }, (_, i) => closingOn(i, '2026-11-09')),
    ...Array.from({ length: 6 }, (_, i) => closingOn(50 + i, `2026-12-${String(10 + i * 3).padStart(2, '0')}`)),
  ];
  const client = new GeMHttpClient({ fetchImpl: fakeGeM({ PUNJAB: bids }, { unstable: true }).fetchImpl });
  const result = await listConsigneeState(client, PB, { delay: 0, now: NOW });
  assert.equal(result.numFound, 41);
  assert.equal(result.rows.length, 41);
  assert.equal(result.complete, true);
});

test('a single unstable pass misses bids, which is why windows are re-read', async () => {
  const bids = Array.from({ length: 35 }, (_, i) => closingOn(i, '2026-11-09'));
  const client = new GeMHttpClient({ fetchImpl: fakeGeM({ PUNJAB: bids }, { unstable: true }).fetchImpl });
  const seen = new Set();
  for (let page = 1; page <= 4; page += 1) (await client.searchConsigneeState('PUNJAB', page)).docs.forEach((d) => seen.add(d.b_bid_number[0]));
  assert.ok(seen.size < 35, `one pass saw ${seen.size}/35`);
});

test('a state GeM reports as empty is never a complete (delisting) pass', async () => {
  const client = new GeMHttpClient({ fetchImpl: fakeGeM({}).fetchImpl });
  const result = await listConsigneeState(client, LADAKH, { delay: 0, now: NOW });
  assert.equal(result.numFound, 0);
  assert.equal(result.complete, false);
});

test('running out of request budget makes the state incomplete', async () => {
  const bids = Array.from({ length: 40 }, (_, i) => closingOn(i, `2026-11-${String(6 + (i % 20)).padStart(2, '0')}`));
  const client = new GeMHttpClient({ fetchImpl: fakeGeM({ PUNJAB: bids }).fetchImpl });
  const result = await listConsigneeState(client, PB, { delay: 0, now: NOW, maxRequests: 3 });
  assert.equal(result.complete, false);
});

// --- Sync orchestration with an in-memory model stand-in ------------------

function fakeModel({ storedActive = {} } = {}) {
  const log = { bulkWrite: [], updateMany: [] };
  return {
    log,
    find: () => ({ lean: async () => [] }),
    countDocuments: async (filter) => storedActive[filter.consigneeStates] ?? 0,
    bulkWrite: async (ops) => { log.bulkWrite.push(...ops); },
    updateMany: async (filter, update) => { log.updateMany.push({ filter, update }); return { modifiedCount: 0 }; },
    updateOne: async () => {},
  };
}
const quietLogger = { warn() {}, info() {}, error() {} };

test('a failed state is reported and never delisted; others still sync', async () => {
  const { fetchImpl } = fakeGeM({ LADAKH: [doc(1)], PUNJAB: [doc(2)] }, { failOn: (p) => p.state_name_con === 'PUNJAB' });
  const model = fakeModel();
  const adapter = new GeMAdapter({ TenderModel: model, clientFactory: () => new GeMHttpClient({ fetchImpl }) });
  const report = await adapter.syncConsigneeStates({ states: ['LADAKH', 'PUNJAB'], pdfLimit: 0, delay: 500, now: NOW, log: quietLogger });
  assert.equal(report.states.Punjab.complete, false);
  assert.match(report.errors[0], /^Punjab:/);
  assert.equal(report.states.Ladakh.complete, true);
  assert.equal(model.log.bulkWrite.length, 1);
  const pulled = model.log.updateMany.filter((u) => u.update.$pull).map((u) => u.update.$pull.consigneeStates);
  assert.deepEqual(pulled, ['Ladakh'], 'only the completed state may remove bids');
});

test('a suspiciously small complete list does not delist stored bids', async () => {
  const { fetchImpl } = fakeGeM({ 'JAMMU & KASHMIR': [doc(1)] });
  const model = fakeModel({ storedActive: { 'Jammu & Kashmir': 1900 } });
  const adapter = new GeMAdapter({ TenderModel: model, clientFactory: () => new GeMHttpClient({ fetchImpl }) });
  const report = await adapter.syncConsigneeStates({ states: 'JK', pdfLimit: 0, delay: 500, now: NOW });
  assert.match(report.states['Jammu & Kashmir'].delistingSkipped, /only 1 listed vs 1900 stored/);
  assert.equal(model.log.updateMany.some((u) => u.update.$pull), false);
});

test('dry run writes nothing', async () => {
  const { fetchImpl } = fakeGeM({ LADAKH: [doc(1)] });
  const model = fakeModel();
  const adapter = new GeMAdapter({ TenderModel: model, clientFactory: () => new GeMHttpClient({ fetchImpl }) });
  const report = await adapter.syncConsigneeStates({ states: 'LADAKH', dryRun: true, delay: 500, now: NOW });
  assert.equal(report.listing.inserted, 1);
  assert.equal(model.log.bulkWrite.length, 0);
  assert.equal(model.log.updateMany.length, 0);
});

// --- API scope -------------------------------------------------------------

test('API scope filters by delivery state and never by Ministry/State', () => {
  const all = buildGeMScopeConditions({}, NOW);
  assert.deepEqual(all[1], { consigneeStates: { $in: ['Jammu & Kashmir', 'Himachal Pradesh', 'Punjab', 'Ladakh', 'Haryana', 'Delhi'] } });
  assert.deepEqual(buildGeMScopeConditions({ state: 'Punjab' }, NOW)[1], { consigneeStates: 'Punjab' });
  assert.deepEqual(buildGeMScopeConditions({ state: 'Gujarat' }, NOW)[1], { _id: null });
  assert.equal(JSON.stringify(all).includes('officialState'), false);
  const active = all.at(-1);
  assert.equal(active.gemStatus, 'ACTIVE');
  assert.ok(active.lastSeenInListingAt.$gte instanceof Date);
});

test('archived view includes bids no longer listed on GeM', () => {
  const archived = buildGeMScopeConditions({ status: 'archived' }, NOW).at(-1);
  assert.deepEqual(archived.$or[1], { gemStatus: 'NOT_LISTED' });
});
