import { Worker } from 'bullmq';
import pino from 'pino';
import { JKTenderDateAdapter } from '../services/adapters/JKTenderDateAdapter.js';
import { JKTenderAdapter } from '../services/adapters/JKTenderAdapter.js';
import { punjabTenderAdapter } from '../services/adapters/PunjabTenderAdapter.js';
import { hpTenderAdapter } from '../services/adapters/HPTenderAdapter.js';
import { HARYANA_PORTAL, HARYANA_BASE_URL, HARYANA_STATE } from '../services/adapters/HaryanaTenderAdapter.js';
import { DELHI_PORTAL, DELHI_BASE_URL, DELHI_STATE } from '../services/adapters/DelhiTenderAdapter.js';
import { gemAdapter } from '../services/adapters/GeMAdapter.js';
import { NIC_PORTALS, createDateAdapter } from '../config/nicPortals.js';
import SyncJob from '../models/SyncJob.js';
import Tender from '../models/Tender.js';
import SystemLog from '../models/SystemLog.js';
import { telegramService } from '../services/telegram.service.js';
import { buildRedisConnectionOptions } from '../config/redisConnection.js';

const logger = pino();
const connection = buildRedisConnectionOptions();

export const tenderSyncWorker = new Worker('TenderQueue', async (job) => {
  const startTime = Date.now();
  const slotLabel = job.data?.slotLabel || '';
  logger.info(`Processing Tender Sync Job: ${job.name} (ID: ${job.id}, Slot: ${slotLabel || 'Ad-hoc'})`);

  const triggeredBy = job.data?.triggeredBy || 'CRON_SCHEDULE';

  const syncRecord = await SyncJob.create({ 
    sourcePortal: 'MULTI_PORTAL_SYNC',
    triggeredBy,
    status: 'running',
  });

  // Dedicated Job: Retry Missing Documents Only
  if (job.name === 'retry-missing-pdfs') {
    try {
      logger.info(`[Worker] Running pending documents recovery job...`);
      await telegramService.sendCrawlStarted({
        mode: 'RECOVERY',
        targetLimit: '50 Pending Documents',
        slotLabel: slotLabel || 'Document Recovery Sweep'
      }).catch(() => {});

      // Each pending record belongs to one portal; recover it on that portal.
      const result = { recoveredCount: 0, totalPdfsSecured: 0, totalChecked: 0 };
      for (const portal of NIC_PORTALS) {
        const { portalName } = portal;
        try {
          const dateAdapter = createDateAdapter(portal);
          const res = await dateAdapter.fetchPendingDocuments({ limit: 50, headless: true });
          result.recoveredCount += res.recoveredCount || 0;
          result.totalPdfsSecured += res.totalPdfsSecured || 0;
          result.totalChecked += res.totalChecked || 0;
        } catch (portalErr) {
          logger.error(`[Worker] ⚠️ ${portalName} pending documents recovery error: ${portalErr.message}`);
        }
      }

      syncRecord.status = 'completed';
      syncRecord.pdfsDownloaded = result.totalPdfsSecured || 0;
      syncRecord.itemsProcessed = result.totalChecked || 0;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();

      await SystemLog.create({
        level: 'INFO',
        source: 'WORKER_SCRAPER',
        message: `Missing documents recovery job completed: recovered ${result.recoveredCount || 0} tender document packages.`,
        metadata: { durationMs: syncRecord.durationMs }
      }).catch(() => {});

      return { recovered: result.recoveredCount || 0 };
    } catch (err) {
      syncRecord.status = 'failed';
      syncRecord.errorMessage = err.message;
      syncRecord.durationMs = Date.now() - startTime;
      await syncRecord.save();
      throw err;
    }
  }

  // Standard Job: Multi-Region Sequential Ingestion (JK, Punjab, HP, Ladakh, Haryana, Delhi, GeM)
  try {
    logger.info(`[Worker] 🚀 Starting 6-slot automated ingestion (${slotLabel || 'Ad-hoc'})...`);

    await telegramService.sendCrawlStarted({
      mode: 'DAILY',
      targetLimit: 'Sequential Regional Sweep (JK, Punjab, HP, Ladakh, Haryana, Delhi, GeM)',
      slotLabel: slotLabel || 'Automated Ingestion'
    }).catch(() => {});

    let totalIngested = 0;
    let totalSkipped = 0;
    let totalPdfs = 0;
    let totalBoqs = 0;

    // Helper for deduplication skip check
    const makeSkipChecker = (portalName, skipCounterRef) => {
      return async (sourceTenderId) => {
        try {
          const existing = await Tender.findOne({
            sourcePortal: portalName,
            sourceTenderId
          }).select('pdfFetchStatus').lean();

          if (existing && existing.pdfFetchStatus === 'COMPLETED') {
            skipCounterRef.count++;
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };
    };

    // 1. Jammu & Kashmir (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🏛️ Ingesting Today\'s Jammu & Kashmir Tenders across all organisations...');
      const jkDateAdapter = new JKTenderDateAdapter('JK_TENDERS', 'https://jktenders.gov.in', 'Jammu & Kashmir');
      const res = await jkDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Jammu & Kashmir complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (jkErr) {
      logger.error(`[Worker] ⚠️ JK Tenders ingestion error: ${jkErr.message}`);
    }

    // 2. Punjab (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🌾 Ingesting Today\'s Punjab Tenders across all organisations...');
      const pbDateAdapter = new JKTenderDateAdapter('PB_TENDERS', 'https://eproc.punjab.gov.in', 'Punjab');
      const res = await pbDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Punjab complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (pbErr) {
      logger.error(`[Worker] ⚠️ Punjab Tenders ingestion error: ${pbErr.message}`);
    }

    // 3. Himachal Pradesh (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🏔️ Ingesting Today\'s Himachal Pradesh Tenders across all organisations...');
      const hpDateAdapter = new JKTenderDateAdapter('HP_TENDERS', 'https://hptenders.gov.in', 'Himachal Pradesh');
      const res = await hpDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Himachal Pradesh complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (hpErr) {
      logger.error(`[Worker] ⚠️ HP Tenders ingestion error: ${hpErr.message}`);
    }

    // 4. Ladakh (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🏔️ Ingesting Today\'s Ladakh Tenders across all organisations...');
      const ladakhDateAdapter = new JKTenderDateAdapter('LADAKH_TENDERS', 'https://tenders.ladakh.gov.in', 'Ladakh');
      const res = await ladakhDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Ladakh complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (ladakhErr) {
      logger.error(`[Worker] ⚠️ Ladakh Tenders ingestion error: ${ladakhErr.message}`);
    }

    // 5. Haryana (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🌻 Ingesting Today\'s Haryana Tenders across all organisations...');
      const hrDateAdapter = new JKTenderDateAdapter(HARYANA_PORTAL, HARYANA_BASE_URL, HARYANA_STATE);
      const res = await hrDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Haryana complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (hrErr) {
      logger.error(`[Worker] ⚠️ Haryana Tenders ingestion error: ${hrErr.message}`);
    }

    // 6. Delhi (Deep department-by-department date sweep)
    try {
      logger.info('[Worker] 🏙️ Ingesting Today\'s Delhi Tenders across all organisations...');
      const dlDateAdapter = new JKTenderDateAdapter(DELHI_PORTAL, DELHI_BASE_URL, DELHI_STATE);
      const res = await dlDateAdapter.fetchTendersByDate({ targetDate: 'today', headless: true });
      totalIngested += res.totalIngested || 0;
      totalSkipped += res.totalSkippedAlreadyComplete || 0;
      totalPdfs += res.totalPdfsSecured || 0;
      totalBoqs += res.totalBoqsSecured || 0;
      logger.info(`[Worker] ✅ Delhi complete (New: ${res.totalIngested || 0}, Skipped: ${res.totalSkippedAlreadyComplete || 0}, PDFs: ${res.totalPdfsSecured || 0})`);
    } catch (dlErr) {
      logger.error(`[Worker] ⚠️ Delhi Tenders ingestion error: ${dlErr.message}`);
    }

    // 7. GeM sweep: consignee-state listing for J&K, Ladakh, HP, Punjab, Haryana, Delhi + capped PDF pass
    try {
      logger.info('[Worker] 📦 Syncing GeM bids by consignee state...');
      const gemReport = await gemAdapter.syncConsigneeStates({ states: 'ALL', pdfLimit: 150, delay: 1200 });
      totalIngested += gemReport.listing.inserted;
      if (gemReport.errors.length) logger.warn({ errors: gemReport.errors }, '[Worker] GeM sync finished with state errors');
      logger.info(`[Worker] ✅ GeM Bids regional sweep completed`);
    } catch (gemErr) {
      logger.error(`[Worker] ⚠️ GeM Bids ingestion error: ${gemErr.message}`);
    }

    syncRecord.status = 'completed';
    syncRecord.itemsProcessed = totalIngested + totalSkipped;
    syncRecord.newTendersFound = totalIngested;
    syncRecord.pdfsDownloaded = totalPdfs;
    syncRecord.durationMs = Date.now() - startTime;
    await syncRecord.save();

    logger.info(`✅ Multi-portal sync complete. Ingested: ${totalIngested}, Skipped: ${totalSkipped}, PDFs: ${totalPdfs}`);

    await SystemLog.create({
      level: 'INFO',
      source: 'WORKER_SCRAPER',
      message: `Scheduled tender ingestion completed (${slotLabel || triggeredBy}): ${totalIngested} new tenders ingested, ${totalSkipped} existing skipped, ${totalPdfs} PDFs secured.`,
      metadata: { durationMs: syncRecord.durationMs, itemsProcessed: syncRecord.itemsProcessed }
    }).catch(() => {});

    // Broadcast Crawl Completed Notification
    await telegramService.sendCrawlCompleted({
      mode: 'DAILY',
      slotLabel: slotLabel || 'Automated Ingestion',
      savedCount: totalIngested,
      skippedCount: totalSkipped,
      pdfCount: totalPdfs,
      boqCount: totalBoqs,
      missingPdfCount: 0,
      durationMs: syncRecord.durationMs
    }).catch(() => {});

    return { totalIngested, totalSkipped, totalPdfs, totalBoqs };

  } catch (error) {
    logger.error(`Sync Job Failed: ${error.message}`);
    syncRecord.status = 'failed';
    syncRecord.errorMessage = error.message;
    syncRecord.durationMs = Date.now() - startTime;
    await syncRecord.save();

    await SystemLog.create({
      level: 'ERROR',
      source: 'WORKER_SCRAPER',
      message: `Tender ingestion failed (${triggeredBy}): ${error.message}`,
      stack: error.stack,
      metadata: { durationMs: syncRecord.durationMs }
    }).catch(() => {});

    // Broadcast Crawl Error Notification
    await telegramService.sendCrawlError({
      mode: 'DAILY',
      error: error.message
    }).catch(() => {});

    throw error;
  }
}, { 
  connection, 
  lockDuration: 600000,   // 10 minutes lock duration
  maxStalledCount: 3 
});