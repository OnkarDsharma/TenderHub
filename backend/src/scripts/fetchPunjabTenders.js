/**
 * @file backend/src/scripts/fetchPunjabTenders.js
 * @description Ingestion script for Punjab e-procurement tenders (eproc.punjab.gov.in).
 */

import 'dotenv/config';
import { punjabTenderAdapter } from '../services/adapters/PunjabTenderAdapter.js';
import { connectDB, closeDB } from '../config/db.js';

async function run() {
  const limit = parseInt(process.argv[2], 10) || 20;
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Punjab Tenders Ingestion (Target: ${limit})`);
  console.log(`📌 Portal: eproc.punjab.gov.in (PB_TENDERS)`);
  console.log(`📌 State: Punjab`);
  console.log(`======================================================\n`);

  await connectDB();

  try {
    let savedCount = 0;
    let pdfCount = 0;

    await punjabTenderAdapter.fetchList(1, { syncMode: 'DEPARTMENT', limit }, async (batch) => {
      for (const tender of batch) {
        savedCount++;
        if (tender.pdfUrls && tender.pdfUrls.length > 0) pdfCount += tender.pdfUrls.length;
        console.log(`✅ [${savedCount}/${limit}] [Punjab] Saved: ${tender.sourceTenderId} - ${tender.title.slice(0, 45)}...`);
      }
    });

    console.log('\n======================================================');
    console.log(`🎉 Punjab Ingestion Completed: ${savedCount} tenders`);
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
