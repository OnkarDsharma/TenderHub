/**
 * @file backend/src/routes/gem.routes.js
 * @description API endpoints for Government e-Marketplace (GeM) bids delivered
 * to Jammu & Kashmir, Ladakh, Himachal Pradesh and Punjab.
 *
 * Geography is `consigneeStates`: the states whose official GeM consignee
 * search lists the bid. Records without it (out-of-region, or from the old
 * keyword crawler and not yet re-listed) are never returned.
 */

import express from 'express';
import axios from 'axios';
import Tender from '../models/Tender.js';
import { gemAdapter, GEM_REGION_STATES, canonicalRegionState } from '../services/adapters/GeMAdapter.js';
import GeMDataReport from '../models/GeMDataReport.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const dataReportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many data reports. Try again later.' } });
// Listing passes run several times a day; 26h tolerates one missed run
// (including the overnight gap) before a bid stops counting as confirmed.
export const GEM_FRESHNESS_HOURS = 26;
export const PDF_STATUS_FILTERS = {
  parsed: { pdfParseStatus: 'COMPLETED' },
  pending: { pdfParseStatus: { $in: ['PENDING', null] }, pdfFetchStatus: { $ne: 'FAILED' } },
  failed: { $or: [{ pdfFetchStatus: 'FAILED' }, { pdfParseStatus: 'FAILED' }] },
};

/** Active = in GeM's current consignee list recently and not past closing. */
export const confirmedActiveFilter = (now = new Date()) => ({
  gemStatus: 'ACTIVE',
  closingDate: { $gte: now },
  lastSeenInListingAt: { $gte: new Date(now.getTime() - GEM_FRESHNESS_HOURS * 3600000) },
});

/** Region, state, document-status and status conditions shared by list and stats. */
export function buildGeMScopeConditions({ state, pdfStatus, status = 'active' } = {}, now = new Date()) {
  const conditions = [{ sourcePortal: 'GEM' }];
  const canonical = state && String(state).toUpperCase() !== 'ALL' ? canonicalRegionState(state) : null;
  if (state && String(state).toUpperCase() !== 'ALL' && !canonical) {
    conditions.push({ _id: null }); // unknown state: match nothing rather than everything
  } else {
    conditions.push({ consigneeStates: canonical || { $in: GEM_REGION_STATES } });
  }
  if (pdfStatus && PDF_STATUS_FILTERS[pdfStatus]) conditions.push(PDF_STATUS_FILTERS[pdfStatus]);
  if (status === 'active') conditions.push(confirmedActiveFilter(now));
  else if (status === 'archived' || status === 'expired') conditions.push({ $or: [{ closingDate: { $lt: now } }, { gemStatus: 'NOT_LISTED' }] });
  return conditions;
}

/**
 * @route GET /api/v1/gem/tenders
 * @desc Get paginated list of GeM bids with filtering and search
 */
router.get('/tenders', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      location,
      state,
      department,
      closingDays,
      sortBy = 'arrival',
      status = 'active',
      procurementType,
      tenderCategory,
      contractType,
      tenderAmountRange,
      minAmount,
      maxAmount,
      feePreference,
      publishedRange,
      publishedFrom,
      publishedTo,
      hasPreBid,
      tendererClass,
      withdrawalAllowed,
      twoStageBidding,
      preferentialBidder,
      pdfStatus,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Helper to safely escape regex special characters
    const escapeRegex = (str) => {
      if (typeof str !== 'string') return '';
      return str.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Base conditions (combined with $and to prevent $or collisions):
    // delivery-state scope, document status and listing status.
    const now = new Date();
    const conditions = buildGeMScopeConditions({
      state: typeof state === 'string' ? state.trim() : undefined,
      pdfStatus: typeof pdfStatus === 'string' ? pdfStatus : undefined,
      status,
    }, now);

    // Search keyword
    if (search && typeof search === 'string' && search.trim()) {
      const cleanSearch = escapeRegex(search);
      conditions.push({
        $or: [
          { title: { $regex: cleanSearch, $options: 'i' } },
          { sourceTenderId: { $regex: cleanSearch, $options: 'i' } },
          { tenderReferenceNumber: { $regex: cleanSearch, $options: 'i' } },
          { departmentName: { $regex: cleanSearch, $options: 'i' } },
          { organisationChain: { $regex: cleanSearch, $options: 'i' } },
          { location: { $regex: cleanSearch, $options: 'i' } },
          { workDescription: { $regex: cleanSearch, $options: 'i' } }
        ]
      });
    }

    // Location / District filter
    if (location && typeof location === 'string' && location.trim()) {
      const cleanLoc = escapeRegex(location);
      conditions.push({ location: { $regex: cleanLoc, $options: 'i' } });
    }

    // Department filter
    if (department && typeof department === 'string' && department.trim()) {
      const cleanDept = escapeRegex(department);
      conditions.push({
        $or: [
          { departmentName: { $regex: cleanDept, $options: 'i' } },
          { organisationChain: { $regex: cleanDept, $options: 'i' } }
        ]
      });
    }

    // Closing days filter (e.g., closing in 2 days, 7 days)
    if (closingDays !== undefined) {
      const days = parseInt(String(closingDays), 10);
      if (!Number.isNaN(days) && days >= 0 && days <= 365) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        conditions.push({ closingDate: { $gte: now, $lte: targetDate } });
      }
    }

    // Published Date Filter (Today, Last 7 Days, Last 1 Month, or Pick Date range)
    if (publishedRange) {
      const nowTime = new Date();
      if (publishedRange === 'today') {
        const startOfToday = new Date(nowTime);
        startOfToday.setHours(0, 0, 0, 0);
        conditions.push({ publishedDate: { $gte: startOfToday } });
      } else if (publishedRange === '7days') {
        const d = new Date(nowTime);
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        conditions.push({ publishedDate: { $gte: d } });
      } else if (publishedRange === '1month') {
        const d = new Date(nowTime);
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        conditions.push({ publishedDate: { $gte: d } });
      }
    }
    if (publishedFrom || publishedTo) {
      const dateCond = {};
      if (publishedFrom) {
        const fromDate = new Date(publishedFrom);
        if (!isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          dateCond.$gte = fromDate;
        }
      }
      if (publishedTo) {
        const toDate = new Date(publishedTo);
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          dateCond.$lte = toDate;
        }
      }
      if (Object.keys(dateCond).length > 0) {
        conditions.push({ publishedDate: dateCond });
      }
    }

    // Procurement Type
    const activeProcurementType = procurementType || tenderCategory;
    if (activeProcurementType && typeof activeProcurementType === 'string' && activeProcurementType.trim() && activeProcurementType.toUpperCase() !== 'ALL') {
      const escType = escapeRegex(activeProcurementType);
      conditions.push({
        $or: [
          { tenderCategory: { $regex: escType, $options: 'i' } },
          { tenderType: { $regex: escType, $options: 'i' } },
          { contractType: { $regex: escType, $options: 'i' } }
        ]
      });
    }

    // Tender Amount (Estimated Value Brackets or Custom Range)
    if (tenderAmountRange && typeof tenderAmountRange === 'string' && tenderAmountRange !== 'any' && tenderAmountRange !== 'ANY') {
      if (tenderAmountRange === 'under_5l') {
        conditions.push({ estimatedValue: { $gt: 0, $lte: 500000 } });
      } else if (tenderAmountRange === '5l_25l') {
        conditions.push({ estimatedValue: { $gte: 500000, $lte: 2500000 } });
      } else if (tenderAmountRange === '25l_1cr') {
        conditions.push({ estimatedValue: { $gte: 2500000, $lte: 10000000 } });
      } else if (tenderAmountRange === '1cr_5cr') {
        conditions.push({ estimatedValue: { $gte: 10000000, $lte: 50000000 } });
      } else if (tenderAmountRange === 'above_5cr') {
        conditions.push({ estimatedValue: { $gte: 50000000 } });
      }
    }
    if (minAmount || maxAmount) {
      const amtCond = {};
      const numMin = Number(minAmount);
      const numMax = Number(maxAmount);
      if (!isNaN(numMin) && numMin > 0) amtCond.$gte = numMin;
      if (!isNaN(numMax) && numMax > 0) amtCond.$lte = numMax;
      if (Object.keys(amtCond).length > 0) {
        conditions.push({ estimatedValue: amtCond });
      }
    }

    // Fee Preferences
    if (feePreference && typeof feePreference === 'string' && feePreference !== 'any' && feePreference !== 'ANY') {
      if (feePreference === 'freeFee') {
        conditions.push({
          $or: [
            { tenderFee: 0 },
            { tenderFee: null },
            { tenderFee: { $exists: false } }
          ]
        });
      } else if (feePreference === 'feeExempted') {
        conditions.push({ tenderFeeExemptionAllowed: { $regex: /^yes/i } });
      } else if (feePreference === 'freeEmd') {
        conditions.push({
          $or: [
            { emdAmount: 0 },
            { emdAmount: null },
            { emdAmount: { $exists: false } }
          ]
        });
      } else if (feePreference === 'emdExempted') {
        conditions.push({ emdExemptionAllowed: { $regex: /^yes/i } });
      } else if (feePreference === 'bothFree') {
        conditions.push({
          $or: [
            { tenderFee: 0 },
            { tenderFee: null },
            { tenderFee: { $exists: false } },
            { tenderFeeExemptionAllowed: { $regex: /^yes/i } }
          ]
        });
        conditions.push({
          $or: [
            { emdAmount: 0 },
            { emdAmount: null },
            { emdAmount: { $exists: false } },
            { emdExemptionAllowed: { $regex: /^yes/i } }
          ]
        });
      }
    }

    // Advanced Filters
    if (hasPreBid === 'true' || hasPreBid === true) {
      conditions.push({
        $or: [
          { preBidMeetingDate: { $ne: null } },
          { preBidMeetingPlace: { $exists: true, $nin: ['', null, 'NA', 'N/A', 'Nil', 'nil', '-'] } }
        ]
      });
    }
    if (withdrawalAllowed === 'true' || withdrawalAllowed === true) {
      conditions.push({ withdrawalAllowed: { $regex: /^yes/i } });
    }
    if (twoStageBidding === 'true' || twoStageBidding === true) {
      conditions.push({ allowTwoStageBidding: { $regex: /^yes/i } });
    }
    if (preferentialBidder === 'true' || preferentialBidder === true) {
      conditions.push({ allowPreferentialBidder: { $regex: /^yes/i } });
    }
    if (tendererClass && typeof tendererClass === 'string' && tendererClass.trim() && tendererClass.toUpperCase() !== 'ANY') {
      conditions.push({ tendererClass: { $regex: escapeRegex(tendererClass), $options: 'i' } });
    }

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    // Sorting
    let sortOptions = { publishedDate: -1, createdAt: -1 };
    if (sortBy === 'closingAsc') {
      sortOptions = { closingDate: 1 };
    } else if (sortBy === 'closingDesc') {
      sortOptions = { closingDate: -1 };
    } else if (sortBy === 'emdDesc') {
      sortOptions = { emdAmount: -1 };
    } else if (sortBy === 'valueDesc') {
      sortOptions = { estimatedValue: -1 };
    } else {
      // Default / 'arrival' / 'recently published'
      sortOptions = { publishedDate: -1, createdAt: -1, _id: -1 };
    }

    const [tenders, totalCount] = await Promise.all([
      Tender.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Tender.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: tenders,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
        totalCount,
        limit: limitNum,
        hasMore: skip + tenders.length < totalCount
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/v1/gem/stats
 * @desc Get key summary statistics for GeM J&K bids
 */
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const { state, pdfStatus } = req.query;
    const active = buildGeMScopeConditions({
      state: typeof state === 'string' ? state.trim() : undefined,
      pdfStatus: typeof pdfStatus === 'string' ? pdfStatus : undefined,
      status: 'active',
    }, now);

    const [totalActive, closingSoon, highEmdCount, lastListing] = await Promise.all([
      Tender.countDocuments({ $and: active }),
      Tender.countDocuments({ $and: [...active, { closingDate: { $gte: now, $lte: in48h } }] }),
      Tender.countDocuments({ $and: [...active, { emdAmount: { $gt: 5000000 } }] }),
      Tender.findOne({ sourcePortal: 'GEM', consigneeStates: { $in: GEM_REGION_STATES } }).sort({ lastSeenInListingAt: -1 }).select('lastSeenInListingAt').lean(),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalActive,
        closingSoon,
        highEmdCount,
        deliveryState: canonicalRegionState(state) || 'All northern states',
        documentStatus: pdfStatus || 'all',
        lastListingCheckAt: lastListing?.lastSeenInListingAt || null,
        portal: 'Government e-Marketplace (GeM)'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/tenders/:id/report', dataReportLimiter, async (req, res, next) => {
  try {
    const { field, displayedValue = '', note = '' } = req.body || {};
    const allowed = ['officialState', 'location', 'departmentName', 'title', 'closingDate', 'status', 'other'];
    if (!allowed.includes(field) || typeof displayedValue !== 'string' || typeof note !== 'string' || displayedValue.length > 500 || note.length > 1000 || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(note) || /(?:\+?\d[\d\s().-]{8,}\d)/.test(note)) {
      return res.status(400).json({ success: false, error: 'Invalid report fields' });
    }
    const tender = await Tender.findOne({ sourcePortal: 'GEM', $or: [{ sourceTenderId: req.params.id }, { _id: /^[0-9a-fA-F]{24}$/.test(req.params.id) ? req.params.id : null }] }).select('sourceTenderId').lean();
    if (!tender) return res.status(404).json({ success: false, error: 'GeM bid not found' });
    await GeMDataReport.create({ sourceTenderId: tender.sourceTenderId, field, displayedValue, note });
    return res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

/**
 * @route GET /api/v1/gem/tenders/:id
 * @desc Get single GeM tender by ID or sourceTenderId
 */
router.get('/tenders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tender = await Tender.findOne({
      sourcePortal: 'GEM',
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { sourceTenderId: id },
        { tenderReferenceNumber: id }
      ].filter(Boolean)
    }).lean();

    if (!tender) {
      return res.status(404).json({ success: false, error: 'GeM bid not found' });
    }

    res.status(200).json({
      success: true,
      data: tender
    });
  } catch (err) {
    next(err);
  }
});

// Cache GeM portal session cookies in memory to avoid repetitive handshakes
let cachedCookies = null;
let cookiesFetchedAt = 0;

async function getGeMSessionCookies() {
  const now = Date.now();
  if (cachedCookies && (now - cookiesFetchedAt < 10 * 60 * 1000)) {
    return cachedCookies;
  }
  try {
    const res = await axios.get('https://bidplus.gem.gov.in/all-bids', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });
    const setCookies = res.headers['set-cookie'] || [];
    const cookieStr = setCookies.map((c) => c.split(';')[0]).join('; ');
    if (cookieStr) {
      cachedCookies = cookieStr;
      cookiesFetchedAt = now;
    }
    return cookieStr;
  } catch (err) {
    console.warn('[GeM PDF Proxy] Session cookie refresh warning:', err.message);
    return cachedCookies || '';
  }
}

async function fetchGeMPdfBuffer(targetUrl) {
  let cookies = await getGeMSessionCookies();
  let response = await axios.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://bidplus.gem.gov.in/all-bids',
      'Cookie': cookies,
      'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    maxRedirects: 0,
    validateStatus: null,
    responseType: 'arraybuffer',
    timeout: 30000
  });

  // If 302 or HTML returned, session may have expired; refresh cookies once and retry
  if (response.status === 302 || response.headers['content-type']?.includes('text/html')) {
    cachedCookies = null;
    cookies = await getGeMSessionCookies();
    response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://bidplus.gem.gov.in/all-bids',
        'Cookie': cookies,
        'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 0,
      validateStatus: null,
      responseType: 'arraybuffer',
      timeout: 30000
    });
  }

  if (response.status === 200 && response.data && response.data.length > 0) {
    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'application/pdf',
      length: response.data.length
    };
  }

  throw new Error(`GeM server returned status ${response.status}`);
}

/**
 * @route GET /api/v1/gem/tenders/:id/pdf
 * @desc Stream/download official GeM PDF directly to user's device
 */
router.get('/tenders/:id/pdf', async (req, res, next) => {
  try {
    const { id } = req.params;
    const explicitUrl = req.query.url;

    let tender = null;
    if (id) {
      tender = await Tender.findOne({
        sourcePortal: 'GEM',
        $or: [
          { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
          { sourceTenderId: id },
          { tenderReferenceNumber: id }
        ].filter(Boolean)
      }).lean();
    }

    let targetUrl = explicitUrl || tender?.pdfUrls?.[0] || tender?.detailsUrl;
    if (!targetUrl && id) {
      const cleanNum = id.replace(/^GEM\/\d+\/[A-Z]\//i, '').replace(/[^0-9]/g, '');
      if (cleanNum) {
        targetUrl = `https://bidplus.gem.gov.in/showbidDocument/${cleanNum}`;
      }
    }

    if (!targetUrl) {
      return res.status(404).json({ success: false, error: 'GeM PDF document URL not found' });
    }

    const bidIdForName = (tender?.sourceTenderId || id || 'GeM_Bid')
      .replace(/[\/\\?%*:|"<>]/g, '_');
    const safeFilename = `${bidIdForName}_Bid_Document.pdf`;

    try {
      const pdf = await fetchGeMPdfBuffer(targetUrl);
      const isInline = req.query.inline === '1' || req.query.view === '1';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${safeFilename}"`
      );
      res.setHeader('Content-Length', pdf.length);
      return res.send(pdf.buffer);
    } catch (fetchErr) {
      console.warn(`[GeM PDF Proxy] Direct stream failed for ${targetUrl}:`, fetchErr.message);
      return res.redirect(targetUrl);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/v1/gem/pdf
 * @desc Generic GeM PDF proxy by URL parameter
 */
router.get('/pdf', async (req, res, next) => {
  try {
    const { url, bidNumber } = req.query;
    if (!url || typeof url !== 'string' || !url.startsWith('https://bidplus.gem.gov.in/')) {
      return res.status(400).json({ success: false, error: 'Invalid or missing GeM document URL' });
    }

    const cleanBid = (bidNumber || 'GeM_Bid').replace(/[\/\\?%*:|"<>]/g, '_');
    const safeFilename = `${cleanBid}_Bid_Document.pdf`;

    try {
      const pdf = await fetchGeMPdfBuffer(url);
      const isInline = req.query.inline === '1' || req.query.view === '1';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${safeFilename}"`
      );
      res.setHeader('Content-Length', pdf.length);
      return res.send(pdf.buffer);
    } catch (fetchErr) {
      console.warn(`[GeM PDF Proxy] Direct stream failed for ${url}:`, fetchErr.message);
      return res.redirect(url);
    }
  } catch (err) {
    next(err);
  }
});

import { adminAuth } from '../middleware/adminAuth.middleware.js';

/**
 * @route POST /api/v1/gem/sync
 * @desc On-demand trigger to execute GeM regional crawl (Admin restricted)
 */
router.post('/sync', adminAuth, async (req, res, next) => {
  try {
    const { pdfLimit = 50, delay = 1200, state = 'ALL' } = req.body || {};
    const safeState = state === 'ALL' ? 'ALL' : canonicalRegionState(state);
    if (!safeState) {
      return res.status(400).json({ success: false, error: `state must be ALL or one of: ${GEM_REGION_STATES.join(', ')}` });
    }
    const safePdfLimit = Math.min(300, Math.max(0, parseInt(String(pdfLimit), 10) || 0));
    const safeDelay = Math.max(1000, parseInt(String(delay), 10) || 1200);

    // Runs in the background: listing pass for the state(s), then up to pdfLimit PDFs.
    gemAdapter.syncConsigneeStates({ states: safeState, pdfLimit: safePdfLimit, delay: safeDelay })
      .catch((err) => console.error(`[GeM Async Sync Error - ${safeState}]`, err.message));

    res.status(200).json({
      success: true,
      message: `GeM consignee-state sync started in background for ${safeState} (PDF limit ${safePdfLimit}).`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
