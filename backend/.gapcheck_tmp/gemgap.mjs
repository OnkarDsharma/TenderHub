import 'dotenv/config';
import fs from 'node:fs';
import { connectDB, closeDB } from '../src/config/db.js';
import Tender from '../src/models/Tender.js';
import { GeMHttpClient, GEM_CONSIGNEE_STATES, listConsigneeState } from '../src/services/adapters/GeMAdapter.js';
const full = process.argv.includes('--full');
await connectDB();
const now = new Date();
const siteActive = { sourcePortal: 'GEM', status: 'ACTIVE', isDelisted: { $ne: true }, closingDate: { $gte: now },
  $or: [{ bidSubmissionEndDate: { $exists: false } }, { bidSubmissionEndDate: null }, { bidSubmissionEndDate: { $gte: now } }] };
const client = new GeMHttpClient();
const out = {};
for (const s of GEM_CONSIGNEE_STATES) {
  const dbIds = (await Tender.find({ ...siteActive, consigneeStates: s.canonical }).select('sourceTenderId').lean()).map(t => t.sourceTenderId);
  const anyIds = new Set((await Tender.find({ sourcePortal: 'GEM' , consigneeStates: s.canonical}).select('sourceTenderId').lean()).map(t => t.sourceTenderId));
  let live, missing = [], extra = [], complete = null;
  if (full) {
    const r = await listConsigneeState(client, s, { delay: 800, now, log: { info(){}, warn(){} } });
    live = r.numFound; complete = r.complete;
    const liveIds = new Set(r.rows.map(x => x.sourceTenderId ?? x.bidNumber));
    const db = new Set(dbIds);
    missing = [...liveIds].filter(id => !db.has(id));
    extra = dbIds.filter(id => !liveIds.has(id));
    out[s.canonical] = { live, listed: liveIds.size, complete, db: dbIds.length, missing: missing.length, missingNeverStored: missing.filter(id => !anyIds.has(id)).length, extra: extra.length, missingSample: missing.slice(0, 15), extraSample: extra.slice(0, 15) };
  } else {
    live = (await client.searchConsigneeState(s.key, 1)).numFound;
    out[s.canonical] = { live, db: dbIds.length, diff: dbIds.length - live };
  }
  console.log(s.canonical, JSON.stringify({ ...out[s.canonical], missingSample: undefined, extraSample: undefined }));
}
fs.writeFileSync(`.gapcheck_tmp/gem${full ? '_full' : ''}.json`, JSON.stringify(out, null, 2));
await closeDB(); process.exit(0);
