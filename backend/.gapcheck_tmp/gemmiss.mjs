import 'dotenv/config';
import fs from 'node:fs';
import { connectDB, closeDB } from '../src/config/db.js';
import Tender from '../src/models/Tender.js';
await connectDB();
const g = JSON.parse(fs.readFileSync('.gapcheck_tmp/gem_full.json'));
const last = await Tender.findOne({ sourcePortal: 'GEM' }).sort({ createdAt: -1 }).select('createdAt').lean();
const lastChk = await Tender.findOne({ sourcePortal: 'GEM' }).sort({ lastCheckedAt: -1 }).select('lastCheckedAt').lean();
console.log('last GeM insert', last.createdAt, 'last check', lastChk.lastCheckedAt);
for (const [s, v] of Object.entries(g)) {
  console.log(s, 'missing sample', v.missingSample.slice(0, 4).join(' '), '| extra', v.extraSample.join(' '));
  const ex = await Tender.find({ sourcePortal: 'GEM', sourceTenderId: { $in: v.extraSample } }).select('sourceTenderId closingDate gemStatus consigneeStates').lean();
  ex.forEach(t => console.log('   extra', t.sourceTenderId, t.closingDate?.toISOString(), t.gemStatus, t.consigneeStates.join('/')));
}
await closeDB(); process.exit(0);
