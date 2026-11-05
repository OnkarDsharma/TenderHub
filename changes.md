# Changes: J&K / State Portal Data-Gap Fix

**Date:** 05-Nov-2026
**Status:** Implemented and tested locally. **Not committed or pushed yet.** GitHub Actions still runs the old code until these changes are pushed.

---

## 1. The problem

`jktenders.gov.in` listed **~4,101 active tenders**, but the app showed **3,240** under Active Notices for J&K.

The investigation found three causes:

| # | Cause | Effect |
|---|---|---|
| 1 | **The CI scraper only looked for tenders published *today*.** `fetchTendersByDate.js` (run 6×/day) stopped reading an organisation as soon as it reached older rows. | A tender missed on its publish day (failed run, error, captcha, timeout) was **never picked up again**. Older tenders that were still open were never collected. **611 J&K tenders were missing.** |
| 2 | **Extended deadlines (corrigenda) were never synced.** Tenders already in the DB were skipped, so their closing dates were never refreshed. | Live tenders with extended deadlines looked expired and dropped out of **Active**. A dry run found **764 date corrections** needed; **263** tenders were wrongly hidden. |
| 3 | **Organisation listings were read before they finished loading.** The portal puts an organisation's whole list on one page (RDPR = 2,142 rows) and loads the rows in gradually. The scraper read the table as soon as the first row appeared. | In one test it saw only **342 of 2,142** RDPR rows; the rest were silently ignored. |

Smaller issue: 453 J&K tenders had no `bidSubmissionEndDate`. The sweep now fills it from the portal listing.

---

## 2. Files changed

### `backend/src/services/adapters/JKTenderDateAdapter.js`

**a) Shared per-tender method: `ingestListingRow(page, rowSummary, org, orgPageNum, stats, options)`**
- The old inline block inside `fetchTendersByDate()` was moved, **without changing its logic**, into this method. The block opened a tender row, handled multi-work NIT tables, scraped details, downloaded PDF/BOQ, saved to MongoDB + R2, and updated `pending_document_tenders`.
- The date crawl and the new sweep now both use it.
- The loose counters in `fetchTendersByDate()` (`totalIngested`, `totalPdfsSecured`, …) became a single `stats` object that is passed into the method. The return value and console output are the same as before.

**b) New helpers**
- `waitForFullListing(page, expected)`: waits until the organisation's tender table reaches the portal's advertised count, or stops growing (max 90 s).
- `readListingRows(page)`: reads ID, title, published, closing and opening dates for every row in the listing.
- `openOrganisationListing(page, org)`: opens an organisation from the directory and waits for the full list.
- `ensureListingRowVisible(page, org, tenderId)`: makes sure a row is rendered before clicking it, reopening the organisation if needed.

**c) The date crawl now waits for the full listing**
- `fetchTendersByDate()` calls `waitForFullListing()` after opening each organisation (fixes cause 3 for manual date runs too).

**d) New method: `sweepPortal(options)`**

Options: `orgFilter`, `excludeOrg`, `headless`, `maxNew` (default 150), `maxMinutes` (time budget), `dryRun`.

- **Phase 1: read every listing and fix dates** (~75 s for all of J&K, no captcha)
  - Reads every organisation's full listing.
  - Batch-loads the matching tenders from MongoDB.
  - Where the portal's **Closing Date** differs from `closingDate` / `bidSubmissionEndDate` (by more than 1 min), it updates `closingDate`, `closingDateStr`, `closingTime`, `bidSubmissionEndDate`, `bidSubmissionEndDateStr` and `bidSubmissionEndTime`.
  - Where the portal's **Opening Date** differs, it updates `bidOpeningDate`, `bidOpeningDateStr` and `bidOpeningTime`.
  - If the portal still lists a tender as open (closing date in the future) and it is `EXPIRED`/`ARCHIVED` in the DB, it sets it back to `ACTIVE`.
  - All writes for one organisation go in a single `bulkWrite`.
- **Phase 2: add missing tenders** (capped)
  - Candidates:
    - tenders on the portal but **not in the DB**;
    - tenders saved in the **last 2 days** that are still missing documents. This keeps the old crawl's behaviour of retrying today's tenders 6×/day.
  - Sorted **newest first**, so today's new tenders are still handled first.
  - Grouped by organisation, so each listing is opened once.
  - Before opening a missing tender, re-checks the DB, because a multi-work NIT saves its sibling works together.
  - Stops at `maxNew` tenders or `maxMinutes`. Anything left over is picked up by the next run.
- **Safety**
  - Never deletes or delists anything. Removing tenders that are gone from the portal is still left to `reconciliation.service.js`.
  - `--dry-run` only reports; it writes nothing.
  - Uses `this.portalName`, so it works for JK / Punjab / HP / Ladakh.
- Prints a summary with: listed on portal, already in DB, dates fixed, revived to Active, missing, filled this run, missing remaining (counted from the DB), and any listing that was read short.

### `backend/src/scripts/fetchTendersByDate.js`

New command-line options (without `--sweep` the script behaves exactly as before):

| Option | Meaning |
|---|---|
| `--sweep` | Run `sweepPortal()` instead of the date-only crawl |
| `--max-new N` | Max missing tenders to add per run (default 150) |
| `--max-minutes M` | Time budget for the filling phase |
| `--dry-run` | Report what would change, write nothing |

- Prints an `INGESTION & DOCUMENT METRICS: FULL SWEEP` block, so the workflow's existing Job Summary grep still picks it up.
- The Telegram "started" and "completed" messages say `FULL SWEEP [state]` in sweep mode.
- Usage examples added to the file header.

### `.github/workflows/scrape-tenders.yml`

Only the J&K / Punjab / HP / Ladakh scrape step changed:

```diff
- - name: Scrape Today's Tenders Across All Organisations
-   run: node src/scripts/fetchTendersByDate.js --state ${{ matrix.state }}
+ - name: Sweep Portal (Fix Extended Dates + Ingest Missing Tenders)
+   run: node src/scripts/fetchTendersByDate.js --state ${{ matrix.state }} --sweep --max-new 150 --max-minutes 80
```

Also added `GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}` to the workflow-level `env:` block. Without it, CI captcha solving fell back to local Tesseract OCR, which is slower and less accurate. **This needs a repository secret named `GEMINI_API_KEY`** (Settings → Secrets and variables → Actions). If the secret is missing, the value is empty and the scraper behaves as before (Tesseract only).

**J&K split into two parallel jobs.** Rural Development & Panchayati Raj (RDPR) holds more than half of J&K's tenders (2,322 of ~4,250), so it now has its own matrix job, and the main J&K job skips it. Each matrix entry gained a `key` (unique log and artifact names, since two jobs now share `state: jk`) and `extra` (the organisation filter):

| Job (`key`) | Extra arguments | Covers |
|---|---|---|
| `jk` | `--exclude-org 'Rural Development'` | 31 J&K organisations |
| `jk-rdpr` | `--org 'Rural Development'` | RDPR only |
| `punjab`, `hp`, `ladakh` | none | unchanged |

The filters are case-insensitive substring matches on the organisation name, and "Rural Development" matches only RDPR on the J&K portal, so the two jobs never touch the same tenders. Checked with dry runs: 31 + 1 organisations, 1,927 + 2,322 tenders, 167 + 326 = 493 missing, matching the full J&K sweep. This doubles J&K's capacity to about 240 tenders per run.

The schedule (6 runs/day), the job timeout (100 min), the guard job and the GeM job are unchanged by this work. This file also contains earlier, separate GeM edits that are not part of this change.

### `backend/src/scripts/auditOrganisationCoverage.js`

- **Fixed a crash:** it read `comparison.confirmedMissingPortalIds`, which doesn't exist. Now it reads `candidateMissingPortalIds`.
- **Fixed wrong counts:** the "matching IDs" line printed the number of DB records matched by organisation **name**, not the number of portal IDs found. It now matches by the portal's own tender IDs, plus name, and prints `Portal IDs found in TenderHub`.
- **Fixed partial reads:** waits for the full listing before reading IDs.
- **New:** reports portal tenders that are in the DB but hidden from Active (expired, closed or delisted).

---

## 3. Testing done

| Test | Result |
|---|---|
| `node --check` on all changed JS files | Pass |
| Full J&K sweep, `--dry-run` | 31 orgs, **4,101/4,101** rows read, 3,490 in DB, **611 missing**, **764 dates to fix**, **263 to revive**, 73 s |
| Checked date differences by hand (HAUDD) | 50 real extensions (e.g. portal 14-Nov vs DB 03-Nov), 139 empty `bidSubmissionEndDate`, 1 wrong opening date. All real, so safe to write. |
| **Real sweep: Health & Medical Education** | 46/46 missing tenders added, **46 PDFs + 46 BOQs** secured, 17 dates fixed, 2 revived, 0 failures, 29 min |
| Audit afterwards (HME) | **72/72** portal IDs in DB, **0** missing, **0** hidden from Active |

Data written to the production DB/R2 during testing: HME only (46 new tenders + 17 date updates). Missing J&K tenders still remaining: **~565**.

---

## 4. Throughput and expected catch-up

- Reading every listing and fixing all dates takes ~1.5 min, so **all 764 date fixes land in the first run**.
- Adding a tender takes ~38 s (detail page, captcha, PDF, BOQ, R2 upload), so one run (80-min budget) handles about **120 tenders**, and 6 runs/day handle about **720/day**.
- That covers the new daily tenders plus the ~565 backlog, which should be cleared in **about 2–3 days**. For faster catch-up, the job could be split into parallel shards.

---

## 5. Known limitations / not done

- **Punjab, HP, Ladakh not tested yet.** They use the same NIC portal software and code, but their first CI run will be the first real test.
- **Document download end date is not refreshed** by the sweep, because the listing doesn't show it. The app's filters don't use it.
- **An existing bug in the old date-only mode (not fixed):** its "already saved" check is hardcoded to `sourcePortal: 'JK_TENDERS'` for every state. CI no longer uses this mode; the sweep uses the correct portal name.
- `backend/reports/` (untracked) contains audit reports generated during testing.
- Other uncommitted files in the repo (GeM files, `env.js`, `auth.controller.js`, `auth.middleware.js`, frontend files, etc.) are **not part of this change**.
