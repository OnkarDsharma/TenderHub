/**
 * @file backend/src/routes/gem.routes.js
 * @description Dedicated API endpoints for Government e-Marketplace (GeM) Jammu & Kashmir bids.
 */

import express from 'express';
import Tender from '../models/Tender.js';
import { gemAdapter } from '../services/adapters/GeMAdapter.js';

const router = express.Router();

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
      status = 'active'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Base filter: only GeM bids
    const query = { sourcePortal: 'GEM' };

    // Regional State Filter (Jammu & Kashmir, Himachal Pradesh, Punjab, Ladakh)
    if (state && typeof state === 'string' && state.trim() && state.toUpperCase() !== 'ALL') {
      const cleanState = state.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.state = { $regex: `^${cleanState}$`, $options: 'i' };
    }

    // Status filter
    const now = new Date();
    if (status === 'active') {
      query.status = 'ACTIVE';
      query.closingDate = { $gte: now };
    } else if (status === 'archived' || status === 'expired') {
      query.closingDate = { $lt: now };
    }

    // Search keyword
    if (search && typeof search === 'string' && search.trim()) {
      const cleanSearch = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: cleanSearch, $options: 'i' } },
        { sourceTenderId: { $regex: cleanSearch, $options: 'i' } },
        { tenderReferenceNumber: { $regex: cleanSearch, $options: 'i' } },
        { departmentName: { $regex: cleanSearch, $options: 'i' } },
        { organisationChain: { $regex: cleanSearch, $options: 'i' } },
        { location: { $regex: cleanSearch, $options: 'i' } },
        { workDescription: { $regex: cleanSearch, $options: 'i' } }
      ];
    }

    // Location / District filter
    if (location && typeof location === 'string' && location.trim()) {
      const cleanLoc = location.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.location = { $regex: cleanLoc, $options: 'i' };
    }

    // Department filter
    if (department && typeof department === 'string' && department.trim()) {
      const cleanDept = department.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { departmentName: { $regex: cleanDept, $options: 'i' } },
        { organisationChain: { $regex: cleanDept, $options: 'i' } }
      ];
    }

    // Closing days filter (e.g., closing in 2 days, 7 days)
    if (closingDays !== undefined) {
      const days = parseInt(String(closingDays), 10);
      if (!Number.isNaN(days) && days >= 0 && days <= 365) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        query.closingDate = { $gte: now, $lte: targetDate };
      }
    }

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
    const { state } = req.query;

    const baseFilter = { sourcePortal: 'GEM' };
    if (state && typeof state === 'string' && state.trim() && state.toUpperCase() !== 'ALL') {
      baseFilter.state = { $regex: `^${state.trim()}$`, $options: 'i' };
    }

    const [totalActive, closingSoon, highEmdCount] = await Promise.all([
      Tender.countDocuments({ ...baseFilter, status: 'ACTIVE', closingDate: { $gte: now } }),
      Tender.countDocuments({ ...baseFilter, status: 'ACTIVE', closingDate: { $gte: now, $lte: in48h } }),
      Tender.countDocuments({ ...baseFilter, status: 'ACTIVE', emdAmount: { $gt: 5000000 } })
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalActive,
        closingSoon,
        highEmdCount,
        verifiedState: state || 'Northern Region (J&K, HP, Punjab)',
        portal: 'Government e-Marketplace (GeM)'
      }
    });
  } catch (err) {
    next(err);
  }
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

import { adminAuth } from '../middleware/adminAuth.middleware.js';

/**
 * @route POST /api/v1/gem/sync
 * @desc On-demand trigger to execute GeM regional crawl (Admin restricted)
 */
router.post('/sync', adminAuth, async (req, res, next) => {
  try {
    const { 
      limit = 20, 
      maxPages = 2, 
      delay = 1200, 
      state = 'JAMMU & KASHMIR' 
    } = req.body || {};

    const safeLimit = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 20));
    const safeMaxPages = Math.min(5, Math.max(1, parseInt(String(maxPages), 10) || 2));
    const safeDelay = Math.max(1000, parseInt(String(delay), 10) || 1200);
    const safeState = typeof state === 'string' && state.trim() ? state.trim().slice(0, 50) : 'JAMMU & KASHMIR';

    // Run crawl in background with regional state filter
    gemAdapter.fetchList(1, { limit: safeLimit, maxPages: safeMaxPages, delay: safeDelay, state: safeState })
      .catch((err) => console.error(`[GeM Async Sync Error - ${safeState}]`, err.message));

    res.status(200).json({
      success: true,
      message: `GeM crawl started in background for ${safeState} with rate limiting gap.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
