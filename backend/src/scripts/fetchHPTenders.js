/**
 * @file backend/src/scripts/fetchHPTenders.js
 * @description Ingestion script for Himachal Pradesh e-procurement tenders (hptenders.gov.in).
 */

import 'dotenv/config';
import { hpTenderAdapter } from '../services/adapters/HPTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';

import Tender from '../models/Tender.js';

async function run() {
  const limit = parseInt(process.argv[2], 10) || 20;
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Himachal Pradesh Tenders Ingestion (Target: ${limit})`);
  console.log(`📌 Portal: hptenders.gov.in (HP_TENDERS)`);
  console.log(`📌 State: Himachal Pradesh`);
  console.log(`======================================================\n`);

  await connectDB();

  try {
    let savedCount = 0;
    let skippedCount = 0;
    let pdfCount = 0;

    await hpTenderAdapter.fetchList(1, {
      syncMode: 'DEPARTMENT',
      limit,
      stopAfterConsecutiveSkips: 5,
      countSkippedTowardsLimit: false,
      shouldSkipTender: async (sourceTenderId) => {
        try {
          const existing = await Tender.findOne({
            sourcePortal: 'HP_TENDERS',
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
        console.log(`✅ [${savedCount}/${limit}] [HP] Saved: ${tender.sourceTenderId} - ${tender.title.slice(0, 45)}...`);
      }
    });

    console.log('\n======================================================');
    console.log(`🎉 Himachal Pradesh Ingestion Completed: ${savedCount} saved, ${skippedCount} skipped`);
    console.log('======================================================\n');

    await closeDB();
    process.exit(0);
  } catch (err) {
    console.error('❌ HP Ingestion run failed:', err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  }
}

run();
