/**
 * @file backend/src/scripts/fetchPunjabTenders.js
 * @description Ingestion script for Punjab e-procurement tenders (eproc.punjab.gov.in).
 */

import 'dotenv/config';
import { punjabTenderAdapter } from '../services/adapters/PunjabTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';

import Tender from '../models/Tender.js';

async function run() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => /^\d+$/.test(a));
  const limit = limitArg ? parseInt(limitArg, 10) : 100;
  const syncMode = args.some(a => a.toLowerCase().includes('department')) ? 'DEPARTMENT' : 'LATEST';

  console.log(`\n======================================================`);
  console.log(`🚀 Starting Punjab Tenders Ingestion (Target: ${limit}, Mode: ${syncMode})`);
  console.log(`📌 Portal: eproc.punjab.gov.in (PB_TENDERS)`);
  console.log(`📌 Source: ${syncMode === 'LATEST' ? 'Latest Active Tenders (Chronological)' : 'Department Scan'}`);
  console.log(`📌 State: Punjab`);
  console.log(`======================================================\n`);

  await connectDB();

  try {
    let savedCount = 0;
    let skippedCount = 0;
    let pdfCount = 0;

    await punjabTenderAdapter.fetchList(1, {
      syncMode,
      limit,
      stopAfterConsecutiveSkips: 5,
      countSkippedTowardsLimit: false,
      shouldSkipTender: async (sourceTenderId) => {
        try {
          const existing = await Tender.findOne({
            sourcePortal: 'PB_TENDERS',
            sourceTenderId
          }).select('pdfFetchStatus').lean();

          if (existing && existing.pdfFetchStatus === 'COMPLETED') {
            skippedCount++;
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      }
    }, async (batch) => {
      for (const tender of batch) {
        savedCount++;
        if (tender.pdfUrls && tender.pdfUrls.length > 0) pdfCount += tender.pdfUrls.length;
        console.log(`✅ [${savedCount}/${limit}] [Punjab] Saved: ${tender.sourceTenderId} - ${tender.title.slice(0, 45)}...`);
      }
    });

    console.log('\n======================================================');
    console.log(`🎉 Punjab Ingestion Completed: ${savedCount} saved, ${skippedCount} skipped`);
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ Punjab Ingestion run failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
