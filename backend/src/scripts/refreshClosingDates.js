/**
 * Re-reads each NIC portal's live tender list and updates stored tenders whose
 * closing/opening dates were changed on the portal (e.g. corrigendum extensions).
 *
 * Usage: node src/scripts/refreshClosingDates.js [--state all|jk|pb|hp|ladakh|hr|dl] [--dry-run]
 */
import 'dotenv/config';
import { closeDB } from '../config/db.js';
import { closingDateRefreshService } from '../services/closingDateRefresh.service.js';

const args = process.argv.slice(2);
const stateArg = args.find((a) => a.startsWith('--state='))?.split('=')[1]
  ?? (args.includes('--state') ? args[args.indexOf('--state') + 1] : 'ALL');
const dryRun = args.includes('--dry-run');

try {
  const result = await closingDateRefreshService.refresh({ portals: stateArg, dryRun, triggeredBy: 'CLI' });
  for (const [portal, r] of Object.entries(result.portals || {})) {
    console.log(`${portal}: listed ${r.listed}, matched ${r.matched}, ${dryRun ? 'would update' : 'updated'} ${r.updated}, reactivated ${r.revived}${r.complete ? '' : ` (INCOMPLETE: ${JSON.stringify(r.incompleteOrgs)})`}${r.error ? ` ERROR ${r.error}` : ''}`);
    r.samples?.slice(0, 3).forEach((s) => console.log(`   ${s.id}: ${s.from} -> ${s.to}${s.revived ? ' (reactivated)' : ''}`));
  }
  console.log(`Total ${dryRun ? 'would update' : 'updated'}: ${result.updated}, reactivated: ${result.revived}`);
} finally {
  await closeDB().catch(() => {});
  process.exit(0);
}
