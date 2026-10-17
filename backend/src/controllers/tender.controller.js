/**
 * @file backend/src/controllers/tender.controller.js
 * @description Handles all business logic for Tender retrieval, filtering, AI analysis queuing, and dashboard statistics.
 */

import mongoose from 'mongoose';
import { Readable } from 'stream';
import Tender from '../models/Tender.js';
import User from '../models/User.js';
import Subscription from '../modules/billing/models/Subscription.js';
import { aiQueue } from '../workers/queue.js';

/**
 * Helper to get current date formatted as YYYY-MM-DD in Asia/Kolkata (IST)
 */
const getTodayISTString = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

/**
 * Fetch a paginated list of tenders from the database with advanced filtering.
 * Maps incoming query parameters (search, organisation, department, location, closingDays) 
 * directly to the MongoDB schema.
 * 
 * @route GET /api/v1/tenders
 * @param {Object} req.query - URL query parameters passed from the frontend
 */
export const getTenders = async (req, res, next) => {
  try {
    // 1. Extract query parameters with defaults for pagination, status, and sorting
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category,
      tenderCategory,
      contractType,
      organisation, 
      department, 
      location, 
      state,
      closingDays,
      status = 'active', // 'active' | 'archived' | 'all'
      sortBy = 'arrival' // 'arrival' | 'closingAsc' | 'closingDesc' | 'valueDesc' | 'valueAsc'
    } = req.query;
    
    // Helper to safely escape regex special characters and prevent ReDoS / injection
    const escapeRegex = (str) => {
      if (typeof str !== 'string') return '';
      return str.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // 2. Build array of base filter conditions (Category, Search, Department, Location)
    const baseConditions = [];

    // Regional State Filter (Jammu & Kashmir, Himachal Pradesh, Punjab, Ladakh)
    if (state && typeof state === 'string' && state.trim() && state.toUpperCase() !== 'ALL') {
      baseConditions.push({ state: { $regex: `^${escapeRegex(state)}$`, $options: 'i' } });
    }

    // Dedicated Separation: Browse Tenders displays standard public procurement notices, excluding GeM (which has its own dedicated /gem-tenders portal)
    if (req.query.portal) {
      baseConditions.push({ sourcePortal: req.query.portal });
    } else {
      baseConditions.push({ sourcePortal: { $ne: 'GEM' } });
    }

    // Specific Category Filter (Matches productCategory or tenderCategory)
    if (category && typeof category === 'string' && category.trim()) {
      const escapedCategory = escapeRegex(category);
      baseConditions.push({
        $or: [
          { productCategory: { $regex: escapedCategory, $options: 'i' } },
          { tenderCategory: { $regex: escapedCategory, $options: 'i' } }
        ]
      });
    }

    // Tender Category (Nature of Procurement: Works, Goods, Services)
    if (tenderCategory && typeof tenderCategory === 'string' && tenderCategory.trim()) {
      baseConditions.push({ tenderCategory: { $regex: `^${escapeRegex(tenderCategory)}$`, $options: 'i' } });
    }

    // Contract Type (Tender, Rate Contract, Empanelment)
    if (contractType && typeof contractType === 'string' && contractType.trim()) {
      baseConditions.push({ contractType: { $regex: escapeRegex(contractType), $options: 'i' } });
    }

    // Advanced Search Filter (Matches Title, Description, Tender IDs, Product & Tender Categories)
    if (search) {
      const escapedSearch = escapeRegex(search);
      baseConditions.push({
        $or: [
          { title: { $regex: escapedSearch, $options: 'i' } },
          { workDescription: { $regex: escapedSearch, $options: 'i' } },
          { tenderReferenceNumber: { $regex: escapedSearch, $options: 'i' } },
          { sourceTenderId: { $regex: escapedSearch, $options: 'i' } },
          { organisationChain: { $regex: escapedSearch, $options: 'i' } },
          { departmentName: { $regex: escapedSearch, $options: 'i' } },
          { location: { $regex: escapedSearch, $options: 'i' } },
          { productCategory: { $regex: escapedSearch, $options: 'i' } },
          { tenderCategory: { $regex: escapedSearch, $options: 'i' } }
        ]
      });
    }

    // Organisation & Department Filter
    if (organisation) {
      const escapedOrg = escapeRegex(organisation);
      baseConditions.push({
        $or: [
          { organisationChain: { $regex: escapedOrg, $options: 'i' } },
          { departmentName: { $regex: escapedOrg, $options: 'i' } }
        ]
      });
    }
    if (department) {
      baseConditions.push({ organisationChain: { $regex: escapeRegex(department), $options: 'i' } });
    }

    // Location Filter
    if (location) {
      const escapedLoc = escapeRegex(location);
      baseConditions.push({
        $or: [
          { location: { $regex: escapedLoc, $options: 'i' } },
          { title: { $regex: escapedLoc, $options: 'i' } },
          { organisationChain: { $regex: escapedLoc, $options: 'i' } }
        ]
      });
    }

    const now = new Date();

    const activeFilter = {
      status: 'ACTIVE',
      isDelisted: { $ne: true },
      closingDate: { $gte: now },
      $or: [
        { bidSubmissionEndDate: { $exists: false } },
        { bidSubmissionEndDate: null },
        { bidSubmissionEndDate: { $gte: now } }
      ]
    };

    const archivedFilterConditions = [
      {
        status: 'ARCHIVED',
        isDelisted: { $ne: true }
      },
      {
        isDelisted: { $ne: true },
        closingDate: { $lt: now },
        $or: [
          { bidSubmissionEndDate: { $gte: now } },
          { bidOpeningDate: { $gte: now } }
        ]
      }
    ];

    const expiredFilterConditions = [
      {
        $or: [
          { status: 'EXPIRED' },
          {
            closingDate: { $lt: now },
            $or: [
              { bidOpeningDate: { $exists: false } },
              { bidOpeningDate: null },
              { bidOpeningDate: { $lt: now } }
            ]
          }
        ]
      }
    ];

    // Compute live counts for all 3 tabs (Active, Archived, Expired)
    const activeCount = await Tender.countDocuments(
      baseConditions.length > 0 ? { $and: [...baseConditions, activeFilter] } : activeFilter
    );
    const archivedCount = await Tender.countDocuments(
      baseConditions.length > 0 
        ? { $and: [...baseConditions, { $or: archivedFilterConditions }] } 
        : { $or: archivedFilterConditions }
    );
    const expiredCount = await Tender.countDocuments(
      baseConditions.length > 0 
        ? { $and: [...baseConditions, { $or: expiredFilterConditions }] } 
        : { $or: expiredFilterConditions }
    );

    // 5. Build final query with status and closing date criteria
    const queryConditions = [...baseConditions];

    if (status === 'archived') {
      // Archived tenders: download closed but bid submission in future, or bid opening in future
      queryConditions.push({ $or: archivedFilterConditions });
    } else if (status === 'expired') {
      // Expired tenders: bid submission deadline passed AND bid opening concluded
      queryConditions.push({ $or: expiredFilterConditions });
    } else if (status === 'cancelled') {
      queryConditions.push({
        $or: [
          { status: 'CANCELLED' },
          { isDelisted: true }
        ]
      });
    } else if (status === 'all') {
      // No automatic closingDate restriction
      if (closingDays) {
        const days = parseInt(closingDays, 10);
        if (!isNaN(days)) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + days);
          queryConditions.push({ closingDate: { $gte: now, $lte: targetDate } });
        }
      }
    } else {
      // Default: 'active' (latest tenders currently open for bidding)
      queryConditions.push(activeFilter);
      if (closingDays) {
        const days = parseInt(closingDays, 10);
        if (!isNaN(days)) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + days);
          queryConditions.push({ closingDate: { $gte: now, $lte: targetDate } });
        }
      }
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

    // 6. Sort Configuration: Default to Most Recent Published Date First
    let sortConfig = { publishedDate: -1, createdAt: -1, _id: -1 };
    if (sortBy === 'closingAsc') {
      sortConfig = { closingDate: 1, publishedDate: -1 };
    } else if (sortBy === 'closingDesc') {
      sortConfig = { closingDate: -1, publishedDate: -1 };
    } else if (sortBy === 'valueDesc') {
      sortConfig = { estimatedValue: -1, publishedDate: -1 };
    } else if (sortBy === 'valueAsc') {
      sortConfig = { estimatedValue: 1, publishedDate: -1 };
    } else if (sortBy === 'publishedAsc') {
      sortConfig = { publishedDate: 1, createdAt: 1, _id: 1 };
    } else {
      // Default: 'arrival', 'publishedDesc', 'latest', or undefined -> Newest Published First
      sortConfig = { publishedDate: -1, createdAt: -1, _id: -1 };
    }

    // 7. Enforce Authentication-Aware Limits & Data Minimization Projection
    const isGuest = !req.user || !req.user.userId;
    const safePage = Math.max(1, parseInt(page, 10) || 1);

    // Hard ceiling for unauthenticated visitors: max 2 pages to prevent automated deep scraping
    if (isGuest && safePage > 2) {
      return res.status(401).json({
        error: 'Guest preview limit reached. Sign in to browse the complete directory and access documents.',
        code: 'GUEST_PAGE_LIMIT',
        requireLogin: true,
      });
    }

    const maxAllowedLimit = isGuest ? 15 : 50;
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), maxAllowedLimit);

    // Strictly project only public listing metadata. 
    // Strips out: boqZipUrl, boqFileUrl, nitDocuments, workItemDocuments, pdfUrls, workDescription, r2StorageKey
    const PUBLIC_SUMMARY_PROJECTION = [
      'title',
      'sourceTenderId',
      'departmentCode',
      'departmentName',
      'organisationChain',
      'closingDate',
      'closingDateStr',
      'closingTime',
      'publishedDate',
      'publishedDateStr',
      'publishedTime',
      'bidOpeningDate',
      'bidOpeningDateStr',
      'bidOpeningTime',
      'bidSubmissionEndDate',
      'bidSubmissionEndDateStr',
      'bidSubmissionEndTime',
      'estimatedValue',
      'location',
      'pincode',
      'tenderCategory',
      'productCategory',
      'contractType',
      'status',
      'isMultiTender',
      'relatedTenderIds',
      'isDocumentAvailable',
      'tenderReferenceNumber',
    ].join(' ');

    const tenders = await Tender.find(query)
      .select(PUBLIC_SUMMARY_PROJECTION)
      .sort(sortConfig)
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean();

    // Get the total count of documents matching the active query for frontend pagination controls
    const total = await Tender.countDocuments(query);

    // 8. Send Response Payload
    res.status(200).json({
      data: tenders,
      meta: { 
        total, 
        page: safePage, 
        limit: safeLimit,
        activeCount,
        archivedCount,
        expiredCount
      }
    });
  } catch (error) {
    // Pass errors to the global error handler middleware
    next(error);
  }
};

/**
 * Fetch a single tender document by its unique database ID.
 * 
 * @route GET /api/v1/tenders/:id
 * @param {string} req.params.id - The MongoDB ObjectId of the tender
 */
export const getTenderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let tender = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      tender = await Tender.findById(id).lean();
    }
    if (!tender) {
      tender = await Tender.findOne({ sourceTenderId: id }).lean();
    }
    
    // Handle case where record does not exist
    if (!tender) return res.status(404).json({ error: 'Tender not found' });

    // Authentication check
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in to view tender details.',
        requireLogin: true
      });
    }

    // Daily 5 views per user enforcement (bypassed for active Pro subscribers and Admins)
    let user = await User.findById(req.user.userId);
    const isAdmin = (user?.role === 'admin' || user?.role === 'superadmin' || req.user?.role === 'admin');
    if (!user && !isAdmin) {
      return res.status(401).json({ error: 'User account not found', requireLogin: true });
    }

    const now = new Date();
    const tenderIdentifier = tender._id.toString();

    // Check if user has an active Pro subscription in DB
    const activeSub = await Subscription.findOne({
      userId: user._id,
      status: 'active',
      currentPeriodEnd: { $gt: now },
    });
    const isPro = !!activeSub || isAdmin;

    let viewsUsed = 0;
    const viewsLimit = 5; // 5 tenders per user per 24 hours for free users
    let viewsRemaining = 5;
    let expiresAt = null;

    if (!isPro) {
      // 1. Check if the 24-hour window has expired or is uninitialized
      const currentExpiry = user.dailyTenderViews?.expiresAt ? new Date(user.dailyTenderViews.expiresAt).getTime() : 0;
      const isWindowExpired = !user.dailyTenderViews || !currentExpiry || now.getTime() >= currentExpiry;

      if (isWindowExpired) {
        // Start a fresh 24-hour allowance window
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        user.dailyTenderViews = {
          date: getTodayISTString(),
          tenderIds: [tenderIdentifier],
          windowStart: now,
          expiresAt,
        };
        user.markModified('dailyTenderViews');
        await user.save();
      } else {
        expiresAt = new Date(user.dailyTenderViews.expiresAt);
        const viewedTenderIds = user.dailyTenderViews.tenderIds || [];
        const alreadyViewedToday = viewedTenderIds.includes(tenderIdentifier) || 
                                  (tender.sourceTenderId && viewedTenderIds.includes(tender.sourceTenderId));

        if (!alreadyViewedToday) {
          if (viewedTenderIds.length >= viewsLimit) {
            const msRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
            const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
            const minutesRemaining = Math.ceil((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const resetFormatted = hoursRemaining > 0 
              ? `${hoursRemaining}h ${minutesRemaining}m` 
              : `${minutesRemaining} minutes`;

            return res.status(403).json({
              error: `Daily limit reached. You can view full details of up to 5 tenders per day. Your limit resets in ${resetFormatted}.`,
              code: 'DAILY_LIMIT_EXCEEDED',
              dailyLimitReached: true,
              viewsUsed: viewsLimit,
              viewsLimit,
              viewsRemaining: 0,
              resetsAt: expiresAt,
              resetsInMs: msRemaining,
              resetTime: resetFormatted,
            });
          }

          // Record new unique tender view
          user.dailyTenderViews.tenderIds.push(tenderIdentifier);
          
          // When the 5th tender is viewed (limit reached/expired), ensure a full 24-hour countdown from this moment
          if (user.dailyTenderViews.tenderIds.length >= viewsLimit) {
            user.dailyTenderViews.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            expiresAt = user.dailyTenderViews.expiresAt;
          }

          user.markModified('dailyTenderViews');
          await user.save();
        }
      }

      viewsUsed = user.dailyTenderViews.tenderIds.length;
      viewsRemaining = Math.max(0, viewsLimit - viewsUsed);
    } else {
      viewsUsed = 0;
      viewsRemaining = 999999;
    }
    
    // A tender has siblings ONLY IF explicitly detected during scraping on an intermediate multi-item page
    let relatedTenders = [];
    if (tender.isMultiTender && Array.isArray(tender.relatedTenderIds) && tender.relatedTenderIds.length > 0) {
      relatedTenders = await Tender.find({
        sourceTenderId: { $in: tender.relatedTenderIds }
      })
      .select('sourceTenderId title estimatedValue publishedDate publishedDateStr closingDate status')
      .sort({ sourceTenderId: 1 })
      .lean();
    }

    const isMultiTender = !!(tender.isMultiTender && relatedTenders.length > 0);

    res.status(200).json({
      ...tender,
      isMultiTender,
      relatedTenders,
      viewsInfo: {
        viewsUsed,
        viewsLimit: isPro ? 'Unlimited' : viewsLimit,
        viewsRemaining: isPro ? 'Unlimited' : viewsRemaining,
        resetsAt: isPro ? null : expiresAt,
        date: getTodayISTString()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dispatch an asynchronous background job to analyze a tender document using AI.
 * Pushes the task into a BullMQ message queue for decoupled background processing.
 * 
 * @route POST /api/v1/tenders/:id/analyze
 * @param {string} req.params.id - The ID of the tender being analyzed
 */
export const triggerAiAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // NOTE: In production, these variables should be dynamically extracted 
    // from the actual PDF file stored in an S3 bucket or equivalent.
    const mockDocumentText = "Extracted text from the tender PDF goes here...";
    const mockDocumentHash = "abc123hash"; 

    // Add the AI extraction task to the Redis worker queue
    const job = await aiQueue.add('analyze-tender', {
      tenderId: id,
      documentText: mockDocumentText,
      documentHash: mockDocumentHash
    });

    // Return a 202 Accepted status indicating the job is queued
    res.status(202).json({ message: 'AI Analysis queued successfully', jobId: job.id });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate and fetch real-time aggregated statistics for the platform dashboard.
 * Utilizes MongoDB aggregation pipelines for optimal querying performance.
 * 
 * @route GET /api/v1/tenders/stats
 */
export const getTenderStats = async (req, res, next) => {
  try {
    const now = new Date();
    const portalFilter = req.query.portal ? { sourcePortal: req.query.portal } : { sourcePortal: { $ne: 'GEM' } };
    const activeMatch = {
      ...portalFilter,
      status: 'ACTIVE',
      isDelisted: { $ne: true },
      closingDate: { $gte: now },
      $or: [
        { bidSubmissionEndDate: { $exists: false } },
        { bidSubmissionEndDate: null },
        { bidSubmissionEndDate: { $gte: now } }
      ]
    };

    // 1. Total active tenders count
    const activeTendersCount = await Tender.countDocuments(activeMatch);

    // 2. Total unique issuing authorities based on the organisationChain field for active tenders
    const authorities = await Tender.distinct('organisationChain', activeMatch);
    const authoritiesCount = authorities.length;

    // 3. Total monetary value pipeline of active tenders
    const valueAggregation = await Tender.aggregate([
      { $match: activeMatch },
      { $group: { _id: null, totalValue: { $sum: "$estimatedValue" } } } 
    ]);
    const totalValue = valueAggregation.length > 0 ? valueAggregation[0].totalValue : 0;

    // 4. Real Domain / Product category breakdown for active tenders
    const domainBreakdown = await Tender.aggregate([
      { $match: { ...activeMatch, productCategory: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$productCategory",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    // 5. Broad Categories (Works, Services, Goods) for active tenders
    const categoryBreakdown = await Tender.aggregate([
      { $match: { ...activeMatch, tenderCategory: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$tenderCategory",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // 5b. Department / Organization breakdown for active tenders
    const departmentBreakdown = await Tender.aggregate([
      { $match: { ...activeMatch, organisationChain: { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: "$organisationChain",
          count: { $sum: 1 },
          totalValue: { $sum: "$estimatedValue" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // 6. Latest 4 active tenders for real live showcase
    const latestTenders = await Tender.find(
      activeMatch,
      'title sourceTenderId tenderCategory productCategory estimatedValue organisationChain closingDate publishedDate location'
    )
      .sort({ publishedDate: -1, createdAt: -1 })
      .limit(4);

    // Send the computed metrics to the frontend stats section
    res.status(200).json({
      activeTendersCount,
      authoritiesCount,
      totalValue,
      domainBreakdown: domainBreakdown.map((d) => ({
        name: d._id,
        count: d.count,
        totalValue: d.totalValue
      })),
      categoryBreakdown: categoryBreakdown.map((c) => ({
        name: c._id,
        count: c.count,
        totalValue: c.totalValue
      })),
      departmentBreakdown: departmentBreakdown.map((d) => {
        const parts = (d._id || '').split('||').map((p) => p.trim());
        const shortName = parts[parts.length - 1] || parts[0] || 'Department';
        const rootOrg = parts[0] || '';
        return {
          fullName: d._id,
          shortName,
          rootOrg,
          count: d.count,
          totalValue: d.totalValue
        };
      }),
      latestTenders
    });
  } catch (error) {
    console.error("Error calculating tender stats:", error);
    next(error);
  }
};

/**
 * Streams the tender's ZIP archive from R2 storage via the backend.
 * Bypasses direct browser CORS limitations on Cloudflare R2 pub-* domains.
 * 
 * @route GET /api/v1/tenders/:id/zip
 */
export const downloadTenderZip = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Authentication check
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required to download tender packet', requireLogin: true });
    }

    const tender = await Tender.findById(id).lean();
    if (!tender) {
      return res.status(404).json({ message: 'Tender not found' });
    }

    // Authorization & Pro Plan check
    const user = await User.findById(req.user.userId);
    const isAdmin = (user?.role === 'admin' || user?.role === 'superadmin' || req.user?.role === 'admin');
    const activeSub = await Subscription.findOne({
      userId: user?._id,
      status: 'active',
      currentPeriodEnd: { $gt: new Date() },
    });
    const isPro = !!activeSub || isAdmin;

    if (!isPro) {
      const viewedTenderIds = user?.dailyTenderViews?.tenderIds || [];
      const tenderIdentifier = tender._id.toString();
      const hasViewed = viewedTenderIds.includes(tenderIdentifier) || (tender.sourceTenderId && viewedTenderIds.includes(tender.sourceTenderId));
      if (!hasViewed) {
        return res.status(403).json({
          message: 'Tender packet download requires viewing this tender notice first or upgrading to Pro.',
          code: 'PRO_REQUIRED'
        });
      }
    }

    const zipUrl = tender.boqZipUrl || (tender.boqFileUrl && tender.boqFileUrl.toLowerCase().endsWith('.zip') ? tender.boqFileUrl : null);
    if (!zipUrl) {
      return res.status(404).json({ message: 'No ZIP archive found for this tender' });
    }

    const response = await fetch(zipUrl);
    if (!response.ok) {
      return res.status(502).json({ message: 'Failed to retrieve archive from storage' });
    }

    const fileName = tender.zipFileName || `Tender_Packet_${tender.sourceTenderId || id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Stream directly via Readable to prevent Memory Exhaustion (OOM)
    if (response.body) {
      return Readable.fromWeb(response.body).pipe(res);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (error) {
    next(error);
  }
};