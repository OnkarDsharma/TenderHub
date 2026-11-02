/**
 * @file backend/src/services/adapters/GeMAdapter.js
 * @description Dedicated scraper adapter for Government e-Marketplace (GeM - bidplus.gem.gov.in).
 * 
 * The regional sweeps below are full-text discovery searches. A search keyword
 * is recorded as provenance only; official geography must come from the PDF.
 * Delivery location is left unknown unless an explicitly labeled delivery
 * section can be parsed.
 */

import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { chromium } from 'playwright';
import Tender from '../../models/Tender.js';
import { canonicalizeGeMState, extractTextFromPdfBuffer, parseGeMBidPdfText, GEM_PARSER_VERSION } from '../../utils/gemPdfParser.js';
import pino from 'pino';
import { createHash } from 'node:crypto';

const logger = pino();


/**
 * Safely parses any date representation (ISO, Date object, array, or DD-MM-YYYY) into a valid JS Date
 * @param {*} val 
 * @param {Date} fallback 
 * @returns {Date}
 */
export function safeDate(val, fallback = new Date()) {
  if (!val) return fallback;
  if (Array.isArray(val) && val.length > 0) val = val[0];
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // 1. Standard ISO or JS parseable string (e.g. 2026-10-27T11:00:00Z)
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    // 2. DD-MM-YYYY or DD/MM/YYYY with optional 12h/24h time and AM/PM
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?)?/i);
    if (dmyMatch) {
      let [_, day, month, year, hh = '00', mm = '00', ss = '00', ampm] = dmyMatch;
      let hour = parseInt(hh, 10);
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
      }
      const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+05:30`;
      const parsed = new Date(isoStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return fallback;
}

export class GeMAdapter extends TenderSourceAdapter {
  constructor() {
    super('GEM');
    this.baseUrl = 'https://bidplus.gem.gov.in';
    this.advanceSearchUrl = 'https://bidplus.gem.gov.in/advance-search';
  }

  /**
   * Helper sleep function for polite rate limiting
   */
  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Normalize parsed GeM bid data into standard Tender model format
   */
  normalize(rawBid) {
    const {
      bidNumber,
      items,
      quantity,
      departmentName,
      startDate,
      endDate,
      pdfUrl,
      pdfData = {}
    } = rawBid;
    const rawStartDate = startDate || rawBid.startDateStr;
    const rawEndDate = endDate || rawBid.endDateStr;

    // Use PDF data if available, fallback to card metadata
    const title = pdfData.itemCategory || items || `Title not confirmed (${bidNumber})`;
    const closingDate = pdfData.bidEndDate || (rawEndDate ? safeDate(rawEndDate, null) : null);
    const publishedDate = rawStartDate ? safeDate(rawStartDate, null) : (pdfData.dated ? safeDate(pdfData.dated, null) : null);
    const bidOpeningDate = pdfData.bidOpeningDate ? safeDate(pdfData.bidOpeningDate, null) : null;
    
    // Construct descriptive organization chain
    const orgChain = [
      pdfData.ministryName || null,
      pdfData.departmentName || departmentName || null,
      pdfData.organisationName
    ].filter(Boolean).join(' > ');

    const officialState = pdfData.ministryStateName || pdfData.ministryName || null;
    const state = canonicalizeGeMState(officialState) || 'Other';
    const location = pdfData.location || null;
    const locationVerificationStatus = location
      ? (pdfData.deliveryLocations?.length ? 'VERIFIED' : 'UNVERIFIED')
      : (pdfData.deliveryAddressDetails ? 'UNVERIFIED' : 'NOT_PROVIDED');

    return {
      sourcePortal: 'GEM',
      state,
      officialState,
      sourceSearchRegions: rawBid.sourceSearchRegions || (rawBid.state ? [rawBid.state] : []),
      locationVerificationStatus,
      sourceTenderId: bidNumber,
      title: String(title).slice(0, 500),
      workDescription: ['[GeM Procurement]', (pdfData.itemCategory || items) ? `Category: ${pdfData.itemCategory || items}` : null, (pdfData.totalQuantity ?? quantity) !== null && (pdfData.totalQuantity ?? quantity) !== undefined ? `Total Quantity: ${pdfData.totalQuantity ?? quantity}` : null, pdfData.consigneeAddress ? `Consignee: ${pdfData.consigneeAddress}` : null, location ? `Delivery Stations: ${location}` : null].filter(Boolean).join('\n'),
      tenderReferenceNumber: bidNumber,
      departmentCode: 'GEM',
      departmentName: pdfData.departmentName || departmentName || 'Not confirmed',
      organisationChain: orgChain,
      tenderCategory: 'Goods',
      formOfContract: pdfData.bidValidityDays ? `${pdfData.bidValidityDays} Days Validity` : 'GeM Contract',
      tenderType: 'GeM Bid / Reverse Auction',
      estimatedValue: null,
      emdAmount: pdfData.emdAmount ?? null,
      feePayableAt: pdfData.beneficiary || null,
      location: location,
      publishedDate: publishedDate,
      publishedDateStr: rawBid.startDateStr || (publishedDate ? publishedDate.toISOString() : null),
      closingDate: closingDate,
      closingDateStr: rawBid.endDateStr || (closingDate ? closingDate.toISOString() : null),
      bidOpeningDate: bidOpeningDate,
      status: closingDate && closingDate < new Date() ? 'CLOSED' : 'ACTIVE',
      gemStatus: closingDate && closingDate < new Date() ? 'CLOSED_BY_DATE' : (rawBid.lastSeenInListingAt ? 'ACTIVE' : 'UNKNOWN'),
      lastSeenInListingAt: rawBid.lastSeenInListingAt || null,
      lastCheckedAt: rawBid.lastCheckedAt || null,
      gemPdfUrl: pdfUrl || null,
      gemPdfFetchedAt: rawBid.gemPdfFetchedAt || null,
      gemPdfError: rawBid.gemPdfError || null,
      gemPdfSha256: rawBid.gemPdfSha256 || null,
      gemDocumentType: pdfData.documentType || 'UNKNOWN',
      gemParserVersion: pdfData.parserVersion || GEM_PARSER_VERSION,
      gemRawText: rawBid.gemRawText ? rawBid.gemRawText.slice(0, 120000) : undefined,
      gemRawTextTruncated: Boolean(rawBid.gemRawText && rawBid.gemRawText.length > 120000),
      rawMinistryStateName: pdfData.ministryStateName || null,
      officialStateConfidence: pdfData.fieldConfidence?.officialState || 'unknown',
      gemFieldConfidence: {
        ...(pdfData.fieldConfidence || {}),
        closingDate: pdfData.fieldConfidence?.closingDate === 'verified' ? 'verified' : (rawEndDate ? 'partial' : 'unknown'),
        status: rawBid.lastSeenInListingAt ? 'verified' : 'unknown',
      },
      gemValidationFlags: pdfData.validationFlags || [],
      rawDeliverySection: pdfData.rawDeliverySection || null,
      deliveryStations: pdfData.deliveryLocations || [],
      detailsUrl: pdfUrl,
      pdfUrls: pdfUrl ? [pdfUrl] : [],
      documents: pdfUrl ? [{
        sNo: 1,
        documentName: `${bidNumber.replace(/[\/\\?%*:|"<>]/g, '_')}_Bid_Document.pdf`,
        description: `Official GeM Bid Specification for ${bidNumber}`,
        fileUrl: pdfUrl
      }] : [],
      pdfFetchStatus: rawBid.pdfFetchStatus || (Object.keys(pdfData).length ? 'COMPLETED' : 'FAILED'),
      pdfParseStatus: rawBid.pdfParseStatus || (officialState ? 'COMPLETED' : 'FAILED'),
      pdfParsedAt: rawBid.pdfParsedAt || (Object.keys(pdfData).length ? new Date() : null),
    };
  }

  /**
   * Main crawl entry point
   * Queries GeM official listing with "Bid-Start-Date-Latest" sort
   * @param {number} pageNumber Starting page
   * @param {Object} filters Crawl options: limit, maxPages, requestDelay, isHeadless, state
   */
  async fetchList(pageNumber = 1, filters = {}) {
    const limit = filters.limit || 50;
    const maxPages = filters.maxPages || 5;
    const requestDelay = filters.delay || 1200; // Polite 1.2s gap between PDF requests
    const isHeadless = filters.headless !== false && process.env.SCRAPER_HEADLESS !== 'false';

    // Regional keyword resolution for discovery only; never use this value as
    // the tender's official state or delivery location.
    const STATE_MAP = {
      'JAMMU & KASHMIR': { label: 'JAMMU & KASHMIR', canonical: 'Jammu & Kashmir', keywords: ['Jammu', 'Kashmir', 'Srinagar'] },
      'JK': { label: 'JAMMU & KASHMIR', canonical: 'Jammu & Kashmir', keywords: ['Jammu', 'Kashmir', 'Srinagar'] },
      'HIMACHAL PRADESH': { label: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh', keywords: ['Himachal', 'Shimla'] },
      'HIMACHAL': { label: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh', keywords: ['Himachal', 'Shimla'] },
      'PUNJAB': { label: 'PUNJAB', canonical: 'Punjab', keywords: ['Punjab'] },
      'PB': { label: 'PUNJAB', canonical: 'Punjab', keywords: ['Punjab'] },
      'LADAKH': { label: 'LADAKH', canonical: 'Ladakh', keywords: ['Ladakh', 'Leh', 'Kargil'] }
    };
    const rawState = (filters.state || 'JAMMU & KASHMIR').toUpperCase().trim();
    const stateConfig = STATE_MAP[rawState] || { 
      label: rawState, 
      canonical: filters.state || 'Jammu & Kashmir', 
      keywords: [filters.state || 'Jammu'] 
    };
    const canonicalState = stateConfig.canonical;
    const searchKeywords = stateConfig.keywords;

    logger.info(`[GeMAdapter] Starting GeM scrape for [${canonicalState}] sorted by LATEST PUBLISHED (Limit: ${limit}, Max Pages: ${maxPages}, Delay: ${requestDelay}ms, Headless: ${isHeadless})...`);

    const browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    let totalSaved = 0;
    let totalSkipped = 0;
    let pdfFetchFailures = 0;
    let pdfParseFailures = 0;
    const processedBidNumbers = new Set();

    try {
      logger.info(`[GeMAdapter] Navigating to ${this.baseUrl}/all-bids to initialize session & CSRF tokens...`);
      await page.goto(`${this.baseUrl}/all-bids`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.sleep(2500);

      // Extract CSRF token from page
      const csrfToken = await page.evaluate(() => {
        const match = document.documentElement.innerHTML.match(/csrf_bd_gem_nk['\"]\s*:\s*['\"]([^'\"]+)['\"]/);
        return match ? match[1] : '';
      });

      if (!csrfToken) throw new Error('GeM CSRF token missing; listing request was not attempted');

      logger.info(`[GeMAdapter] Portal session established (CSRF Token secured: ${csrfToken ? 'Yes' : 'No'}).`);

      // Iterate through regional keywords
      for (const kw of searchKeywords) {
        if (totalSaved >= limit) break;
        logger.info(`[GeMAdapter] Querying GeM live feed for keyword "${kw}" [${canonicalState}] with "Bid-Start-Date-Latest"...`);

        for (let currentPageNum = pageNumber; currentPageNum <= maxPages; currentPageNum++) {
          if (totalSaved >= limit) break;

          logger.info(`[GeMAdapter] Fetching Page ${currentPageNum} of ${maxPages} for "${kw}"...`);

          let queryResult;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            queryResult = await page.evaluate(async ({ keyword, pageNum, csrf }) => {
              return new Promise((resolve) => {
                const payload = {
                  page: pageNum,
                  param: { searchBid: keyword, searchType: 'fullText' },
                  filter: { bidStatusType: 'ongoing_bids', byType: 'all', highBidValue: '', byEndDate: { from: '', to: '' }, sort: 'Bid-Start-Date-Latest' }
                };
                window['$'].ajax({
                  type: 'POST', url: 'https://bidplus.gem.gov.in/all-bids-data', dataType: 'json',
                  data: { payload: JSON.stringify(payload), csrf_bd_gem_nk: csrf },
                  success: (data) => resolve(data?.response?.response || {}),
                  error: (err) => resolve({ error: err.statusText || `HTTP ${err.status || 'request failure'}` })
                });
              });
            }, { keyword: kw, pageNum: currentPageNum, csrf: csrfToken });
            if (!queryResult.error || attempt === 2) break;
            await this.sleep(requestDelay * (attempt + 1));
          }

          if (queryResult.error) {
            logger.warn(`[GeMAdapter] GeM API returned notice for "${kw}" page ${currentPageNum}: ${queryResult.error}`);
            throw new Error(`GeM listing request failed for ${kw} page ${currentPageNum}: ${queryResult.error}`);
          }
          if (!Array.isArray(queryResult.docs) || !Number.isFinite(Number(queryResult.numFound))) {
            throw new Error(`GeM listing response shape was not recognized for ${kw} page ${currentPageNum}`);
          }

          const docs = queryResult.docs || [];
          const totalRecords = queryResult.numFound || 0;
          logger.info(`[GeMAdapter] Received ${docs.length} bids from Page ${currentPageNum} (Total matching in GeM: ${totalRecords})`);

          if (docs.length === 0) {
            break;
          }

          for (const doc of docs) {
            if (totalSaved >= limit) break;

            const bId = doc.b_id?.[0] || doc.id;
            let bidNumber = doc.b_bid_number?.[0] || '';
            if (!bId || !bidNumber) {
              totalSkipped += 1;
              logger.warn({ keyword: kw, page: currentPageNum, hasDocumentId: Boolean(bId), hasBidNumber: Boolean(bidNumber) }, '[GeMAdapter] Skipped listing row without stable bid identifiers');
              continue;
            }
            if (processedBidNumbers.has(bidNumber)) {
              totalSkipped += 1;
              continue;
            }
            processedBidNumbers.add(bidNumber);
            const bidType = doc.b_bid_type?.[0];

            let pdfUrl = `https://bidplus.gem.gov.in/showbidDocument/${bId}`;
            if (bidType === 5) {
              pdfUrl = `https://bidplus.gem.gov.in/showdirectradocumentPdf/${bId}`;
            } else if (bidType === 2) {
              pdfUrl = `https://bidplus.gem.gov.in/showradocumentPdf/${bId}`;
            }

            const items = doc.b_category_name?.[0] || doc.bd_category_name?.[0] || null;
            const quantity = doc.b_total_quantity?.[0] ?? null;
            const dept = doc.ba_official_details_deptName?.[0] || doc.ba_official_details_minName?.[0] || null;
            const ministry = doc.ba_official_details_minName?.[0] || '';
            const startDate = doc.final_start_date_sort?.[0];
            const endDate = doc.final_end_date_sort?.[0];

            const rawBid = {
              bidNumber,
              items,
              quantity,
              departmentName: dept,
              ministryName: ministry,
              startDate,
              endDate,
              pdfUrl,
              state: canonicalState,
              sourceSearchRegions: [canonicalState],
              lastSeenInListingAt: new Date(),
              lastCheckedAt: new Date(),
            };

            logger.info(`[GeMAdapter] (${totalSaved + 1}/${limit}) Processing ${bidNumber} [${canonicalState}] (Published: ${startDate ? new Date(startDate).toLocaleString('en-IN') : 'N/A'})...`);

            // Check if already in MongoDB with completed PDF fetch
            const existingTender = await Tender.findOne({
              sourcePortal: 'GEM',
              sourceTenderId: bidNumber
            });

            const listingClosingDate = endDate ? safeDate(endDate, null) : null;
            const closingUnchanged = !listingClosingDate || Boolean(existingTender?.closingDate && Math.abs(existingTender.closingDate.getTime() - listingClosingDate.getTime()) < 60000);
            const linkUnchanged = existingTender?.gemPdfUrl === pdfUrl;
            if (existingTender && existingTender.pdfFetchStatus === 'COMPLETED' && existingTender.officialState && closingUnchanged && linkUnchanged && existingTender.lastCheckedAt && Date.now() - existingTender.lastCheckedAt.getTime() < (existingTender.closingDate && existingTender.closingDate.getTime() - Date.now() < 48 * 3600000 ? 8 : 24) * 3600000) {
              const updates = { $addToSet: { sourceSearchRegions: canonicalState }, $set: { lastSeenInListingAt: new Date(), lastCheckedAt: new Date(), gemStatus: existingTender.closingDate && existingTender.closingDate < new Date() ? 'CLOSED_BY_DATE' : 'ACTIVE', 'gemFieldConfidence.status': 'verified' } };
              if (startDate && (!existingTender.publishedDate || Math.abs(existingTender.publishedDate.getTime() - new Date(startDate).getTime()) > 60000)) {
                updates.$set.publishedDate = safeDate(startDate);
                updates.$set.publishedDateStr = startDate;
              }
              if (Object.keys(updates.$set).length === 0) delete updates.$set;
              await Tender.updateOne({ _id: existingTender._id }, updates);
              logger.info(`[GeMAdapter] Bid ${bidNumber} already exists in database. Updated metadata & skipped redundant PDF download.`);
              totalSaved++;
              continue;
            }

            let pdfData = {};
            let pdfFetchStatus = 'FAILED';
            let pdfParseStatus = 'FAILED';
            let pdfParsedAt = null;
            let pdfFetchedAt = null;
            let pdfSha256 = null;
            let rawPdfText = null;
            let pdfDownloadCompleted = false;
            let pdfError = null;

            // Download and parse PDF specifications with polite rate limiting
            if (pdfUrl) {
              try {
                await this.sleep(requestDelay);

                let response;
                for (let attempt = 0; attempt < 3; attempt += 1) {
                  response = await context.request.get(pdfUrl, {
                    headers: { 'Referer': `${this.baseUrl}/all-bids`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 25000
                  });
                  if (response.ok() || (response.status() < 500 && response.status() !== 429)) break;
                  if (attempt < 2) await this.sleep(requestDelay * (attempt + 1));
                }

                if (response.ok()) {
                  const pdfBuffer = await response.body();
                  if (pdfBuffer.subarray(0, 4).toString() !== '%PDF') throw new Error(`GeM response is not a PDF (HTTP ${response.status()})`);
                  pdfDownloadCompleted = true;
                  pdfFetchedAt = new Date();
                  pdfSha256 = createHash('sha256').update(pdfBuffer).digest('hex');
                  rawPdfText = await extractTextFromPdfBuffer(pdfBuffer);
                  if (rawPdfText) {
                    pdfData = parseGeMBidPdfText(rawPdfText);
                    if (!pdfData.bidNumber) {
                      pdfData = {};
                      rawPdfText = null;
                      pdfSha256 = null;
                      throw new Error('PDF bid number missing; refusing to attach uncertain document');
                    }
                    if (pdfData.bidNumber.toUpperCase() !== bidNumber.toUpperCase()) {
                      pdfData = {};
                      rawPdfText = null;
                      pdfSha256 = null;
                      throw new Error(`PDF bid number mismatch: expected ${bidNumber}, found ${pdfData.bidNumber}`);
                    }
                    pdfFetchStatus = 'COMPLETED';
                    pdfParseStatus = pdfData.ministryStateName ? 'COMPLETED' : 'FAILED';
                    pdfParsedAt = new Date();
                    logger.info(`[GeMAdapter] Parsed PDF for ${bidNumber} (official state: ${pdfData.ministryStateName || 'unavailable'}, delivery location: ${pdfData.location || 'unverified'})`);
                  }
                }
                else throw new Error(`GeM PDF request returned HTTP ${response.status()}`);
              } catch (pdfErr) {
                pdfError = String(pdfErr.message || pdfErr).slice(0, 500);
                logger.warn(`[GeMAdapter] PDF download note for ${bidNumber}: ${pdfErr.message}`);
              }
            }

            if (!pdfDownloadCompleted) pdfFetchFailures += 1;
            if (pdfDownloadCompleted && pdfParseStatus !== 'COMPLETED') pdfParseFailures += 1;

            rawBid.pdfData = pdfData;
            rawBid.pdfFetchStatus = pdfDownloadCompleted ? 'COMPLETED' : pdfFetchStatus;
            rawBid.pdfParseStatus = pdfParseStatus;
            rawBid.pdfParsedAt = pdfParsedAt;
            rawBid.gemPdfError = pdfError;
            rawBid.gemPdfFetchedAt = pdfFetchedAt;
            rawBid.gemPdfSha256 = pdfSha256;
            rawBid.gemRawText = rawPdfText;
            const normalized = this.normalize(rawBid);

            // Listing presence confirms the bid is currently in the ongoing feed;
            // absence is deliberately not used to close/cancel stored records.
            if (pdfData.bidEndDate && pdfData.bidOpeningDate && pdfData.bidEndDate <= pdfData.bidOpeningDate) {
              normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'DATE_ORDER_INVALID'])];
              normalized.gemFieldConfidence = { ...(normalized.gemFieldConfidence || {}), closingDate: 'unverified' };
            }
            if (ministry && pdfData.ministryName && ministry.trim().toLowerCase() !== pdfData.ministryName.trim().toLowerCase()) {
              normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'SOURCE_CONFLICT'])];
            }
            if (dept && pdfData.departmentName && dept.trim().toLowerCase() !== pdfData.departmentName.trim().toLowerCase()) {
              normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'SOURCE_CONFLICT'])];
            }
            if (listingClosingDate && pdfData.bidEndDate && Math.abs(listingClosingDate.getTime() - pdfData.bidEndDate.getTime()) > 60000) {
              normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'SOURCE_CONFLICT'])];
              normalized.closingDate = new Date(Math.max(listingClosingDate.getTime(), pdfData.bidEndDate.getTime()));
              normalized.closingDateStr = normalized.closingDate.toISOString();
            }
            if (existingTender) {
              // Never replace verified source-backed values with a failed reparse;
              // never retain a legacy region label as official geography.
              for (const field of ['departmentName', 'organisationChain', 'closingDate', 'publishedDate']) {
                if ((normalized[field] === null || normalized[field] === undefined || normalized[field] === '' || normalized[field] === 'Other') && existingTender[field] !== undefined) normalized[field] = existingTender[field];
              }
              if (existingTender.officialState && (!rawPdfText || !pdfData.ministryStateName)) {
                for (const field of ['officialState', 'rawMinistryStateName', 'state']) {
                  if (normalized[field] === null || normalized[field] === undefined || normalized[field] === '' || normalized[field] === 'Other') normalized[field] = existingTender[field];
                }
              } else if (!rawPdfText) {
                normalized.rawLegacyState = existingTender.rawLegacyState || existingTender.state || null;
                normalized.state = 'Other';
                normalized.officialState = null;
                normalized.officialStateConfidence = 'unknown';
              }
              if (existingTender.locationVerificationStatus === 'VERIFIED' && !rawPdfText && !normalized.location) {
                normalized.location = existingTender.location;
                normalized.rawDeliverySection = existingTender.rawDeliverySection;
                normalized.locationVerificationStatus = 'VERIFIED';
              }
              if (existingTender.closingDate && normalized.closingDate && normalized.closingDate < existingTender.closingDate && listingClosingDate && listingClosingDate < existingTender.closingDate) {
                normalized.closingDate = existingTender.closingDate;
                normalized.closingDateStr = existingTender.closingDateStr;
                normalized.gemValidationFlags = [...new Set([...(normalized.gemValidationFlags || []), 'SOURCE_CONFLICT'])];
              }
              if (!rawPdfText) {
                for (const field of ['officialStateConfidence', 'gemFieldConfidence', 'gemValidationFlags', 'gemPdfSha256', 'gemDocumentType', 'gemParserVersion', 'gemRawText', 'gemRawTextTruncated', 'pdfParsedAt']) {
                  if (existingTender[field] !== undefined) normalized[field] = existingTender[field];
                }
              }
            }

            await Tender.findOneAndUpdate(
              { sourcePortal: 'GEM', sourceTenderId: normalized.sourceTenderId },
              { $set: normalized },
              { upsert: true, returnDocument: 'after' }
            );

            totalSaved++;
          }
        }
      }

      logger.info({ totalSaved, totalSkipped, pdfFetchFailures, pdfParseFailures, state: canonicalState, searchKeywords }, '[GeMAdapter] GeM sweep complete');
      return { success: true, totalSaved, totalSkipped, pdfFetchFailures, pdfParseFailures };

    } catch (err) {
      logger.error(`[GeMAdapter] Crawl error: ${err.message}`);
      throw err;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  async fetchDetail(sourceTenderId) {
    return await Tender.findOne({ sourcePortal: 'GEM', sourceTenderId });
  }
}

export const gemAdapter = new GeMAdapter();
