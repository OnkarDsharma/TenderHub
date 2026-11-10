/**
 * @file backend/src/scripts/fixPendingDocPortals.js
 * @description One-off repair: JKTenderDateAdapter used to write every pending_document_tenders
 * record with sourcePortal 'JK_TENDERS', even for Punjab / HP / Ladakh tenders. Pending-document
 * recovery now only processes records for its own portal, so this sets each record's sourcePortal
 * from its saved Tender (matched by sourceTenderId).
 *
 * Usage:
 *   node src/scripts/fixPendingDocPortals.js           # dry run: report only
 *   node src/scripts/fixPendingDocPortals.js --apply   # write the corrections
 */

import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import PendingDocumentTender from '../models/PendingDocumentTender.js';
import Tender from '../models/Tender.js';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  try {
    const pending = await PendingDocumentTender.find({ sourcePortal: 'JK_TENDERS' }).select('sourceTenderId').lean();
    const ids = pending.map((p) => p.sourceTenderId);
    const tenders = await Tender.find({ sourceTenderId: { $in: ids }, sourcePortal: { $nin: ['JK_TENDERS', 'GEM'] } })
      .select('sourceTenderId sourcePortal').lean();

    const byPortal = {};
    const ops = tenders.map((t) => {
      byPortal[t.sourcePortal] = (byPortal[t.sourcePortal] || 0) + 1;
      return { updateOne: { filter: { sourceTenderId: t.sourceTenderId, sourcePortal: 'JK_TENDERS' }, update: { $set: { sourcePortal: t.sourcePortal } } } };
    });

    console.log(`Pending records labelled JK_TENDERS: ${pending.length}`);
    console.log(`Belonging to another portal:         ${ops.length}`, byPortal);
    if (!ops.length) return;
    if (!apply) {
      console.log('Dry run, nothing written. Re-run with --apply to fix them.');
      return;
    }
    const res = await PendingDocumentTender.bulkWrite(ops, { ordered: false });
    console.log(`Updated ${res.modifiedCount} pending records.`);
  } finally {
    await closeDB();
  }
}

main().catch(async (err) => {
  console.error('fixPendingDocPortals failed:', err.message);
  await closeDB().catch(() => {});
  process.exit(1);
});
