/**
 * @file backend/src/services/adapters/GeMAdapter.js
 * @description Dedicated scraper adapter for Government e-Marketplace (GeM - bidplus.gem.gov.in).
 * 
 * Target:
 * - Advance Search: Search by Consignee Location -> State = "JAMMU & KASHMIR"
 * - Ingests active bids & RAs for J&K buyers and delivery stations.
 * - Respects rate limiting: Sequential 1200ms delay between PDF fetches to prevent IP blocking.
 * - Parses full PDF specifications (EMD, Turnovers, Experience, Delivery Stations in Rajouri/Poonch/Srinagar/etc.).
 * - Upserts normalized tender data into MongoDB Atlas with sourcePortal: 'GEM'.
 */

import { TenderSourceAdapter } from './TenderSourceAdapter.js';
import { chromium } from 'playwright';
import Tender from '../../models/Tender.js';
import { extractTextFromPdfBuffer, parseGeMBidPdfText } from '../../utils/gemPdfParser.js';
import pino from 'pino';

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
    const title = pdfData.itemCategory || items || `GeM Bid ${bidNumber}`;
    const closingDate = safeDate(pdfData.bidEndDate, safeDate(rawEndDate, new Date(Date.now() + 14 * 86400000)));
    const publishedDate = safeDate(pdfData.dated, safeDate(rawStartDate, new Date()));
    const bidOpeningDate = pdfData.bidOpeningDate ? safeDate(pdfData.bidOpeningDate, null) : null;
    
    // Construct descriptive organization chain
    const orgChain = [
      pdfData.ministryName || 'Central / State Govt',
      pdfData.departmentName || departmentName || 'Government Department',
      pdfData.organisationName
    ].filter(Boolean).join(' > ');

    const defaultState = rawBid.state || 'Jammu & Kashmir';

    // Primary location
    const location = (pdfData.deliveryLocations && pdfData.deliveryLocations.length > 0)
      ? pdfData.deliveryLocations.join(', ')
      : (pdfData.consigneeAddress || defaultState);

    // Carve out Ladakh if delivery locations explicitly indicate Leh/Kargil under J&K crawl
    let bidState = defaultState;
    if (/leh|kargil/i.test(location) && (defaultState === 'Jammu & Kashmir' || defaultState === 'Ladakh')) {
      bidState = 'Ladakh';
    }

    return {
      sourcePortal: 'GEM',
      state: bidState,
      sourceTenderId: bidNumber,
      title: String(title).slice(0, 500),
      workDescription: `[GeM Procurement] Category: ${pdfData.itemCategory || items}\nTotal Quantity: ${pdfData.totalQuantity || quantity}\nConsignee: ${pdfData.consigneeAddress || bidState}\nDelivery Stations: ${location}`,
      tenderReferenceNumber: bidNumber,
      departmentCode: 'GEM',
      departmentName: pdfData.departmentName || departmentName || 'Government e-Marketplace',
      organisationChain: orgChain,
      tenderCategory: 'Goods',
      formOfContract: pdfData.bidValidityDays ? `${pdfData.bidValidityDays} Days Validity` : 'GeM Contract',
      tenderType: 'GeM Bid / Reverse Auction',
      estimatedValue: pdfData.minTurnoverLakhs ? pdfData.minTurnoverLakhs * 100000 : 0,
      emdAmount: pdfData.emdAmount || 0,
      feePayableAt: pdfData.beneficiary || bidState,
      location: location,
      publishedDate: publishedDate,
      publishedDateStr: rawBid.startDateStr || (publishedDate ? publishedDate.toISOString() : null),
      closingDate: closingDate,
      closingDateStr: rawBid.endDateStr || (closingDate ? closingDate.toISOString() : null),
      bidOpeningDate: bidOpeningDate,
      status: 'ACTIVE',
      detailsUrl: pdfUrl,
      pdfUrls: pdfUrl ? [pdfUrl] : [],
      documents: pdfUrl ? [{
        sNo: 1,
        documentName: `${bidNumber.replace(/[\/\\?%*:|"<>]/g, '_')}_Bid_Document.pdf`,
        description: `Official GeM Bid Specification for ${bidNumber}`,
        fileUrl: pdfUrl
      }] : [],
      pdfFetchStatus: 'COMPLETED'
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

    // Regional state resolution
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

    try {
      logger.info(`[GeMAdapter] Navigating to ${this.baseUrl}/all-bids to initialize session & CSRF tokens...`);
      await page.goto(`${this.baseUrl}/all-bids`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.sleep(2500);

      // Extract CSRF token from page
      const csrfToken = await page.evaluate(() => {
        const match = document.documentElement.innerHTML.match(/csrf_bd_gem_nk['\"]\s*:\s*['\"]([^'\"]+)['\"]/);
        return match ? match[1] : '';
      });

      logger.info(`[GeMAdapter] Portal session established (CSRF Token secured: ${csrfToken ? 'Yes' : 'No'}).`);

      // Iterate through regional keywords
      for (const kw of searchKeywords) {
        if (totalSaved >= limit) break;
        logger.info(`[GeMAdapter] Querying GeM live feed for keyword "${kw}" [${canonicalState}] with "Bid-Start-Date-Latest"...`);

        for (let currentPageNum = pageNumber; currentPageNum <= maxPages; currentPageNum++) {
          if (totalSaved >= limit) break;

          logger.info(`[GeMAdapter] Fetching Page ${currentPageNum} of ${maxPages} for "${kw}"...`);

          const queryResult = await page.evaluate(async ({ keyword, pageNum, csrf }) => {
            return new Promise((resolve) => {
              const payload = {
                page: pageNum,
                param: { searchBid: keyword, searchType: 'fullText' },
                filter: {
                  bidStatusType: 'ongoing_bids',
                  byType: 'all',
                  highBidValue: '',
                  byEndDate: { from: '', to: '' },
                  sort: 'Bid-Start-Date-Latest'
                }
              };

              window['$'].ajax({
                type: 'POST',
                url: 'https://bidplus.gem.gov.in/all-bids-data',
                dataType: 'json',
                data: { payload: JSON.stringify(payload), csrf_bd_gem_nk: csrf },
                success: (data) => resolve(data?.response?.response || {}),
                error: (err) => resolve({ error: err.statusText || 'AJAX Error' })
              });
            });
          }, { keyword: kw, pageNum: currentPageNum, csrf: csrfToken });

          if (queryResult.error) {
            logger.warn(`[GeMAdapter] GeM API returned notice for "${kw}" page ${currentPageNum}: ${queryResult.error}`);
            break;
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
            const bidType = doc.b_bid_type?.[0];

            let pdfUrl = `https://bidplus.gem.gov.in/showbidDocument/${bId}`;
            if (bidType === 5) {
              pdfUrl = `https://bidplus.gem.gov.in/showdirectradocumentPdf/${bId}`;
            } else if (bidType === 2) {
              pdfUrl = `https://bidplus.gem.gov.in/showradocumentPdf/${bId}`;
            }

            const items = doc.b_category_name?.[0] || doc.bd_category_name?.[0] || 'General Supplies';
            const quantity = doc.b_total_quantity?.[0] || 0;
            const dept = doc.ba_official_details_deptName?.[0] || doc.ba_official_details_minName?.[0] || 'Government Department';
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
              state: canonicalState
            };

            logger.info(`[GeMAdapter] (${totalSaved + 1}/${limit}) Processing ${bidNumber} [${canonicalState}] (Published: ${startDate ? new Date(startDate).toLocaleString('en-IN') : 'N/A'})...`);

            // Check if already in MongoDB with completed PDF fetch
            const existingTender = await Tender.findOne({
              sourcePortal: 'GEM',
              sourceTenderId: bidNumber
            });

            if (existingTender && existingTender.pdfFetchStatus === 'COMPLETED') {
              const updates = {};
              if (!existingTender.state || existingTender.state !== canonicalState) {
                updates.state = canonicalState;
              }
              if (startDate && (!existingTender.publishedDate || Math.abs(existingTender.publishedDate.getTime() - new Date(startDate).getTime()) > 60000)) {
                updates.publishedDate = safeDate(startDate);
                updates.publishedDateStr = startDate;
              }
              if (Object.keys(updates).length > 0) {
                await Tender.updateOne({ _id: existingTender._id }, { $set: updates });
              }
              logger.info(`[GeMAdapter] Bid ${bidNumber} already exists in database. Updated metadata & skipped redundant PDF download.`);
              totalSaved++;
              continue;
            }

            let pdfData = {};

            // Download and parse PDF specifications with polite rate limiting
            if (pdfUrl) {
              try {
                await this.sleep(requestDelay);

                const response = await context.request.get(pdfUrl, {
                  headers: {
                    'Referer': `${this.baseUrl}/all-bids`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  },
                  timeout: 25000
                });

                if (response.ok()) {
                  const pdfBuffer = await response.body();
                  const rawPdfText = await extractTextFromPdfBuffer(pdfBuffer);
                  if (rawPdfText) {
                    pdfData = parseGeMBidPdfText(rawPdfText);
                    logger.info(`[GeMAdapter] Successfully parsed PDF for ${bidNumber} (EMD: ₹${pdfData.emdAmount || 0}, Delivery: ${pdfData.deliveryLocations?.join(', ') || canonicalState})`);
                  }
                }
              } catch (pdfErr) {
                logger.warn(`[GeMAdapter] PDF download note for ${bidNumber}: ${pdfErr.message}`);
              }
            }

            rawBid.pdfData = pdfData;
            const normalized = this.normalize(rawBid);

            await Tender.findOneAndUpdate(
              { sourcePortal: 'GEM', sourceTenderId: normalized.sourceTenderId },
              { $set: normalized },
              { upsert: true, returnDocument: 'after' }
            );

            totalSaved++;
          }
        }
      }

      logger.info(`[GeMAdapter] Crawl complete. Total saved/upserted: ${totalSaved}`);
      return { success: true, totalSaved, totalSkipped };

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
