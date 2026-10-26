import 'dotenv/config';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';
import SyncJob from '../models/SyncJob.js';
import { telegramService } from '../services/telegram.service.js';

async function run() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const limitArg = args.find(a => /^\d+$/.test(a));
  const limit = limitArg ? parseInt(limitArg, 10) : 600;
  const syncMode = args.some(a => a.toLowerCase().includes('department')) ? 'DEPARTMENT' : 'LATEST';

  // Send Telegram crawl started update
  await telegramService.sendCrawlStarted({
    mode: 'DAILY',
    targetLimit: `${limit} tenders (${syncMode} mode)`
  });

  await connectDB();

  const isLadakh = args.some(a => a.toLowerCase().includes('ladakh'));
  const targetState = isLadakh ? 'Ladakh' : 'Jammu & Kashmir';
  const targetPortal = isLadakh ? 'LADAKH_TENDERS' : 'JK_TENDERS';

  // Find the last successful scraping time from SyncJob or the latest publishedDate in DB
  const lastSyncJob = await SyncJob.findOne({
    sourcePortal: targetPortal,
    status: 'completed'
  }).sort({ createdAt: -1 }).lean();

  const latestTender = await Tender.findOne({
    sourcePortal: targetPortal,
    publishedDate: { $ne: null }
  }).sort({ publishedDate: -1 }).select('publishedDate sourceTenderId').lean();

  const lastScrapedTime = lastSyncJob?.createdAt || latestTender?.publishedDate || null;

  console.log(`\n======================================================================`);
  console.log(`🚀 [COMMAND 2] DAILY INCREMENTAL CRAWL: LATEST TENDERS (${targetState.toUpperCase()})`);
  console.log(`======================================================================`);
  console.log(`📌 State: ${targetState} (${targetPortal})`);
  console.log(`📌 Source Mode: ${syncMode === 'LATEST' ? 'Latest Active Tenders (FrontEndLatestActiveTenders - Fast & Chronological)' : 'Department-by-Department (FrontEndTendersByOrganisation)'}`);
  console.log(`📌 Previous Scraping Time: ${lastScrapedTime ? lastScrapedTime.toISOString() : 'None (First Run)'}`);
  console.log(`📌 Most Recent Tender in DB: ${latestTender ? latestTender.sourceTenderId : 'None'}`);
  console.log(`📌 Target Limit: ${limit} new tenders`);
  console.log(`📌 Deduplication: Atomic MongoDB upsert + R2 key idempotency`);
  console.log(`======================================================================\n`);

  const adapter = new JKTenderAdapter(targetPortal, 'https://jktenders.gov.in', targetState);

  let syncJob = null;
  let savedCount = 0;
  let skippedCount = 0;
  let boqCount = 0;
  let pdfCount = 0;
  let missingPdfCount = 0;

  try {
    syncJob = await SyncJob.create({
      sourcePortal: 'JK_TENDERS',
      status: 'running',
      triggeredBy: 'ADMIN_MANUAL',
      itemsProcessed: 0
    });

  const isDeep = args.some(a => a === '--deep' || a === '--all' || a === '--no-catchup');
  const stopAfterSkips = isDeep ? null : 15;

  const result = await adapter.fetchList(1, {
    syncMode,
    limit,
    stopAfterConsecutiveSkips: stopAfterSkips,
    countSkippedTowardsLimit: false,
      shouldSkipTender: async (sourceTenderId, publishedDateStr) => {
        try {
          const existing = await Tender.findOne({
            sourcePortal: 'JK_TENDERS',
            sourceTenderId
          }).select('pdfFetchStatus publishedDate').lean();

          // If already in DB and documents completed, skip
          if (existing && existing.pdfFetchStatus === 'COMPLETED') {
            skippedCount++;
            return true;
          }

          // If published on or before the last scraped time and already in DB, skip
          if (lastScrapedTime && publishedDateStr) {
            const pubDate = new Date(Date.parse(publishedDateStr.replace(/-/g, ' ')));
            if (!isNaN(pubDate.getTime()) && pubDate <= lastScrapedTime && existing) {
              skippedCount++;
              return true;
            }
          }

          return false;
        } catch (e) {
          return false;
        }
      }
    }, async (batch) => {
      for (const tender of batch) {
        try {
          const normalized = adapter.normalize(tender);

          const existing = await Tender.findOne({
            sourcePortal: normalized.sourcePortal,
            sourceTenderId: normalized.sourceTenderId
          }).lean();

          if (existing) {
            // Merge nitDocuments without duplicates
            const existingNit = existing.nitDocuments || [];
            const newNit = normalized.nitDocuments || [];
            const mergedNit = [...existingNit];
            for (const doc of newNit) {
              if (!mergedNit.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                mergedNit.push(doc);
              }
            }
            normalized.nitDocuments = mergedNit;

            // Merge pdfUrls without duplicates
            const existingPdfs = existing.pdfUrls || [];
            const newPdfs = normalized.pdfUrls || [];
            normalized.pdfUrls = Array.from(new Set([...existingPdfs, ...newPdfs]));

            // Merge workItemDocuments without duplicates
            const existingWork = existing.workItemDocuments || [];
            const newWork = normalized.workItemDocuments || [];
            const mergedWork = [...existingWork];
            for (const doc of newWork) {
              if (!mergedWork.some(e => (doc.fileUrl && e.fileUrl === doc.fileUrl) || (doc.documentName && e.documentName === doc.documentName))) {
                mergedWork.push(doc);
              }
            }
            normalized.workItemDocuments = mergedWork;

            if (!normalized.boqFileUrl && existing.boqFileUrl) {
              normalized.boqFileUrl = existing.boqFileUrl;
            }
            if (!normalized.boqZipUrl && existing.boqZipUrl) {
              normalized.boqZipUrl = existing.boqZipUrl;
              normalized.zipFileName = existing.zipFileName;
              normalized.zipFileSizeKb = existing.zipFileSizeKb;
            }
          }

          await Tender.findOneAndUpdate(
            { sourcePortal: normalized.sourcePortal, sourceTenderId: normalized.sourceTenderId },
            { $set: normalized },
            { upsert: true, returnDocument: 'after' }
          );

          savedCount++;
          if (normalized.pdfUrls && normalized.pdfUrls.length > 0) pdfCount += normalized.pdfUrls.length;
          if (normalized.boqZipUrl || normalized.boqFileUrl) boqCount++;
          if (normalized.pdfFetchStatus === 'PENDING') missingPdfCount++;

          console.log(`✅ [Saved: ${savedCount} | Skipped: ${skippedCount}] ${normalized.sourceTenderId} (${normalized.departmentCode || 'GEN'})`);
          console.log(`   📁 Key: ${normalized.r2StorageKey}`);
          console.log(`   📅 Published: ${normalized.publishedDate ? normalized.publishedDate.toISOString() : 'N/A'}`);
          console.log(`   📄 NIT Docs: ${normalized.nitDocuments?.length || 0} | 📦 BOQ ZIP: ${normalized.boqZipUrl ? 'Secured (' + (normalized.zipFileSizeKb || '?') + ' KB)' : 'None'} | 📊 Status: ${normalized.pdfFetchStatus}`);

          if (syncJob) {
            await SyncJob.findByIdAndUpdate(syncJob._id, {
              itemsProcessed: savedCount + skippedCount,
              newTendersFound: savedCount,
              pdfsDownloaded: pdfCount,
              missingPdfCount
            }).catch(() => {});
          }
        } catch (saveErr) {
          console.error(`❌ Error saving tender ${tender.sourceTenderId}: ${saveErr.message}`);
        }
      }
    });

    const durationMs = Date.now() - startTime;
    if (syncJob) {
       await SyncJob.findByIdAndUpdate(syncJob._id, {
         status: 'completed',
         itemsProcessed: savedCount + skippedCount,
         newTendersFound: savedCount,
         pdfsDownloaded: pdfCount,
         missingPdfCount,
         durationMs
       }).catch(() => {});
     }

    // Send Telegram Crawl Completed Notification
    await telegramService.sendCrawlCompleted({
      mode: 'DAILY',
      savedCount,
      skippedCount,
      pdfCount,
      boqCount,
      missingPdfCount,
      durationMs
    });

    console.log(`\n======================================================================`);
    if (savedCount === 0) {
      console.log(`🎉 [COMMAND 2 RESULT] THE TENDERS ARE LATEST!`);
      console.log(`ℹ️ All tenders in the database are up to date with the portal.`);
      console.log(`⏩ Tenders Checked & Skipped (Already in DB): ${skippedCount}`);
    } else {
      console.log(`🎉 [COMMAND 2 RESULT] DAILY INCREMENTAL CRAWL COMPLETED`);
      console.log(`📊 New Tenders Scraped & Saved: ${savedCount}`);
      console.log(`⏩ Tenders Skipped (Already in DB): ${skippedCount}`);
      console.log(`📄 PDFs Uploaded to R2: ${pdfCount}`);
      console.log(`📦 BOQ Archives Uploaded to R2: ${boqCount}`);
    }
    console.log(`⏱️ Duration: ${Math.round(durationMs / 1000)}s`);
    console.log(`======================================================================\n`);

    await closeDB();
    process.exit(0);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(`❌ Daily incremental crawl failed:`, err.message);
    await telegramService.sendCrawlError({
      mode: 'DAILY',
      error: err.message
    });
    if (syncJob) {
      await SyncJob.findByIdAndUpdate(syncJob._id, {
        status: 'failed',
        durationMs,
        errorMessage: err.message
      }).catch(() => {});
    }
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
