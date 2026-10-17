/**
 * @file backend/src/scripts/migrateAddStateField.js
 * @description Migration script to tag all existing tenders and bids in MongoDB with the `state` field.
 * Ensures backward compatibility before expanding to Himachal Pradesh and Punjab.
 */
import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import Tender from '../models/Tender.js';

async function run() {
  console.log('\n======================================================');
  console.log('🏛️  TenderHub: Regional State Field Migration');
  console.log('📌 Target: Tag all existing tenders with explicit state');
  console.log('======================================================\n');

  await connectDB();

  const total = await Tender.countDocuments({});
  console.log(`Total tenders in database: ${total}`);

  // 1. Tag J&K State e-Procurement Tenders
  const jkResult = await Tender.updateMany(
    { 
      $or: [
        { sourcePortal: 'JK_TENDERS' },
        { sourcePortal: { $regex: /^JK/i } },
        { sourceTenderId: { $regex: /^\d{4}_[A-Z]+_/ } } // e.g. 2026_APD_...
      ],
      state: { $ne: 'Jammu & Kashmir' }
    },
    { $set: { state: 'Jammu & Kashmir' } }
  );
  console.log(`✅ J&K e-Procurement notices updated: ${jkResult.modifiedCount}`);

  // 2. Tag GeM Bids
  // Check if any GeM bids are for Ladakh (Leh / Kargil)
  const ladakhGeMResult = await Tender.updateMany(
    {
      sourcePortal: 'GEM',
      $or: [
        { location: { $regex: /Leh|Kargil|Ladakh/i } },
        { workDescription: { $regex: /Leh|Kargil|Ladakh/i } },
        { title: { $regex: /Leh|Kargil|Ladakh/i } }
      ]
    },
    { $set: { state: 'Ladakh' } }
  );
  console.log(`✅ GeM Ladakh bids tagged: ${ladakhGeMResult.modifiedCount}`);

  // Tag remaining GeM bids as Jammu & Kashmir (since previous crawls were targeted at J&K consignee)
  const jkGeMResult = await Tender.updateMany(
    {
      sourcePortal: 'GEM',
      state: { $ne: 'Ladakh' }
    },
    { $set: { state: 'Jammu & Kashmir' } }
  );
  console.log(`✅ GeM Jammu & Kashmir bids tagged: ${jkGeMResult.modifiedCount}`);

  // 3. Fallback for any record with missing state
  const fallbackResult = await Tender.updateMany(
    { $or: [{ state: { $exists: false } }, { state: null }, { state: '' }] },
    { $set: { state: 'Jammu & Kashmir' } }
  );
  if (fallbackResult.modifiedCount > 0) {
    console.log(`✅ Fallback untagged notices updated: ${fallbackResult.modifiedCount}`);
  }

  // 4. Summarize Distribution
  const distribution = await Tender.aggregate([
    { $group: { _id: { state: '$state', sourcePortal: '$sourcePortal' }, count: { $sum: 1 } } },
    { $sort: { '_id.state': 1, '_id.sourcePortal': 1 } }
  ]);

  console.log('\n📊 POST-MIGRATION STATE & PORTAL DISTRIBUTION:');
  for (const item of distribution) {
    console.log(`  • State: ${item._id.state || 'N/A'} | Portal: ${item._id.sourcePortal} -> ${item.count} tender(s)`);
  }

  console.log('\n======================================================');
  console.log('🎉 Migration completed successfully!');
  console.log('======================================================\n');

  await closeDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
