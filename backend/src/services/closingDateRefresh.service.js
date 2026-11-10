/**
 * @file backend/src/services/closingDateRefresh.service.js
 * @description Keeps stored NIC tenders' closing/opening dates in step with the live portal.
 *
 * Why: the scheduled sync only reads tenders published *today* and skips tenders whose
 * documents are already downloaded, so a corrigendum that extends a tender's bid-submission
 * deadline never reaches the database. The tender then looks closed on TenderHub (and the
 * expiry job marks it EXPIRED) while it is still open on the portal.
 *
 * How: walk each portal's "Tenders by Organisation" listing, which shows every live tender
 * with its current Closing Date and Opening Date, and update stored tenders of the same
 * portal whose dates differ. Tenders that were marked EXPIRED/ARCHIVED only because of the
 * stale date are made ACTIVE again. Nothing is inserted or deleted.
 */
import { chromium } from 'playwright';
import mongoose from 'mongoose';
import pino from 'pino';
import Tender from '../models/Tender.js';
import SystemLog from '../models/SystemLog.js';
import { connectDB } from '../config/db.js';
import { resolveNicPortals } from '../config/nicPortals.js';
import { parseISTDate, formatStandardTime } from '../utils/dateUtils.js';

const logger = pino();
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ORG_ROW = "table#table tr[id^='informal']";
// Statuses the expiry/archival jobs set purely from dates; a date extension undoes them.
const REVIVABLE_STATUSES = ['EXPIRED', 'ARCHIVED'];

const normalizeId = (value) => String(value || '').replace(/\s+/g, '');

/** Reads every tender row on the current organisation list page. */
function readListRows(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('table.list_table tr')).map((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5 || !cells[4].querySelector('a')) return null;
    const ids = (cells[4].innerText || '').match(/\[([^\]]+)\]/g) || [];
    const id = ids.length ? ids[ids.length - 1].slice(1, -1).trim() : '';
    if (!id) return null;
    return { id, closing: cells[2].innerText.trim(), opening: cells[3].innerText.trim() };
  }).filter(Boolean));
}

/** Waits until a streamed organisation list stops growing (large orgs render 2,000+ rows). */
async function waitForListToSettle(page, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    const count = await page.locator('table.list_table tr').count().catch(() => 0);
    stableTicks = count > 0 && count === last ? stableTicks + 1 : 0;
    if (stableTicks >= 3) return;
    last = count;
    await page.waitForTimeout(800);
  }
}

/**
 * Collects { id -> {closing, opening} } for every live tender on one NIC portal.
 * `complete` is false when any organisation could not be read in full.
 */
export async function collectPortalListing(browser, { baseUrl, portalName }, log = logger) {
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const directoryUrl = `${baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page`;
  const rows = new Map();
  const incompleteOrgs = [];

  try {
    await page.goto(directoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ORG_ROW, { timeout: 30000 });
    const orgs = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((row, index) => {
      const cells = row.querySelectorAll('td');
      return { index, name: cells[1]?.innerText.replace(/\s+/g, ' ').trim(), count: Number.parseInt(cells[2]?.innerText, 10) || 0 };
    }).filter((org) => org.name && org.count > 0), ORG_ROW);

    for (const org of orgs) {
      const orgRows = new Map();
      for (let attempt = 0; attempt < 2 && orgRows.size < org.count; attempt += 1) {
        try {
          // Organisation links are session-bound, so re-open the directory for each one.
          await page.goto(directoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector(ORG_ROW, { timeout: 30000 });
          await Promise.all([
            page.waitForLoadState('domcontentloaded').catch(() => {}),
            page.locator(ORG_ROW).nth(org.index).locator('td:nth-child(3) a').click({ timeout: 20000 }),
          ]);

          const seenPages = new Set();
          for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
            await page.waitForSelector('table.list_table', { timeout: 30000 });
            await waitForListToSettle(page);
            const pageRows = await readListRows(page);
            const fingerprint = pageRows.map((r) => r.id).join('|');
            if (!pageRows.length || seenPages.has(fingerprint)) break;
            seenPages.add(fingerprint);
            pageRows.forEach((r) => orgRows.set(normalizeId(r.id), r));
            if (orgRows.size >= org.count) break;

            const next = page.locator('a').filter({ hasText: new RegExp(`^\\s*${pageNo + 1}\\s*$`) }).first();
            if (!(await next.count())) break;
            await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), next.click({ timeout: 15000 })]);
            await page.waitForTimeout(600);
          }
        } catch (err) {
          log.warn({ portalName, org: org.name, err: err.message.split('\n')[0] }, '[ClosingDateRefresh] organisation read failed');
        }
      }
      orgRows.forEach((value, key) => rows.set(key, value));
      if (orgRows.size < org.count) incompleteOrgs.push({ name: org.name, expected: org.count, read: orgRows.size });
    }
  } finally {
    await context.close().catch(() => {});
  }

  return { rows, complete: incompleteOrgs.length === 0, incompleteOrgs };
}

const sameMoment = (a, b) => Boolean(a && b) && a.getTime() === b.getTime();

/**
 * Builds the $set for one stored tender from the portal's list row, or null if nothing changed.
 * The list's "Closing Date" is the bid-submission end; "Opening Date" is the bid opening.
 */
export function buildDateUpdate(tender, row, now = new Date()) {
  const closing = parseISTDate(row.closing);
  if (!closing) return null;
  const opening = parseISTDate(row.opening);
  const storedBidEnd = tender.bidSubmissionEndDate || tender.closingDate;

  const set = {};
  if (!sameMoment(storedBidEnd, closing)) {
    // Ingestion stretches closingDate to the document-download end when that is later;
    // keep that rule so a refresh never closes a tender earlier than ingestion would.
    const docEnd = tender.documentDownloadEndDate;
    const useDocEnd = docEnd && docEnd > closing;
    Object.assign(set, {
      bidSubmissionEndDate: closing,
      bidSubmissionEndDateStr: row.closing,
      bidSubmissionEndTime: formatStandardTime(row.closing),
      closingDate: useDocEnd ? docEnd : closing,
      closingDateStr: useDocEnd ? tender.documentDownloadEndDateStr : row.closing,
      closingTime: formatStandardTime(useDocEnd ? tender.documentDownloadEndDateStr : row.closing),
    });
  }
  if (opening && !sameMoment(tender.bidOpeningDate, opening)) {
    Object.assign(set, {
      bidOpeningDate: opening,
      bidOpeningDateStr: row.opening,
      bidOpeningTime: formatStandardTime(row.opening),
    });
  }
  if (!Object.keys(set).length) return null;

  // Revive tenders that were only closed because of the stale date; leave cancellations alone.
  if ((set.closingDate || tender.closingDate) > now && REVIVABLE_STATUSES.includes(tender.status) && !tender.isDelisted) {
    set.status = 'ACTIVE';
  }
  set.lastCheckedAt = now;
  return set;
}

export class ClosingDateRefreshService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Refreshes dates for the given portals ('ALL', a portal name, state or alias).
   * @param {{ portals?: string, dryRun?: boolean, triggeredBy?: string }} options
   */
  async refresh({ portals = 'ALL', dryRun = false, triggeredBy = 'MANUAL' } = {}) {
    if (this.isRunning) {
      logger.warn('[ClosingDateRefresh] A refresh is already running. Skipping.');
      return { skipped: true, reason: 'ALREADY_RUNNING' };
    }
    this.isRunning = true;
    const startedAt = Date.now();
    const report = { triggeredBy, dryRun, portals: {} };
    let browser;

    try {
      if (mongoose.connection.readyState !== 1) await connectDB();
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });

      for (const portal of resolveNicPortals(portals)) {
        const portalReport = { listed: 0, matched: 0, updated: 0, revived: 0, complete: false, incompleteOrgs: [], samples: [] };
        report.portals[portal.portalName] = portalReport;
        try {
          const now = new Date();
          const listing = await collectPortalListing(browser, portal);
          portalReport.listed = listing.rows.size;
          portalReport.complete = listing.complete;
          portalReport.incompleteOrgs = listing.incompleteOrgs;

          const ids = [...listing.rows.keys()];
          const ops = [];
          for (let i = 0; i < ids.length; i += 1000) {
            const stored = await Tender.find({ sourcePortal: portal.portalName, sourceTenderId: { $in: ids.slice(i, i + 1000) } })
              .select('sourceTenderId status isDelisted closingDate closingDateStr bidSubmissionEndDate bidOpeningDate documentDownloadEndDate documentDownloadEndDateStr')
              .lean();
            for (const tender of stored) {
              portalReport.matched += 1;
              const row = listing.rows.get(normalizeId(tender.sourceTenderId));
              const set = row && buildDateUpdate(tender, row, now);
              if (!set) continue;
              portalReport.updated += 1;
              if (set.status === 'ACTIVE') portalReport.revived += 1;
              if (portalReport.samples.length < 10) {
                portalReport.samples.push({ id: tender.sourceTenderId, from: tender.closingDateStr, to: row.closing, revived: set.status === 'ACTIVE' });
              }
              ops.push({ updateOne: { filter: { _id: tender._id }, update: { $set: set } } });
            }
          }
          if (!dryRun && ops.length) await Tender.bulkWrite(ops, { ordered: false });
          logger.info({ portal: portal.portalName, ...portalReport, samples: undefined }, '[ClosingDateRefresh] portal done');
        } catch (err) {
          portalReport.error = err.message;
          logger.error(`[ClosingDateRefresh] ${portal.portalName} failed: ${err.message}`);
        }
      }

      report.durationMs = Date.now() - startedAt;
      const totals = Object.values(report.portals).reduce((a, p) => ({ updated: a.updated + p.updated, revived: a.revived + p.revived }), { updated: 0, revived: 0 });
      if (!dryRun) {
        await SystemLog.create({
          level: 'INFO',
          source: 'CRON',
          message: `Closing-date refresh (${triggeredBy}): ${totals.updated} tender(s) re-dated, ${totals.revived} reactivated.`,
          metadata: { durationMs: report.durationMs, portals: Object.fromEntries(Object.entries(report.portals).map(([k, v]) => [k, { ...v, samples: undefined }])) },
        }).catch(() => {});
      }
      return { ...report, ...totals };
    } finally {
      await browser?.close().catch(() => {});
      this.isRunning = false;
    }
  }
}

export const closingDateRefreshService = new ClosingDateRefreshService();
export default closingDateRefreshService;
