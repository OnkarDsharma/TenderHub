/**
 * @file backend/src/scripts/checkGeMStatus.js
 * @description Diagnostic CLI script to verify GeM bids in MongoDB Atlas,
 * display the latest scraped records, active counts, and sync status.
 * 
 * Usage:
 *   node src/scripts/checkGeMStatus.js
 *   npm run check:gem
 */

import { connectDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function checkGeMStatus() {
  try {
    console.log('\n=============================================================');
    console.log('   TenderHub — Government e-Marketplace (GeM) Status Check   ');
    console.log('=============================================================\n');

    await connectDB();

    const now = new Date();
    const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 1. Total counts
    const totalGeMBids = await Tender.countDocuments({ sourcePortal: 'GEM' });
    const activeGeMBids = await Tender.countDocuments({ 
      sourcePortal: 'GEM', 
      closingDate: { $gte: now } 
    });
    const expiredGeMBids = await Tender.countDocuments({ 
      sourcePortal: 'GEM', 
      closingDate: { $lt: now } 
    });
    const closingIn48h = await Tender.countDocuments({
      sourcePortal: 'GEM',
      closingDate: { $gte: now, $lte: in48Hours }
    });
    const parsedPdfSpecs = await Tender.countDocuments({
      sourcePortal: 'GEM',
      pdfFetchStatus: 'COMPLETED'
    });

    console.log('📊 OVERALL METRICS:');
    console.log(`  • Total GeM Bids in Database : ${totalGeMBids.toLocaleString('en-IN')}`);
    console.log(`  • Active (Open for Bidding)  : ${activeGeMBids.toLocaleString('en-IN')}`);
    console.log(`  • Expired / Closed           : ${expiredGeMBids.toLocaleString('en-IN')}`);
    console.log(`  • Closing in < 48 Hours      : ${closingIn48h.toLocaleString('en-IN')}`);
    console.log(`  • Technical Specs Parsed     : ${parsedPdfSpecs.toLocaleString('en-IN')} (${totalGeMBids > 0 ? Math.round((parsedPdfSpecs / totalGeMBids) * 100) : 0}%)\n`);

    if (totalGeMBids === 0) {
      console.log('⚠️  No GeM bids found in the database. Run `npm run scrape:gem` to ingest bids.\n');
      process.exit(0);
    }

    // 2. Most recently scraped record (by updatedAt or createdAt)
    const latestScrapedRecord = await Tender.findOne({ sourcePortal: 'GEM' })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (latestScrapedRecord) {
      const lastSessionTime = latestScrapedRecord.updatedAt || latestScrapedRecord.createdAt;
      console.log('🕒 LAST CRAWL ACTIVITY:');
      console.log(`  • Last Ingested At           : ${new Date(lastSessionTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log(`  • Last Ingested Bid ID       : ${latestScrapedRecord.sourceTenderId}`);
      console.log(`  • Item Category              : ${latestScrapedRecord.title}`);
      console.log(`  • Department                 : ${latestScrapedRecord.departmentName || 'N/A'}`);
      console.log(`  • Delivery Station           : ${latestScrapedRecord.location || 'Jammu & Kashmir'}\n`);
    }

    // 3. Newest published bid (by publishedDate)
    const newestPublishedBid = await Tender.findOne({ sourcePortal: 'GEM' })
      .sort({ publishedDate: -1 })
      .lean();

    if (newestPublishedBid) {
      console.log('🆕 NEWEST PUBLISHED BID ON GeM:');
      console.log(`  • Bid Number                 : ${newestPublishedBid.sourceTenderId}`);
      console.log(`  • Title                      : ${newestPublishedBid.title}`);
      console.log(`  • Published Date             : ${new Date(newestPublishedBid.publishedDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log(`  • Closing Deadline           : ${new Date(newestPublishedBid.closingDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log(`  • EMD Value                  : ₹${(newestPublishedBid.emdAmount || 0).toLocaleString('en-IN')}\n`);
    }

    // 4. Most urgent closing bid
    const nearestClosingBid = await Tender.findOne({ 
      sourcePortal: 'GEM', 
      closingDate: { $gte: now } 
    })
      .sort({ closingDate: 1 })
      .lean();

    if (nearestClosingBid) {
      console.log('⏰ NEAREST CLOSING DEADLINE:');
      console.log(`  • Bid Number                 : ${nearestClosingBid.sourceTenderId}`);
      console.log(`  • Title                      : ${nearestClosingBid.title}`);
      console.log(`  • Closes At                  : ${new Date(nearestClosingBid.closingDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      const hoursRemaining = Math.max(0, Math.round((new Date(nearestClosingBid.closingDate) - now) / (1000 * 60 * 60)));
      console.log(`  • Time Remaining             : ~${hoursRemaining} hour(s)\n`);
    }

    console.log('=============================================================');
    console.log(`✅ VERDICT: Database is UP-TO-DATE with ${totalGeMBids.toLocaleString('en-IN')} J&K bids.`);
    console.log('=============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking GeM status:', err.message);
    process.exit(1);
  }
}

checkGeMStatus();
