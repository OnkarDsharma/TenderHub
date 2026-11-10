import 'dotenv/config';
import fs from 'node:fs';
import { connectDB, closeDB } from '../src/config/db.js';
import Tender from '../src/models/Tender.js';
await connectDB();
const now = new Date();
const norm = (s) => String(s || '').replace(/\s+/g, '');
const base = (s) => norm(s).replace(/_\d+$/, '');
const parseNic = (s) => { const m = String(s).match(/(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2})\s*(AM|PM)?/i); if (!m) return null; let h = +m[4]; if (m[6]) { if (/PM/i.test(m[6]) && h < 12) h += 12; if (/AM/i.test(m[6]) && h === 12) h = 0; } return new Date(`${m[3]}-${'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2].slice(0,1).toUpperCase()+m[2].slice(1,3).toLowerCase())/3+1 < 10 ? '0' : ''}${'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2].slice(0,1).toUpperCase()+m[2].slice(1,3).toLowerCase())/3+1}-${m[1]}T${String(h).padStart(2,'0')}:${m[5]}:00+05:30`); };
const isSiteActive = (t) => t.status === 'ACTIVE' && !t.isDelisted && t.closingDate && t.closingDate >= now && (!t.bidSubmissionEndDate || t.bidSubmissionEndDate >= now);
const report = {};
for (const P of ['JK_TENDERS','PB_TENDERS','HP_TENDERS','LADAKH_TENDERS','HR_TENDERS','DL_TENDERS']) {
  const scan = JSON.parse(fs.readFileSync(`.gapcheck_tmp/ids_${P}.json`));
  const live = new Map(); scan.orgs.forEach(o => o.rows.forEach(r => live.set(norm(r.id), { ...r, orgName: o.name })));
  const db = await Tender.find({ sourcePortal: P }).select('sourceTenderId baseTenderId relatedTenderIds status isDelisted closingDate bidSubmissionEndDate closingDateStr createdAt updatedAt departmentName').lean();
  const byId = new Map(db.map(t => [norm(t.sourceTenderId), t]));
  const byBase = new Map(); db.forEach(t => { const b = base(t.sourceTenderId); (byBase.get(b) || byBase.set(b, []).get(b)).push(t); (t.relatedTenderIds||[]).forEach(r => { const rb = base(r); (byBase.get(rb) || byBase.set(rb, []).get(rb)).push(t); }); });
  const cats = { neverStored: [], storedButHidden: [], otherVersionStored: [] };
  for (const [id, r] of live) {
    const t = byId.get(id);
    if (t) { if (!isSiteActive(t)) cats.storedButHidden.push({ id, org: r.orgName, portalClosing: r.closing, dbStatus: t.status, dbDelisted: !!t.isDelisted, dbClosing: t.closingDate, dbBidEnd: t.bidSubmissionEndDate, dbClosingStr: t.closingDateStr }); continue; }
    const rel = (byBase.get(base(id)) || []).filter(x => norm(x.sourceTenderId) !== id);
    if (rel.length) cats.otherVersionStored.push({ id, org: r.orgName, storedAs: rel.map(x => `${x.sourceTenderId}:${x.status}`), published: r.published });
    else cats.neverStored.push({ id, org: r.orgName, published: r.published, pubDate: parseNic(r.published), closing: r.closing, title: r.title });
  }
  const extra = db.filter(t => isSiteActive(t) && !live.has(norm(t.sourceTenderId))).map(t => ({ id: t.sourceTenderId, dept: t.departmentName, closing: t.closingDate, lastUpdated: t.updatedAt }));
  const pubDay = {}; cats.neverStored.forEach(x => { const d = x.pubDate ? x.pubDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : 'unknown'; pubDay[d] = (pubDay[d] || 0) + 1; });
  const byOrg = (arr) => arr.reduce((a, x) => (a[x.org || x.dept] = (a[x.org || x.dept] || 0) + 1, a), {});
  const hiddenReason = {}; cats.storedButHidden.forEach(x => { const k = x.dbDelisted ? 'delisted' : x.dbStatus !== 'ACTIVE' ? `status=${x.dbStatus}` : (!x.dbClosing ? 'no closingDate' : x.dbClosing < now ? 'closingDate in past' : 'bidSubmissionEndDate in past'); hiddenReason[k] = (hiddenReason[k] || 0) + 1; });
  report[P] = { live: live.size, siteActive: db.filter(isSiteActive).length, neverStored: cats.neverStored.length, storedButHidden: cats.storedButHidden.length, hiddenReason, otherVersionStored: cats.otherVersionStored.length, extraOnSite: extra.length,
    neverStoredByPubDay: Object.fromEntries(Object.entries(pubDay).sort().reverse()), neverStoredByOrg: byOrg(cats.neverStored), hiddenByOrg: byOrg(cats.storedButHidden), extraByOrg: byOrg(extra),
    samples: { neverStored: cats.neverStored.slice(0, 6), storedButHidden: cats.storedButHidden.slice(0, 6), otherVersionStored: cats.otherVersionStored.slice(0, 6), extra: extra.slice(0, 6) }, all: { ...cats, extra } };
}
fs.writeFileSync('.gapcheck_tmp/nic_classified.json', JSON.stringify(report, null, 2));
for (const [P, r] of Object.entries(report)) { const { all, samples, ...s } = r; console.log('\n=====', P); console.log(JSON.stringify(s, null, 1)); }
await closeDB(); process.exit(0);
