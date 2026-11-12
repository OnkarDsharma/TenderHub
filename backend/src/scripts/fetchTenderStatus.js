/**
 * @file backend/src/scripts/fetchTenderStatus.js
 * @description Scrapes the portal "Tenders Status" page for closed tenders (bidding over, AOC not reached):
 * stage table, stage summary PDF, files inside that PDF, and the per-stage detail pages.
 * See JKTenderStatusAdapter for the full flow.
 *
 * Usage:
 *   # Default: J&K, up to 50 closed tenders not checked in the last 20h
 *   node src/scripts/fetchTenderStatus.js
 *
 *   # One tender (ignores the selection filters):
 *   node src/scripts/fetchTenderStatus.js --id 2026_HAUDD_304759_3
 *
 *   # A tender not in our DB is scraped in LOCAL mode automatically (files -> logs/tender-status/files/,
 *   # result printed, no DB / R2 writes). --local forces that mode for any tender.
 *
 *   # Watch the browser, re-download even if no stage changed:
 *   node src/scripts/fetchTenderStatus.js --id 2026_HAUDD_304759_3 --headed --force
 *
 *   # Batch size, age window, time budget, other portal:
 *   node src/scripts/fetchTenderStatus.js --limit 100 --max-age-days 120 --max-minutes 80 --state jk
 */

import 'dotenv/config';
import { connectDB, closeDB } from '../config/db.js';
import { resolveNicPortals } from '../config/nicPortals.js';
import { JKTenderStatusAdapter } from '../services/adapters/JKTenderStatusAdapter.js';

async function main() {
  const args = process.argv.slice(2);
  const opts = { limit: 50, headless: true, force: false, local: false, maxAgeDays: 180, maxMinutes: undefined, tenderId: undefined };
  let stateArg = 'jk';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if ((a === '--id' || a === '-t') && next) { opts.tenderId = next.trim(); i++; }
    else if ((a === '--limit' || a === '-l') && next) { opts.limit = parseInt(next, 10); i++; }
    else if (a === '--max-age-days' && next) { opts.maxAgeDays = parseInt(next, 10); i++; }
    else if (a === '--max-minutes' && next) { opts.maxMinutes = parseInt(next, 10); i++; }
    else if ((a === '--state' || a === '--portal') && next) { stateArg = next; i++; }
    else if (a === '--headed') opts.headless = false;
    else if (a === '--force') opts.force = true;
    else if (a === '--local') opts.local = true;
  }

  const portals = resolveNicPortals(stateArg);
  await connectDB();

  let failed = false;
  try {
    for (const portal of portals) {
      const adapter = new JKTenderStatusAdapter(portal.portalName, portal.baseUrl);
      try {
        await adapter.fetchTenderStatuses(opts);
      } catch (err) {
        failed = true;
        console.error(`❌ ${portal.portalName} tender status run failed: ${err.message}`);
      } finally {
        await adapter.closeBrowser();
      }
    }
  } finally {
    await closeDB().catch(() => {});
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
