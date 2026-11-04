/**
 * @file backend/src/services/adapters/GeMAdapter.js
 * @description Government e-Marketplace (bidplus.gem.gov.in) adapter for the
 * four northern regions: Jammu & Kashmir, Ladakh, Himachal Pradesh, Punjab.
 *
 * Geography comes from GeM's own "Search by Consignee Location"
 * (search-bids, searchType "con"): a bid belongs to a state when GeM lists it
 * under that consignee state. No keyword search is used, so a Gujarat bid
 * mentioning "Punjabi Masala" can never be included. The PDF's
 * "Ministry/State Name" is kept as buyer information only; for central
 * ministries (most bids in these regions) it names a ministry, not a place.
 *
 * Each sync runs in two passes:
 *   1. Listing pass: every page of every state's open-bid list. Updates
 *      consignee states, closing date and freshness for all listed bids.
 *   2. PDF pass: downloads/parses documents only for new or changed bids,
 *      capped per run so a run fits the CI time limit.
 */

import Tender from '../../models/Tender.js';
import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { extractTextFromPdfBuffer, parseGeMBidPdfText, GEM_PARSER_VERSION } from '../../utils/gemPdfParser.js';
import pino from 'pino';
import { createHash } from 'node:crypto';

const logger = pino();

const GEM_BASE_URL = 'https://bidplus.gem.gov.in';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 10; // GeM search-bids returns 10 rows per page.
const MAX_PDF_FAILURES = 3;
// A "complete" pass that sees far fewer bids than are stored for a state is
// treated as a GeM-side glitch: nothing is marked NOT_LISTED from it.
const MIN_DELIST_COVERAGE = 0.5;

/** Exact values accepted by GeM's consignee-state search (verified live). */
export const GEM_CONSIGNEE_STATES = [
  { key: 'JAMMU & KASHMIR', canonical: 'Jammu & Kashmir', aliases: ['JK', 'J&K', 'JAMMU AND KASHMIR', 'JAMMU', 'KASHMIR'] },
  { key: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh', aliases: ['HP', 'HIMACHAL'] },
  { key: 'PUNJAB', canonical: 'Punjab', aliases: ['PB'] },
  { key: 'LADAKH', canonical: 'Ladakh', aliases: [] },
];
export const GEM_REGION_STATES = GEM_CONSIGNEE_STATES.map((s) => s.canonical);

/** Resolves 'ALL', a GeM key, a canonical name or an alias to state configs. */
export function resolveConsigneeStates(input) {
  if (!input || String(input).trim().toUpperCase() === 'ALL') return [...GEM_CONSIGNEE_STATES];
  const list = Array.isArray(input) ? input : [input];
  return list.map((value) => {
    const upper = String(value).trim().toUpperCase();
    const match = GEM_CONSIGNEE_STATES.find((s) => s.key === upper || s.canonical.toUpperCase() === upper || s.aliases.includes(upper));
    if (!match) throw new Error(`Unsupported GeM state "${value}". Use one of: ${GEM_REGION_STATES.join(', ')} or ALL`);
    return match;
  });
}

/** Canonical region state for an API filter value, or null. */
export function canonicalRegionState(value) {
  try {
    return value ? resolveConsigneeStates(value)[0].canonical : null;
  } catch {
    return null;
  }
}

/**
 * GeM listing timestamps are IST wall-clock times with a misleading "Z"
 * suffix: "2026-11-13T20:00:00Z" is 13-11-2026 20:00 IST in the bid PDF.
 */
export function parseGeMListingDate(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parses any date representation (Date, ISO, array, or DD-MM-YYYY [time]) as
 * IST where no zone is given. Kept for scripts that import it.
 */
export function safeDate(val, fallback = new Date()) {
  if (!val) return fallback;
  if (Array.isArray(val) && val.length > 0) val = val[0];
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?)?/i);
    if (dmy) {
      const [, day, month, year, hh = '00', mm = '00', ss = '00', ampm] = dmy;
      let hour = parseInt(hh, 10);
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
      }
      const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mm}:${ss}+05:30`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

const first = (value) => (Array.isArray(value) ? value[0] : value);
const cleanText = (value) => {
  const text = first(value);
  return text === undefined || text === null ? null : String(text).replace(/\s+/g, ' ').trim() || null;
};

/** Maps one search-bids row to a listing record, or null without stable ids. */
export function listingRowFromDoc(doc) {
  const bId = first(doc?.b_id) ?? doc?.id;
  const bidNumber = cleanText(doc?.b_bid_number);
  if (!bId || !bidNumber) return null;
  const bidType = Number(first(doc.b_bid_type));
  let pdfPath = 'showbidDocument';
  if (bidType === 5) pdfPath = 'showdirectradocumentPdf';
  else if (bidType === 2) pdfPath = 'showradocumentPdf';
  return {
    bidNumber,
    bId: String(bId),
    bidType: Number.isFinite(bidType) ? bidType : null,
    pdfUrl: `${GEM_BASE_URL}/${pdfPath}/${bId}`,
    items: cleanText(doc.b_category_name) || cleanText(doc.bd_category_name) || cleanText(doc.bbt_title),
    quantity: first(doc.b_total_quantity) ?? null,
    ministry: cleanText(doc.ba_official_details_minName),
    department: cleanText(doc.ba_official_details_deptName),
    publishedDate: parseGeMListingDate(doc.final_start_date_sort),
    closingDate: parseGeMListingDate(doc.final_end_date_sort),
  };
}

/**
 * Consignee states after this run. A state whose pass completed is
 * authoritative (added if seen, removed if not); any other state keeps its
 * previous value because an incomplete pass proves nothing about absence.
 */
export function computeConsigneeStates(existingStates = [], seenStates = [], completedStates = []) {
  const completed = new Set(completedStates);
  const result = new Set((existingStates || []).filter((s) => !completed.has(s)));
  for (const s of seenStates) result.add(s);
  return GEM_REGION_STATES.filter((s) => result.has(s));
}

const sameTime = (a, b) => Boolean(a && b && Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60000);

/**
 * Builds the Mongo update for a bid seen in this run's listing pass.
 * Listing data is GeM's current record, so it owns closing date, published
 * date and status. Descriptive fields fill in only until a PDF has been parsed.
 */
export function buildListingUpdate(row, seenStates, completedStates, existing, now) {
  const consigneeStates = computeConsigneeStates(existing?.consigneeStates, seenStates, completedStates);
  const closed = row.closingDate && row.closingDate < now;
  const pdfParsed = existing?.pdfParseStatus === 'COMPLETED';
  const urlChanged = Boolean(existing?.gemPdfUrl && existing.gemPdfUrl !== row.pdfUrl);
  const closingChanged = Boolean(existing?.closingDate && row.closingDate && !sameTime(existing.closingDate, row.closingDate));
  const parserOutdated = Boolean(pdfParsed && existing.gemParserVersion !== GEM_PARSER_VERSION);
  const refreshDue = !existing || !pdfParsed || urlChanged || closingChanged || parserOutdated || Boolean(existing.gemPdfRefreshDue);

  const set = {
    sourcePortal: 'GEM',
    sourceTenderId: row.bidNumber,
    tenderReferenceNumber: row.bidNumber,
    departmentCode: 'GEM',
    consigneeStates,
    state: consigneeStates[0] || 'Other',
    lastSeenInListingAt: now,
    lastCheckedAt: now,
    gemStatus: closed ? 'CLOSED_BY_DATE' : 'ACTIVE',
    status: closed ? 'CLOSED' : 'ACTIVE',
    gemPdfUrl: row.pdfUrl,
    detailsUrl: row.pdfUrl,
    pdfUrls: [row.pdfUrl],
    gemPdfRefreshDue: refreshDue,
  };
  if (row.closingDate) {
    set.closingDate = row.closingDate;
    set.closingDateStr = row.closingDate.toISOString();
  }
  if (row.publishedDate) {
    set.publishedDate = row.publishedDate;
    set.publishedDateStr = row.publishedDate.toISOString();
  }
  if (urlChanged) set.gemPdfFailCount = 0;
  if (!pdfParsed) {
    set.title = (row.items || `Title not confirmed (${row.bidNumber})`).slice(0, 500);
    set.departmentName = row.department || row.ministry || 'Not confirmed';
    set.organisationChain = [row.ministry, row.department].filter(Boolean).join(' > ');
    set.workDescription = ['[GeM Procurement]', row.items ? `Category: ${row.items}` : null, row.quantity !== null && row.quantity !== undefined ? `Total Quantity: ${row.quantity}` : null].filter(Boolean).join('\n');
  }

  const setOnInsert = {
    tenderCategory: 'Goods',
    tenderType: row.bidType === 2 || row.bidType === 5 ? 'GeM Reverse Auction' : 'GeM Bid',
    formOfContract: 'GeM Contract',
    estimatedValue: null,
    emdAmount: null,
    location: null,
    locationVerificationStatus: 'NOT_PROVIDED',
    officialStateConfidence: 'unknown',
    pdfFetchStatus: 'PENDING',
    pdfParseStatus: 'PENDING',
    gemPdfFailCount: 0,
    gemDocumentType: row.bidType === 2 || row.bidType === 5 ? 'RA' : 'BID',
  };
  if (urlChanged) delete setOnInsert.gemPdfFailCount;

  return {
    updateOne: {
      filter: { sourcePortal: 'GEM', sourceTenderId: row.bidNumber },
      update: { $set: set, $setOnInsert: setOnInsert },
      upsert: true,
    },
  };
}

/**
 * Builds the update for a downloaded PDF. Returns { update, ok, error }.
 * The PDF never changes geography or closing date (the listing owns those);
 * a closing-date disagreement is recorded as SOURCE_CONFLICT.
 */
export function buildPdfUpdate({ row, parsed, rawText, sha256, now }) {
  const failFlags = [];
  if (!parsed?.bidNumber) failFlags.push('BID_NUMBER_MISSING');
  else if (parsed.bidNumber.toUpperCase() !== row.bidNumber.toUpperCase()) failFlags.push('BID_NUMBER_MISMATCH');
  if (failFlags.length) {
    const error = failFlags[0] === 'BID_NUMBER_MISMATCH'
      ? `PDF bid number mismatch: expected ${row.bidNumber}, found ${parsed.bidNumber}`
      : 'PDF bid number missing; document not attached';
    return {
      ok: false,
      error,
      update: {
        $set: { pdfFetchStatus: 'COMPLETED', pdfParseStatus: 'FAILED', gemPdfFetchedAt: now, gemPdfError: error, gemPdfRefreshDue: false },
        $addToSet: { gemValidationFlags: { $each: failFlags } },
        $inc: { gemPdfFailCount: 1 },
      },
    };
  }

  const flags = [...(parsed.validationFlags || [])];
  if (row.closingDate && parsed.bidEndDate && !sameTime(row.closingDate, parsed.bidEndDate)) flags.push('SOURCE_CONFLICT');
  const deliveryStations = parsed.deliveryLocations || [];
  const locationVerificationStatus = deliveryStations.length
    ? 'VERIFIED'
    : (parsed.rawDeliverySection ? 'UNVERIFIED' : 'NOT_PROVIDED');
  const orgChain = [parsed.ministryName, parsed.departmentName, parsed.organisationName].filter(Boolean).join(' > ');
  const title = parsed.itemCategory || row.items || `Title not confirmed (${row.bidNumber})`;
  const safeName = row.bidNumber.replace(/[/\\?%*:|"<>]/g, '_');

  const set = {
    title: String(title).slice(0, 500),
    officialState: parsed.ministryStateName || null,
    rawMinistryStateName: parsed.ministryStateName || null,
    officialStateConfidence: parsed.fieldConfidence?.officialState || 'unknown',
    departmentName: parsed.departmentName || row.department || row.ministry || 'Not confirmed',
    organisationChain: orgChain || [row.ministry, row.department].filter(Boolean).join(' > '),
    emdAmount: parsed.emdAmount ?? null,
    feePayableAt: parsed.beneficiary || null,
    formOfContract: parsed.bidValidityDays ? `${parsed.bidValidityDays} Days Validity` : 'GeM Contract',
    bidOpeningDate: parsed.bidOpeningDate || parsed.raStartDate || null,
    location: deliveryStations.length ? deliveryStations.join(', ') : null,
    deliveryStations,
    rawDeliverySection: parsed.rawDeliverySection || null,
    locationVerificationStatus,
    workDescription: [
      '[GeM Procurement]',
      title ? `Category: ${title}` : null,
      parsed.totalQuantity !== null && parsed.totalQuantity !== undefined ? `Total Quantity: ${parsed.totalQuantity}` : null,
      deliveryStations.length ? `Delivery Stations: ${deliveryStations.join(', ')}` : null,
    ].filter(Boolean).join('\n'),
    documents: [{ sNo: 1, documentName: `${safeName}_Bid_Document.pdf`, description: `Official GeM document for ${row.bidNumber}`, fileUrl: row.pdfUrl }],
    gemDocumentType: parsed.documentType || 'UNKNOWN',
    gemParserVersion: parsed.parserVersion || GEM_PARSER_VERSION,
    gemRawText: rawText ? rawText.slice(0, 120000) : null,
    gemRawTextTruncated: Boolean(rawText && rawText.length > 120000),
    gemPdfSha256: sha256 || null,
    gemPdfFetchedAt: now,
    gemPdfError: null,
    gemValidationFlags: [...new Set(flags)],
    'gemFieldConfidence.officialState': parsed.fieldConfidence?.officialState || 'unknown',
    'gemFieldConfidence.department': parsed.fieldConfidence?.department || 'unknown',
    'gemFieldConfidence.organisation': parsed.fieldConfidence?.organisation || 'unknown',
    'gemFieldConfidence.deliveryLocation': parsed.fieldConfidence?.deliveryLocation || 'unknown',
    'gemFieldConfidence.emdAmount': parsed.fieldConfidence?.emdAmount || 'unknown',
    pdfFetchStatus: 'COMPLETED',
    pdfParseStatus: 'COMPLETED',
    pdfParsedAt: now,
    gemPdfRefreshDue: false,
    gemPdfFailCount: 0,
  };
  return { ok: true, update: { $set: set } };
}

/** Minimal cookie-aware HTTP client for bidplus.gem.gov.in. */
export class GeMHttpClient {
  constructor({ fetchImpl = globalThis.fetch, baseUrl = GEM_BASE_URL, timeoutMs = 30000 } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
    this.csrf = null;
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  storeCookies(res) {
    const list = typeof res.headers?.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const cookie of list) {
      const [pair] = cookie.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await this.fetch(path.startsWith('http') ? path : `${this.baseUrl}${path}`, {
      method,
      body,
      headers: { 'User-Agent': USER_AGENT, ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}), ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    this.storeCookies(res);
    return res;
  }

  async init() {
    const res = await this.request('/advance-search');
    if (!res.ok) throw new Error(`GeM advance-search returned HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(/csrf_bd_gem_nk['"]?\s*[:,]\s*['"]([A-Za-z0-9]+)['"]/);
    if (!match) throw new Error('GeM CSRF token not found on advance-search page');
    this.csrf = match[1];
  }

  /**
   * One page of GeM's consignee-state search, optionally limited to a
   * closing-date window (inclusive, 'YYYY-MM-DD'). Throws on any unexpected shape.
   */
  async searchConsigneeState(stateKey, page, { from = '', to = '' } = {}) {
    if (!this.csrf) await this.init();
    const payload = { searchType: 'con', state_name_con: stateKey, city_name_con: '', bidEndFromCon: from, bidEndToCon: to, page };
    const body = new URLSearchParams({ payload: JSON.stringify(payload), csrf_bd_gem_nk: this.csrf });
    const res = await this.request('/search-bids', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${this.baseUrl}/advance-search`,
      },
    });
    // GeM answers an empty result set with HTTP 404 and {code: 404, message: "No data found"}.
    let data = null;
    try {
      data = await res.json();
    } catch {
      throw new Error(`GeM search-bids returned HTTP ${res.status} without JSON`);
    }
    if (data?.code === 404 && /no data/i.test(String(data.message || ''))) return { numFound: 0, docs: [] };
    if (!res.ok) throw new Error(`GeM search-bids returned HTTP ${res.status}`);
    const response = data?.response?.response;
    if (data?.code !== 200 || !response || !Array.isArray(response.docs) || !Number.isFinite(Number(response.numFound))) {
      throw new Error(`GeM search-bids response not recognised (code ${data?.code ?? 'none'})`);
    }
    return { numFound: Number(response.numFound), docs: response.docs };
  }

  async downloadPdf(url) {
    const res = await this.request(url, { headers: { Referer: `${this.baseUrl}/all-bids` } });
    if (!res.ok) throw new Error(`GeM PDF request returned HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.subarray(0, 4).toString() !== '%PDF') throw new Error(`GeM response is not a PDF (HTTP ${res.status})`);
    return buffer;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, { attempts = 3, delay = 1200, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await onRetry?.(err, attempt);
        await sleep(delay * attempt);
      }
    }
  }
  throw lastErr;
}

const DAY_MS = 86400000;
const istDay = (date) => new Date(date.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Collects one closing-date window. GeM's search-bids has no stable sort:
 * page 2 can repeat page 1 and skip others. Re-reading the window until the
 * set of bids reaches GeM's count fixes that (a busy day converges in ~3
 * passes). `complete` is true only when the count was reached.
 */
export async function collectWindow(client, stateKey, window, { delay = 1200, maxPasses = 6, onRequest = () => {} } = {}) {
  const rows = new Map();
  let numFound = 0;
  let skipped = 0;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    for (let page = 1; ; page += 1) {
      const result = await client.searchConsigneeState(stateKey, page, window);
      onRequest();
      numFound = result.numFound;
      for (const doc of result.docs) {
        const row = listingRowFromDoc(doc);
        if (row) rows.set(row.bidNumber, row);
        else skipped += 1;
      }
      if (delay) await sleep(delay);
      if (result.docs.length < PAGE_SIZE || page * PAGE_SIZE >= numFound) break;
    }
    if (rows.size + skipped >= numFound) return { rows, numFound, complete: true, skipped, passes: pass };
  }
  return { rows, numFound, complete: false, skipped, passes: maxPasses };
}

/**
 * Lists every open bid for one consignee state by walking closing-date
 * windows from yesterday forward until the windows account for GeM's total
 * for the state. Windows widen while sparse and narrow to one day when busy.
 * `complete` is true only if every window and the overall total reconcile;
 * only then may absence from the list mark a bid NOT_LISTED.
 */
export async function listConsigneeState(client, state, { delay = 1200, maxRequests = 2500, horizonDays = 400, now = new Date(), log = logger } = {}) {
  let requests = 0;
  const count = () => { requests += 1; };
  const withRetries = (fn) => withRetry(fn, {
    delay,
    onRetry: async (err) => {
      log.warn({ state: state.canonical, err: err.message }, '[GeM] listing request retry');
      if (/csrf|HTTP 4(03|19)|not recognised/i.test(err.message)) await client.init();
    },
  });

  const total = (await withRetries(() => client.searchConsigneeState(state.key, 1))).numFound;
  count();
  const rows = new Map();
  let covered = 0;
  let skipped = 0;
  let windowsIncomplete = 0;
  const lastDay = addDays(istDay(now), horizonDays);
  let cursor = addDays(istDay(now), -1);
  let span = 1;

  while (covered < total && cursor <= lastDay) {
    if (requests >= maxRequests) {
      log.warn({ state: state.canonical, requests }, '[GeM] request budget reached; listing incomplete');
      break;
    }
    const window = { from: cursor, to: addDays(cursor, span - 1) };
    const first = await withRetries(() => client.searchConsigneeState(state.key, 1, window));
    count();
    if (first.numFound > PAGE_SIZE && span > 1) {
      span = Math.max(1, Math.floor(span / 2));
      continue;
    }
    let result = { rows: new Map(), numFound: first.numFound, complete: true, skipped: 0 };
    if (first.numFound > 0) {
      result = await withRetries(() => collectWindow(client, state.key, window, { delay, onRequest: count }));
    } else if (delay) {
      await sleep(delay);
    }
    for (const [bidNumber, row] of result.rows) rows.set(bidNumber, row);
    covered += result.numFound;
    skipped += result.skipped;
    if (!result.complete) windowsIncomplete += 1;
    cursor = addDays(window.to, 1);
    if (result.numFound > PAGE_SIZE) span = 1;
    else if (result.numFound <= 3) span = Math.min(span * 2, 64);
  }

  // GeM has occasionally answered "No data found" for a state that has bids,
  // so an empty state is never treated as a complete (delisting) pass.
  const complete = total > 0 && windowsIncomplete === 0 && covered >= total && rows.size + skipped >= total;
  return { state, rows: [...rows.values()], numFound: total, complete, skipped, requests, windowsIncomplete, covered };
}

/** Merges per-state listings into bidNumber -> { row, states }. */
export function mergeStateListings(results) {
  const merged = new Map();
  for (const result of results) {
    for (const row of result.rows) {
      const entry = merged.get(row.bidNumber) || { row, states: [] };
      if (!entry.states.includes(result.state.canonical)) entry.states.push(result.state.canonical);
      merged.set(row.bidNumber, entry);
    }
  }
  return merged;
}

export class GeMAdapter extends TenderSourceAdapter {
  constructor({ TenderModel = Tender, clientFactory = () => new GeMHttpClient() } = {}) {
    super('GEM');
    this.Tender = TenderModel;
    this.clientFactory = clientFactory;
  }

  /**
   * Full sync. Options:
   *   states     'ALL' (default), a state, or a list
   *   pdfLimit   max PDFs to download this run (default 250; 0 = listing only)
   *   delay      ms between GeM requests (default 1200, minimum 500)
   *   maxRequests per-state GeM request budget (default 2500; hitting it
   *               makes that state's pass incomplete, so nothing is delisted)
   *   dryRun     compute and report without writing
   */
  async syncConsigneeStates({ states = 'ALL', pdfLimit = 250, delay = 1200, maxRequests = 2500, dryRun = false, now = new Date() } = {}) {
    const targets = resolveConsigneeStates(states);
    const safeDelay = Math.max(500, Number(delay) || 1200);
    const client = this.clientFactory();
    const report = { startedAt: now, dryRun, states: {}, listing: { inserted: 0, updated: 0, unchanged: 0 }, delisted: 0, pdf: { attempted: 0, completed: 0, failed: 0, remainingDue: 0 }, errors: [] };

    await withRetry(() => client.init(), { delay: safeDelay });

    const results = [];
    for (const state of targets) {
      try {
        const result = await listConsigneeState(client, state, { delay: safeDelay, maxRequests, now });
        results.push(result);
        report.states[state.canonical] = { numFound: result.numFound, listed: result.rows.length, complete: result.complete, skippedRows: result.skipped, requests: result.requests, windowsIncomplete: result.windowsIncomplete };
        logger.info({ state: state.canonical, numFound: result.numFound, listed: result.rows.length, complete: result.complete }, '[GeM] consignee listing pass');
      } catch (err) {
        report.states[state.canonical] = { error: err.message, complete: false };
        report.errors.push(`${state.canonical}: ${err.message}`);
        logger.error({ state: state.canonical, err: err.message }, '[GeM] consignee listing failed; state left unchanged');
      }
    }

    const merged = mergeStateListings(results);
    const bidNumbers = [...merged.keys()];
    const existingDocs = new Map();
    for (let i = 0; i < bidNumbers.length; i += 500) {
      const docs = await this.Tender.find(
        { sourcePortal: 'GEM', sourceTenderId: { $in: bidNumbers.slice(i, i + 500) } },
        'sourceTenderId consigneeStates closingDate gemPdfUrl pdfParseStatus gemParserVersion gemPdfRefreshDue gemPdfFailCount publishedDate',
      ).lean();
      for (const doc of docs) existingDocs.set(doc.sourceTenderId, doc);
    }

    // Only a complete pass with plausible coverage may remove a state.
    const completedStates = [];
    for (const result of results.filter((r) => r.complete)) {
      const stored = await this.Tender.countDocuments({ sourcePortal: 'GEM', consigneeStates: result.state.canonical, gemStatus: 'ACTIVE' });
      if (stored > 20 && result.rows.length < stored * MIN_DELIST_COVERAGE) {
        report.states[result.state.canonical].delistingSkipped = `only ${result.rows.length} listed vs ${stored} stored`;
        logger.warn({ state: result.state.canonical, listed: result.rows.length, stored }, '[GeM] coverage too low; not delisting');
        continue;
      }
      completedStates.push(result.state.canonical);
    }

    const ops = [];
    for (const [bidNumber, { row, states: seen }] of merged) {
      const existing = existingDocs.get(bidNumber);
      ops.push(buildListingUpdate(row, seen, completedStates, existing, now));
      if (!existing) report.listing.inserted += 1;
      else report.listing.updated += 1;
    }
    if (!dryRun) {
      for (let i = 0; i < ops.length; i += 500) await this.Tender.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }

    for (const canonical of completedStates) {
      const seen = results.find((r) => r.state.canonical === canonical).rows.map((r) => r.bidNumber);
      const filter = { sourcePortal: 'GEM', consigneeStates: canonical, sourceTenderId: { $nin: seen } };
      if (dryRun) report.states[canonical].wouldRemove = await this.Tender.countDocuments(filter);
      else report.states[canonical].removed = (await this.Tender.updateMany(filter, { $pull: { consigneeStates: canonical }, $set: { lastCheckedAt: now } })).modifiedCount;
    }
    if (!dryRun && completedStates.length) {
      const res = await this.Tender.updateMany(
        { sourcePortal: 'GEM', consigneeStates: { $size: 0 }, gemStatus: 'ACTIVE' },
        { $set: { gemStatus: 'NOT_LISTED', status: 'CLOSED' } },
      );
      report.delisted = res.modifiedCount;
    }

    if (!dryRun && pdfLimit > 0) await this.runPdfPass(client, merged, { pdfLimit, delay: safeDelay, report, now });
    if (!dryRun) {
      report.pdf.remainingDue = await this.Tender.countDocuments({ sourcePortal: 'GEM', gemPdfRefreshDue: true, gemStatus: 'ACTIVE', $or: [{ gemPdfFailCount: { $lt: MAX_PDF_FAILURES } }, { gemPdfFailCount: { $exists: false } }] });
    }

    report.finishedAt = new Date();
    logger.info({ report }, '[GeM] sync complete');
    return report;
  }

  async runPdfPass(client, merged, { pdfLimit, delay, report, now }) {
    const due = await this.Tender.find(
      {
        sourcePortal: 'GEM',
        sourceTenderId: { $in: [...merged.keys()] },
        gemPdfRefreshDue: true,
        gemStatus: 'ACTIVE',
        $or: [{ gemPdfFailCount: { $lt: MAX_PDF_FAILURES } }, { gemPdfFailCount: { $exists: false } }],
      },
      'sourceTenderId pdfParsedAt publishedDate',
    ).lean();
    // Never-parsed bids first (newest first), then refreshes.
    due.sort((a, b) => (Boolean(a.pdfParsedAt) - Boolean(b.pdfParsedAt)) || (new Date(b.publishedDate || 0) - new Date(a.publishedDate || 0)));

    for (const doc of due.slice(0, pdfLimit)) {
      const { row } = merged.get(doc.sourceTenderId);
      report.pdf.attempted += 1;
      const filter = { sourcePortal: 'GEM', sourceTenderId: row.bidNumber };
      try {
        const buffer = await withRetry(() => client.downloadPdf(row.pdfUrl), { attempts: 2, delay });
        const sha256 = createHash('sha256').update(buffer).digest('hex');
        const rawText = await extractTextFromPdfBuffer(buffer);
        const parsed = parseGeMBidPdfText(rawText);
        const { ok, update, error } = buildPdfUpdate({ row, parsed, rawText, sha256, now: new Date() });
        await this.Tender.updateOne(filter, update);
        if (ok) report.pdf.completed += 1;
        else {
          report.pdf.failed += 1;
          logger.warn({ bid: row.bidNumber, error }, '[GeM] PDF rejected');
        }
      } catch (err) {
        report.pdf.failed += 1;
        const message = String(err.message || err).slice(0, 500);
        await this.Tender.updateOne(filter, {
          $set: { pdfFetchStatus: 'FAILED', gemPdfError: message, ...(message === 'PDF_TEXT_EMPTY' ? { pdfParseStatus: 'FAILED' } : {}) },
          $inc: { gemPdfFailCount: 1 },
        });
        logger.warn({ bid: row.bidNumber, err: message }, '[GeM] PDF fetch/parse failed');
      }
      await sleep(delay);
    }
  }

  /**
   * Compatibility entry point for older callers. Syncs one state (or ALL);
   * `limit` caps PDF downloads.
   */
  async fetchList(_pageNumber = 1, filters = {}) {
    const report = await this.syncConsigneeStates({
      states: filters.state || 'ALL',
      pdfLimit: filters.limit ?? 250,
      delay: filters.delay,
      maxRequests: filters.maxRequests ?? 2500,
    });
    const listed = Object.values(report.states).reduce((sum, s) => sum + (s.listed || 0), 0);
    return { success: report.errors.length === 0, totalSaved: listed, report };
  }

  /**
   * Builds a Tender document from a hand-made record (dev-only seeder).
   * Geography comes only from rawBid.consigneeStates.
   */
  normalize(rawBid) {
    const pdfData = rawBid.pdfData || {};
    const consigneeStates = computeConsigneeStates([], rawBid.consigneeStates || [], []);
    const closingDate = pdfData.bidEndDate || (rawBid.endDate ? safeDate(rawBid.endDate, null) : null);
    const publishedDate = rawBid.startDate ? safeDate(rawBid.startDate, null) : null;
    const deliveryStations = pdfData.deliveryLocations || [];
    return {
      sourcePortal: 'GEM',
      sourceTenderId: rawBid.bidNumber,
      tenderReferenceNumber: rawBid.bidNumber,
      departmentCode: 'GEM',
      consigneeStates,
      state: consigneeStates[0] || 'Other',
      officialState: pdfData.ministryStateName || pdfData.ministryName || null,
      title: String(pdfData.itemCategory || rawBid.items || `Title not confirmed (${rawBid.bidNumber})`).slice(0, 500),
      departmentName: pdfData.departmentName || rawBid.departmentName || 'Not confirmed',
      organisationChain: [pdfData.ministryName, pdfData.departmentName || rawBid.departmentName, pdfData.organisationName].filter(Boolean).join(' > '),
      tenderCategory: 'Goods',
      tenderType: 'GeM Bid',
      emdAmount: pdfData.emdAmount ?? null,
      location: deliveryStations.length ? deliveryStations.join(', ') : null,
      deliveryStations,
      locationVerificationStatus: deliveryStations.length ? 'UNVERIFIED' : 'NOT_PROVIDED',
      publishedDate,
      closingDate,
      closingDateStr: closingDate ? closingDate.toISOString() : null,
      status: closingDate && closingDate < new Date() ? 'CLOSED' : 'ACTIVE',
      gemStatus: 'UNKNOWN',
      gemPdfUrl: rawBid.pdfUrl || null,
      detailsUrl: rawBid.pdfUrl || null,
      pdfUrls: rawBid.pdfUrl ? [rawBid.pdfUrl] : [],
      gemParserVersion: GEM_PARSER_VERSION,
    };
  }

  async fetchDetail(sourceTenderId) {
    return this.Tender.findOne({ sourcePortal: 'GEM', sourceTenderId });
  }
}

export const gemAdapter = new GeMAdapter();
