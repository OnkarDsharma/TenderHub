import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

const PORTAL_URL = 'https://jktenders.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page';
const DEFAULT_ORGANISATION = 'Rural Development and Panchayati Raj';

function getOrganisationArg(args) {
  const inline = args.find((arg) => arg.startsWith('--organization='));
  if (inline) return inline.slice('--organization='.length).trim();
  const index = args.indexOf('--organization');
  if (index >= 0 && args[index + 1]) return args[index + 1].trim();
  return DEFAULT_ORGANISATION;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeId(value) {
  return String(value || '').trim().replace(/^\[|\]$/g, '').replace(/\s+/g, '');
}

function baseTenderId(value) {
  return normalizeId(value).replace(/_\d+$/, '');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

async function waitForPortalTable(page, selector, description) {
  try {
    await page.waitForSelector(selector, { timeout: 30000 });
  } catch {
    throw new Error(`Could not read ${description}; the portal may have changed or blocked the audit.`);
  }
}

async function readOrganisationEntry(page, requestedName) {
  return page.evaluate((name) => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('table#table tr[id^="informal"]'));
    const matches = rows.map((row, index) => {
      const cells = row.querySelectorAll('td');
      const link = cells[2]?.querySelector('a');
      return {
        index,
        name: cells[1]?.innerText.replace(/\s+/g, ' ').trim() || '',
        count: Number.parseInt(link?.innerText.trim() || '', 10) || 0,
        hasLink: Boolean(link),
      };
    }).filter((row) => normalize(row.name) === normalize(name));

    return { matches, availableNames: rows.map((row) => row.querySelectorAll('td')[1]?.innerText.trim()).filter(Boolean) };
  }, requestedName);
}

async function readTenderIdsOnPage(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(
      'table.list_table tr:has(td:nth-child(5) a), table.list_table tr[id^="informal"]'
    ));
    return rows.map((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5 || !cells[4].querySelector('a')) return null;
      const text = row.innerText || '';
      const matches = text.match(/\[([^\]]+)\]/g) || [];
      const id = matches.length ? matches[matches.length - 1].slice(1, -1).trim() : '';
      return id ? id.replace(/\s+/g, '') : null;
    }).filter(Boolean);
  });
}

async function clickPageNumber(page, pageNumber) {
  const link = page.locator('a').filter({ hasText: new RegExp(`^\\s*${pageNumber}\\s*$`) }).first();
  if (await link.count().catch(() => 0) === 0) return false;
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
    link.click({ timeout: 15000 }).catch(async () => {
      await link.click({ force: true, timeout: 10000 });
    }),
  ]);
  await page.waitForTimeout(500);
  return true;
}

async function collectPortalIds(page, organisation) {
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForPortalTable(page, 'table#table tr[id^="informal"]', 'the organisation directory');

  const { matches, availableNames } = await readOrganisationEntry(page, organisation);
  if (matches.length !== 1 || !matches[0].hasLink) {
    const options = availableNames.join(', ');
    throw new Error(`Expected one exact portal organisation match for "${organisation}"; found ${matches.length}. Portal organisations: ${options}`);
  }

  const officialCount = matches[0].count;
  const orgRow = page.locator('table#table tr[id^="informal"]').nth(matches[0].index);
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {}),
    orgRow.locator('td:nth-child(3) a').click({ timeout: 20000 }),
  ]);
  await page.waitForTimeout(500);

  const ids = new Set();
  const pageSummaries = [];
  const pageFingerprints = new Set();
  let pageNumber = 1;
  let paginationComplete = false;

  while (true) {
    await waitForPortalTable(page, 'table.list_table', `the tender list for ${organisation}, page ${pageNumber}`);
    const pageIds = await readTenderIdsOnPage(page);
    const fingerprint = pageIds.join('|');
    if (!pageIds.length || pageFingerprints.has(fingerprint)) {
      pageSummaries.push({ page: pageNumber, idsFound: pageIds.length, warning: 'Empty or repeated page; pagination stopped.' });
      break;
    }

    pageFingerprints.add(fingerprint);
    pageIds.forEach((id) => ids.add(id));
    pageSummaries.push({ page: pageNumber, idsFound: pageIds.length, uniqueIdsSoFar: ids.size });

    const nextPage = pageNumber + 1;
    const moved = await clickPageNumber(page, nextPage);
    if (!moved) {
      paginationComplete = true;
      break;
    }
    pageNumber = nextPage;
  }

  return {
    officialCount,
    ids: [...ids].sort(),
    pagesRead: pageSummaries.length,
    pageSummaries,
    paginationComplete,
  };
}

async function readDatabaseIds(organisation) {
  const escaped = escapeRegex(organisation);
  const organisationPrefix = new RegExp(`^${escaped}(?:\\s*(?:\\|\\||>|$))`, 'i');
  const records = await Tender.find({
    sourcePortal: 'JK_TENDERS',
    state: 'Jammu & Kashmir',
    $or: [
      { departmentName: new RegExp(`^${escaped}$`, 'i') },
      { organisationChain: organisationPrefix },
    ],
  }).select('sourceTenderId baseTenderId relatedTenderIds').lean();

  return records;
}

async function writeReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `organisation-coverage-${stamp}.json`);
  const csvPath = path.join(outputDir, `organisation-coverage-${stamp}.csv`);
  const rows = [
    ['classification', 'tender_id', 'related_database_ids'],
    ...report.portal.tenderIds.map((id) => {
      const related = report.comparison.relatedDatabaseMatches[id] || [];
      return [related.length ? 'base_id_match_check_exact_id' : 'candidate_missing_if_scan_complete', id, related.join(';')];
    }),
    ...report.comparison.databaseIdsNotOnCurrentPortalList.map((id) => ['database_id_not_on_current_portal_list', id, '']),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(csvPath, `${csv}\n`, 'utf8'),
  ]);
  return { jsonPath, csvPath };
}

async function run() {
  const organisation = getOrganisationArg(process.argv.slice(2));
  let browser;
  let databaseConnected = false;
  let portalResult = null;
  let reportPaths = null;
  let failure = null;

  try {
    await connectDB();
    databaseConnected = true;
    browser = await chromium.launch({
      headless: process.env.SCRAPER_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    console.log(`Read-only portal audit: ${organisation}`);
    portalResult = await collectPortalIds(page, organisation);
  } catch (error) {
    failure = error;
  } finally {
    await browser?.close().catch(() => {});
  }

  try {
    const databaseRecords = databaseConnected ? await readDatabaseIds(organisation) : [];
    const databaseIds = [...new Set(databaseRecords.map((record) => normalizeId(record.sourceTenderId)).filter(Boolean))].sort();
    const portalIds = portalResult?.ids || [];
    const portalSet = new Set(portalIds);
    const databaseSet = new Set(databaseIds);
    const databaseByBaseId = new Map();
    for (const record of databaseRecords) {
      const id = normalizeId(record.sourceTenderId);
      const baseId = normalizeId(record.baseTenderId) || baseTenderId(id);
      if (!databaseByBaseId.has(baseId)) databaseByBaseId.set(baseId, new Set());
      databaseByBaseId.get(baseId).add(id);
      for (const relatedId of record.relatedTenderIds || []) {
        databaseByBaseId.get(baseId).add(normalizeId(relatedId));
      }
    }

    const portalIdsNotInDatabase = portalIds.filter((id) => !databaseSet.has(id));
    const relatedDatabaseMatches = {};
    for (const id of portalIdsNotInDatabase) {
      const related = databaseByBaseId.get(baseTenderId(id));
      if (related?.size) relatedDatabaseMatches[id] = [...related].sort();
    }
    const confirmedMissingPortalIds = portalIdsNotInDatabase.filter((id) => !relatedDatabaseMatches[id]);

    const report = {
      auditType: 'read-only organisation tender ID reconciliation',
      organisation,
      state: 'Jammu & Kashmir',
      sourcePortal: 'JK_TENDERS',
      generatedAt: new Date().toISOString(),
      status: failure ? 'INCOMPLETE' : 'COMPLETE',
      error: failure?.message || null,
      portal: {
        advertisedOrganisationCount: portalResult?.officialCount ?? null,
        uniqueIdsCollected: portalIds.length,
        pagesRead: portalResult?.pagesRead ?? 0,
        paginationComplete: portalResult?.paginationComplete ?? false,
        countMatchesCollectedIds: portalResult ? portalResult.officialCount === portalIds.length : false,
        pageSummaries: portalResult?.pageSummaries || [],
        tenderIds: portalIds,
      },
      database: {
        recordsMatched: databaseIds.length,
        tenderIds: databaseIds,
      },
      comparison: {
        exactIdsInBoth: portalIds.filter((id) => databaseSet.has(id)).length,
        portalIdsNotInDatabase,
        relatedDatabaseMatches,
        candidateMissingPortalIds: confirmedMissingPortalIds,
        databaseIdsNotOnCurrentPortalList: databaseIds.filter((id) => !portalSet.has(id)),
        missingIdsConfirmed: Boolean(portalResult?.paginationComplete && portalResult?.officialCount === portalIds.length && !failure),
      },
      note: 'IDs absent from the current portal list are reported only; this audit never deletes or updates tenders.',
    };

    reportPaths = await writeReport(report, path.resolve(process.cwd(), 'reports'));
    console.log(`Portal advertised count: ${report.portal.advertisedOrganisationCount ?? 'unavailable'}`);
    console.log(`Portal unique IDs collected: ${report.portal.uniqueIdsCollected}`);
    console.log(`TenderHub matching IDs: ${report.database.recordsMatched}`);
    console.log(`Portal IDs not found exactly in TenderHub: ${report.comparison.portalIdsNotInDatabase.length}`);
    console.log(`Confirmed missing IDs: ${report.comparison.missingIdsConfirmed ? report.comparison.confirmedMissingPortalIds.length : 'not confirmed; portal scan incomplete or count mismatch'}`);
    console.log(`JSON report: ${reportPaths.jsonPath}`);
    console.log(`CSV report: ${reportPaths.csvPath}`);
    if (failure) console.error(`Portal collection issue: ${failure.message}`);
  } catch (error) {
    failure ||= error;
    console.error(`Could not complete database comparison/report: ${error.message}`);
  } finally {
    if (databaseConnected) await closeDB().catch(() => {});
  }

  if (failure) process.exitCode = 1;
}

run();
