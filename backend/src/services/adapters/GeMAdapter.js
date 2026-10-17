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
 * Safely parses any date representation (ISO, Date object, or DD-MM-YYYY) into a valid JS Date
 * @param {*} val 
 * @param {Date} fallback 
 * @returns {Date}
 */
export function safeDate(val, fallback = new Date()) {
  if (!val) return fallback;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'string') {
    const dmyMatch = val.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmyMatch) {
      const [_, d, m, y, hh = '00', mm = '00', ss = '00'] = dmyMatch;
      const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+05:30`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
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

    // Use PDF data if available, fallback to card metadata
    const title = pdfData.itemCategory || items || `GeM Bid ${bidNumber}`;
    const closingDate = safeDate(pdfData.bidEndDate, safeDate(endDate, new Date(Date.now() + 14 * 86400000)));
    const publishedDate = safeDate(pdfData.dated, safeDate(startDate, new Date()));
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
      closingDate: closingDate,
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
   * @param {number} pageNumber Starting page
   * @param {Object} filters Crawl options: limit, maxPages, requestDelay, isHeadless
   */
  async fetchList(pageNumber = 1, filters = {}) {
    const limit = filters.limit || 50;
    const maxPages = filters.maxPages || 5;
    const requestDelay = filters.delay || 1200; // Polite 1.2s gap between PDF requests
    const isHeadless = filters.headless !== false && process.env.SCRAPER_HEADLESS !== 'false';

    // Regional state resolution
    const STATE_MAP = {
      'JAMMU & KASHMIR': { label: 'JAMMU & KASHMIR', canonical: 'Jammu & Kashmir' },
      'JK': { label: 'JAMMU & KASHMIR', canonical: 'Jammu & Kashmir' },
      'HIMACHAL PRADESH': { label: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh' },
      'HIMACHAL': { label: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh' },
      'HP': { label: 'HIMACHAL PRADESH', canonical: 'Himachal Pradesh' },
      'PUNJAB': { label: 'PUNJAB', canonical: 'Punjab' },
      'PB': { label: 'PUNJAB', canonical: 'Punjab' }
    };
    const rawState = (filters.state || 'JAMMU & KASHMIR').toUpperCase().trim();
    const stateConfig = STATE_MAP[rawState] || { label: rawState, canonical: filters.state || 'Jammu & Kashmir' };
    const portalState = stateConfig.label;
    const canonicalState = stateConfig.canonical;

    logger.info(`[GeMAdapter] Starting GeM scrape for [${canonicalState}] (Limit: ${limit}, Max Pages: ${maxPages}, Delay: ${requestDelay}ms, Headless: ${isHeadless})...`);

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
    let currentPageNum = pageNumber;

    try {
      logger.info(`[GeMAdapter] Navigating to ${this.advanceSearchUrl}...`);
      await page.goto(this.advanceSearchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.sleep(3000);

      // 1. Switch to "Search by Consignee Location" tab
      logger.info('[GeMAdapter] Switching to "Search by Consignee Location" tab...');
      
      const consigneeTab = page.locator('a:has-text("Search by Consignee Location"), [href*="consignee"], li:has-text("Consignee Location") a').first();
      await consigneeTab.scrollIntoViewIfNeeded().catch(() => {});
      await consigneeTab.click({ force: true }).catch(() => {});

      // Trigger Bootstrap jQuery tab switch if present
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a, button, [data-toggle="tab"]'));
        const target = tabs.find(t => (t.innerText || '').includes('Search by Consignee Location'));
        if (target) {
          if (window.$ && typeof window.$(target).tab === 'function') {
            window.$(target).tab('show');
          } else {
            target.click();
          }
        }
      });

      // Check if Consignee Location tab contents are visible
      logger.info('[GeMAdapter] Checking for Consignee Location tab contents...');
      await page.waitForFunction(() => {
        const txt = document.body.innerText || '';
        return txt.includes('Consignee State') || txt.includes('Consignee City');
      }, { timeout: 12000 }).catch(() => {
        logger.warn('[GeMAdapter] Tab label wait timed out, continuing...');
      });
      await this.sleep(1200);

      // 2. Select State dropdown: JAMMU & KASHMIR / PUNJAB / HIMACHAL PRADESH
      logger.info(`[GeMAdapter] Selecting "${portalState}" in State dropdown...`);
      
      // Attempt 1: Direct DOM & jQuery selection on underlying <select> element
      let stateSelected = await page.evaluate((targetLabel) => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const s of selects) {
          const options = Array.from(s.options);
          const matchedOpt = options.find(o => 
            o.text && (
              o.text.toUpperCase().trim() === targetLabel.toUpperCase().trim() ||
              o.text.toUpperCase().includes(targetLabel.toUpperCase())
            )
          );
          if (matchedOpt) {
            s.value = matchedOpt.value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.$ && typeof window.$(s).val === 'function') {
              window.$(s).val(matchedOpt.value).trigger('change');
            }
            return { success: true, method: 'dom-select', val: matchedOpt.value, text: matchedOpt.text };
          }
        }
        return { success: false };
      }, portalState);

      // Attempt 2: If DOM select didn't find or set it, interact with Select2 UI
      if (!stateSelected || !stateSelected.success) {
        logger.info(`[GeMAdapter] Attempting Select2 UI interaction for "${portalState}"...`);
        const select2Boxes = page.locator('.select2-container:visible, .select2-selection:visible, span[id*="select2-"]');
        const boxCount = await select2Boxes.count();
        
        for (let i = 0; i < boxCount; i++) {
          const box = select2Boxes.nth(i);
          const text = await box.innerText().catch(() => '');
          if (text.toUpperCase().includes(portalState.toUpperCase())) {
            stateSelected = { success: true, method: 'already-selected' };
            break;
          }
          if (text.includes('State') || text.includes('Select') || text.trim() === '') {
            await box.click({ timeout: 4000 }).catch(() => {});
            await this.sleep(600);

            const searchField = page.locator('.select2-search__field:visible, input[type="search"]:visible').first();
            if (await searchField.count() > 0) {
              await searchField.fill(portalState);
              await this.sleep(600);
              await page.keyboard.press('Enter');
              stateSelected = { success: true, method: 'select2-typed' };
              break;
            } else {
              const opt = page.locator('.select2-results__option, li').filter({ hasText: new RegExp(portalState, 'i') }).first();
              if (await opt.count() > 0) {
                await opt.click({ timeout: 3000 }).catch(() => {});
                stateSelected = { success: true, method: 'select2-option-click' };
                break;
              }
            }
          }
        }
      }

      logger.info(`[GeMAdapter] State selection result for "${portalState}": ${JSON.stringify(stateSelected)}`);
      await this.sleep(1500);

      // 3. Click the Search button inside Consignee Location tab
      logger.info('[GeMAdapter] Submitting search in Consignee Location tab...');
      let searchClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
        const searchBtn = buttons.find(b => {
          const txt = (b.textContent || b.value || '').trim();
          const isVisible = b.offsetParent !== null;
          return isVisible && (txt.startsWith('Search') || b.id === 'search' || b.id === 'btnSearch') && !txt.includes('Advance');
        });
        if (searchBtn) {
          searchBtn.click();
          return true;
        }
        return false;
      });

      if (!searchClicked) {
        const searchLoc = page.locator('button:has-text("Search"), input[value*="Search"]').filter({ hasNotText: 'Advance' }).first();
        if (await searchLoc.count() > 0) {
          await searchLoc.click({ force: true, timeout: 5000 }).catch(() => {});
          searchClicked = true;
        }
      }

      // 4. Wait for the results to load (e.g. "Showing 1 - 10 records of ...")
      logger.info('[GeMAdapter] Waiting for search results to load on page...');
      await page.waitForFunction(() => {
        const txt = document.body.innerText || '';
        const hasLinks = document.querySelectorAll('a[href*="showbidDocument"]').length > 0;
        return hasLinks || txt.includes('records of') || txt.includes('Showing 1 -') || txt.includes('No records found');
      }, { timeout: 30000 }).catch(() => {
        logger.warn('[GeMAdapter] Results wait notice: continuing to scan page...');
      });
      await this.sleep(3000);

      // 5. Crawl results page by page
      while (currentPageNum <= maxPages && totalSaved < limit) {
        logger.info(`[GeMAdapter] Scanning Page ${currentPageNum} for bid entries...`);

        // Extract bid items on the current page
        const bidsOnPage = await page.evaluate(() => {
          const results = [];
          
          // Find all links containing showbidDocument or mentioning GEM/
          const allLinks = Array.from(document.querySelectorAll('a'));
          const bidLinks = allLinks.filter(a => {
            const href = a.getAttribute('href') || '';
            const txt = (a.textContent || '').trim();
            return href.includes('showbidDocument') || /GEM\/\d{4}\//i.test(txt);
          });
          
          for (const link of bidLinks) {
            let bidNumber = (link.textContent || '').trim();
            const gemMatch = bidNumber.match(/GEM\/\d{4}\/[A-Z0-9_\/]+/i);
            if (gemMatch) {
              bidNumber = gemMatch[0];
            } else if (!bidNumber.includes('GEM/')) {
              continue;
            }

            const href = link.getAttribute('href') || '';
            let docUrl = href.startsWith('http') ? href : `https://bidplus.gem.gov.in${href}`;
            if (!href.includes('showbidDocument')) {
              const numId = bidNumber.replace(/^[^\d]+/, '').replace(/[^\d]/g, '');
              docUrl = `https://bidplus.gem.gov.in/showbidDocument/${numId}`;
            }

            // Find parent card / container
            let container = link;
            for (let i = 0; i < 6 && container && container.parentElement; i++) {
              container = container.parentElement;
              if (container.innerText && container.innerText.includes('Quantity') && container.innerText.includes('Department Name')) {
                break;
              }
            }
            const cardText = container ? container.innerText : '';

            // Extract item & quantity
            const itemsMatch = cardText.match(/Items?:\s*([^\n]+)/i);
            const quantityMatch = cardText.match(/Quantity:\s*(\d+)/i);
            const deptMatch = cardText.match(/Department\s*Name\s*And\s*Address:\s*([^\n]+(?:\n[^\n]+)?)/i);
            const startMatch = cardText.match(/Start\s*Date:\s*([^\n]+)/i);
            const endMatch = cardText.match(/End\s*Date:\s*([^\n]+)/i);

            results.push({
              bidNumber: bidNumber,
              pdfUrl: docUrl,
              items: itemsMatch ? itemsMatch[1].trim() : 'General Supplies',
              quantity: quantityMatch ? parseInt(quantityMatch[1], 10) : 0,
              departmentName: deptMatch ? deptMatch[1].replace(/\s+/g, ' ').trim() : 'Government Department',
              startDateStr: startMatch ? startMatch[1].trim() : '',
              endDateStr: endMatch ? endMatch[1].trim() : ''
            });
          }

          // Deduplicate by bidNumber
          const unique = [];
          const seen = new Set();
          for (const item of results) {
            if (!seen.has(item.bidNumber)) {
              seen.add(item.bidNumber);
              unique.push(item);
            }
          }

          return unique;
        });

        logger.info(`[GeMAdapter] Found ${bidsOnPage.length} bids on Page ${currentPageNum}`);

        if (bidsOnPage.length === 0) {
          logger.warn('[GeMAdapter] No bids detected on this page.');
          break;
        }

        // Process each bid on the page SEQUENTIALLY with the polite rate-limiting gap
        for (const rawBid of bidsOnPage) {
          if (totalSaved >= limit) break;

          rawBid.state = canonicalState;
          logger.info(`[GeMAdapter] (${totalSaved + 1}/${limit}) Processing ${rawBid.bidNumber} [${canonicalState}]...`);

          // Check if bid is already saved in MongoDB with completed PDF specs
          const existingTender = await Tender.findOne({ 
            sourcePortal: 'GEM', 
            sourceTenderId: rawBid.bidNumber,
            pdfFetchStatus: 'COMPLETED'
          }).lean();

          if (existingTender) {
            if (!existingTender.state) {
              await Tender.updateOne({ _id: existingTender._id }, { $set: { state: canonicalState } });
            }
            logger.info(`[GeMAdapter] Bid ${rawBid.bidNumber} (${existingTender.state || canonicalState}) already exists in database. Skipping redundant download.`);
            totalSaved++;
            continue;
          }

          let pdfData = {};

          // Download and parse PDF with polite rate limiting
          if (rawBid.pdfUrl) {
            try {
              // Rate limiting gap between PDF requests (prevents IP blocks)
              await this.sleep(requestDelay);

              const response = await context.request.get(rawBid.pdfUrl, {
                headers: {
                  'Referer': this.advanceSearchUrl,
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 25000
              });

              if (response.ok()) {
                const pdfBuffer = await response.body();
                const rawPdfText = await extractTextFromPdfBuffer(pdfBuffer);
                if (rawPdfText) {
                  pdfData = parseGeMBidPdfText(rawPdfText);
                  logger.info(`[GeMAdapter] Successfully parsed PDF for ${rawBid.bidNumber} (EMD: ₹${pdfData.emdAmount || 0}, Delivery: ${pdfData.deliveryLocations?.join(', ') || 'J&K'})`);
                }
              }
            } catch (pdfErr) {
              logger.warn(`[GeMAdapter] PDF download/parse note for ${rawBid.bidNumber}: ${pdfErr.message}`);
            }
          }

          // Merge card metadata with PDF extracted metadata
          rawBid.pdfData = pdfData;
          const normalized = this.normalize(rawBid);

          // Upsert to MongoDB
          await Tender.findOneAndUpdate(
            { sourcePortal: 'GEM', sourceTenderId: normalized.sourceTenderId },
            { $set: normalized },
            { upsert: true, returnDocument: 'after' }
          );

          totalSaved++;
        }

        // Pagination: Navigate to next page (supports all 200 pages)
        if (currentPageNum < maxPages && totalSaved < limit) {
          logger.info(`[GeMAdapter] Attempting navigation to Page ${currentPageNum + 1} of ${maxPages}...`);
          
          let nextClicked = await page.evaluate((targetPage) => {
            const links = Array.from(document.querySelectorAll('.pagination a, ul.pagination li a, a.page-link, a'));
            // 1. First priority: Link with exact text "Next" or ">" or "»"
            let target = links.find(l => {
              const txt = (l.innerText || l.textContent || '').trim();
              return (txt === 'Next' || txt === '>' || txt === '»') && !l.closest('.disabled');
            });
            // 2. Second priority: Numerical link matching targetPage
            if (!target) {
              target = links.find(l => (l.innerText || l.textContent || '').trim() === String(targetPage));
            }
            if (target) {
              target.click();
              return true;
            }
            return false;
          }, currentPageNum + 1);

          if (!nextClicked) {
            const nextLocator = page.locator('a:has-text("Next"), li.next:not(.disabled) a, a:has-text(">")').first();
            if (await nextLocator.count() > 0 && await nextLocator.isVisible()) {
              await nextLocator.click().catch(() => {});
              nextClicked = true;
            }
          }

          if (nextClicked) {
            logger.info(`[GeMAdapter] Page ${currentPageNum + 1} clicked. Waiting for cards to render...`);
            await this.sleep(3500);
            currentPageNum++;
          } else {
            logger.info(`[GeMAdapter] No further pagination controls detected on Page ${currentPageNum}. Finished.`);
            break;
          }
        } else {
          break;
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
