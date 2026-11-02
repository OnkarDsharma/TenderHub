/**
 * Reprocess stored GeM PDFs to repair historical state/location fields.
 * Dry-run by default; pass --apply to write the reviewed normalization back.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import { canonicalizeGeMState, extractTextFromPdfBuffer, parseGeMBidPdfText, GEM_PARSER_VERSION } from '../utils/gemPdfParser.js';

const args = new Set(process.argv.slice(2));
const argValue = (key, fallback) => process.argv.find((value) => value.startsWith(`${key}=`))?.slice(key.length + 1) || fallback;
const apply = args.has('--apply');
const force = args.has('--force');
const limit = Number.parseInt(argValue('--limit', '0'), 10) || 0;
const delayMs = Math.max(0, Number.parseInt(argValue('--delay', '1200'), 10) || 0);
const reportPath = argValue('--report', `/tmp/gem-history-repair-${Date.now()}.json`);
const backupPath = argValue('--backup', `/tmp/gem-history-backup-${Date.now()}.json`);
const onlyIds = argValue('--ids', '').split(',').map((value) => value.trim()).filter(Boolean);
const onlyBid = argValue('--bid', '');
const resumeAfter = argValue('--resume', '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safePdfUrl = (tender) => {
  const url = tender.detailsUrl || tender.pdfUrls?.[0];
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'bidplus.gem.gov.in' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

async function main() {
  let browser;
  try {
    await connectDB();
    const query = { sourcePortal: 'GEM' };
    if (onlyBid) query.sourceTenderId = onlyBid;
    else if (onlyIds.length) query.sourceTenderId = { $in: onlyIds };
    if (resumeAfter && !onlyBid) query.sourceTenderId = { ...(onlyIds.length ? { $in: onlyIds } : {}), $gt: resumeAfter };
    if (!force) query.gemParserVersion = { $ne: GEM_PARSER_VERSION };

    let records = await Tender.find(query).select('+gemRawText').sort({ sourceTenderId: 1 }).lean();
    if (limit > 0) records = records.slice(0, limit);
    console.log(`Selected ${records.length} GeM record(s); mode=${apply ? 'APPLY' : 'DRY RUN'}.`);
    if (!records.length) return;

    if (apply) {
      const snapshot = await Tender.find({ sourcePortal: 'GEM' }).select('+gemRawText').lean();
      await writeFile(backupPath, JSON.stringify(snapshot), { mode: 0o600 });
      console.log(`Backed up ${snapshot.length} GeM record(s) to ${backupPath}`);
    }

    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto('https://bidplus.gem.gov.in/all-bids', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const outcomes = [];

    for (let index = 0; index < records.length; index += 1) {
      const tender = records[index];
      const pdfUrl = safePdfUrl(tender);
      let result = {
        sourceTenderId: tender.sourceTenderId,
        before: {
          state: tender.state || null,
          officialState: tender.officialState || null,
          departmentName: tender.departmentName || null,
          organisationChain: tender.organisationChain || null,
          location: tender.location || null,
          closingDate: tender.closingDate || null,
        },
        beforeState: tender.state,
        beforeLocation: tender.location || null,
        beforeOfficialState: tender.officialState || null,
        source: tender.gemRawText && !tender.gemRawTextTruncated ? 'stored-raw-text' : 'official-pdf',
        outcome: 'FAILED',
        reason: null,
      };

      let pdfDownloaded = false;
      let downloadedHash = null;
      try {
        let text = tender.gemRawText && !tender.gemRawTextTruncated ? tender.gemRawText : null;
        if (!text) {
          if (!pdfUrl) throw new Error('No stored raw text or trusted GeM PDF URL');
          if (index > 0 && delayMs) await sleep(delayMs);
          let response;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            response = await context.request.get(pdfUrl, { headers: { Referer: 'https://bidplus.gem.gov.in/all-bids' }, timeout: 30000 });
            if (response.ok() || response.status() < 500) break;
            await sleep(delayMs * (attempt + 1));
          }
          if (!response.ok()) throw new Error(`GeM PDF request returned HTTP ${response.status()}`);
          const bytes = await response.body();
          if (bytes.length < 5 || bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('GeM response was not a PDF');
          pdfDownloaded = true;
          downloadedHash = createHash('sha256').update(bytes).digest('hex');
          text = await extractTextFromPdfBuffer(bytes);
        }
        if (!text) throw new Error('PDF text extraction returned no text');
        const parsed = parseGeMBidPdfText(text);
        if (!parsed.bidNumber) throw new Error('PDF bid number missing; refusing to apply uncertain document');
        if (parsed.bidNumber.toUpperCase() !== tender.sourceTenderId.toUpperCase()) {
          throw new Error(`PDF bid number mismatch (${parsed.bidNumber})`);
        }

        const officialState = parsed.ministryStateName || null;
        const state = canonicalizeGeMState(officialState) || 'Other';
        const location = parsed.location || null;
        const locationVerificationStatus = location
          ? (parsed.deliveryLocations?.length ? 'VERIFIED' : 'UNVERIFIED')
          : 'NOT_PROVIDED';
        const now = new Date();
        const set = {
          state,
          officialState,
          location,
          locationVerificationStatus,
          geographyEvidence: pdfUrl,
          geographyCorrectedAt: now,
          pdfParsedAt: now,
          pdfParseStatus: officialState ? 'COMPLETED' : 'FAILED',
          pdfFetchStatus: 'COMPLETED',
          gemStatus: tender.closingDate && new Date(tender.closingDate) < now ? 'CLOSED_BY_DATE' : 'UNKNOWN',
          rawLegacyState: tender.rawLegacyState || tender.state || null,
          rawMinistryStateName: parsed.ministryStateName || null,
          officialStateConfidence: parsed.fieldConfidence?.officialState || 'unknown',
          gemFieldConfidence: parsed.fieldConfidence || {},
          gemValidationFlags: parsed.validationFlags || [],
          gemDocumentType: parsed.documentType || 'UNKNOWN',
          gemParserVersion: parsed.parserVersion,
          rawDeliverySection: parsed.rawDeliverySection || null,
          gemRawText: text.slice(0, 120000),
          gemRawTextTruncated: text.length > 120000,
          gemPdfSha256: downloadedHash || tender.gemPdfSha256 || null,
          gemPdfFetchedAt: downloadedHash ? new Date() : tender.gemPdfFetchedAt || null,
        };
        result = {
          ...result,
          outcome: officialState ? 'PARSED' : 'PARTIAL',
          officialState,
          afterState: state,
          afterLocation: location,
          afterOfficialState: officialState,
          reason: 'Reparsed authoritative PDF text; official Ministry/State value determines normalized state',
          locationVerificationStatus,
          after: {
            state,
            officialState,
            departmentName: parsed.departmentName || null,
            organisationChain: [parsed.ministryName, parsed.departmentName, parsed.organisationName].filter(Boolean).join(' > ') || null,
            location,
            closingDate: parsed.bidEndDate || tender.closingDate || null,
          },
        };

        if (apply) {
          const filter = { _id: tender._id, sourcePortal: 'GEM' };
          if (tender.updatedAt) filter.updatedAt = tender.updatedAt;
          const write = await Tender.collection.updateOne(filter, { $set: set });
          if (!write.matchedCount) {
            result.outcome = 'CONFLICT';
            result.reason = 'Record changed after it was read; left untouched';
          }
        }
      } catch (error) {
        result.reason = error.message;
        result.afterState = 'Other';
        result.afterOfficialState = null;
        result.outcome = /No stored raw text|No trusted GeM PDF URL/.test(error.message) ? 'UNVERIFIABLE' : 'FAILED';
        if (apply) {
          const filter = { _id: tender._id, sourcePortal: 'GEM' };
          if (tender.updatedAt) filter.updatedAt = tender.updatedAt;
          const write = await Tender.collection.updateOne(filter, {
            $set: {
              rawLegacyState: tender.rawLegacyState || tender.state || null,
              state: 'Other',
              officialState: null,
              officialStateConfidence: 'unknown',
              gemFieldConfidence: { officialState: 'unknown', deliveryLocation: 'unknown' },
              gemValidationFlags: ['PDF_UNAVAILABLE_OR_UNPARSEABLE'],
              gemStatus: tender.closingDate && new Date(tender.closingDate) < new Date() ? 'CLOSED_BY_DATE' : 'UNKNOWN',
              locationVerificationStatus: 'PARSE_FAILED',
              geographyEvidence: pdfUrl || null,
              geographyCorrectedAt: new Date(),
              pdfParsedAt: new Date(),
              pdfParseStatus: 'FAILED',
              pdfFetchStatus: pdfDownloaded ? 'COMPLETED' : 'FAILED',
              gemPdfError: String(error.message || error).slice(0, 500),
            }
          });
          result.outcome = write.matchedCount ? 'UNVERIFIABLE' : 'CONFLICT';
          if (!write.matchedCount) result.reason = 'Record changed after it was read; left untouched';
        }
      }

      outcomes.push(result);
      if ((index + 1) % 25 === 0 || index === records.length - 1) {
        await writeFile(reportPath, JSON.stringify(outcomes, null, 2), { mode: 0o600 });
        console.log(`Processed ${index + 1}/${records.length}; report=${reportPath}`);
      }
    }

    await writeFile(reportPath, JSON.stringify(outcomes, null, 2), { mode: 0o600 });
    const counts = outcomes.reduce((acc, item) => {
      acc[item.outcome] = (acc[item.outcome] || 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({ counts, reportPath, backupPath: apply ? backupPath : null }, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    await closeDB().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`GeM historical repair failed: ${error.message}`);
  process.exitCode = 1;
});
