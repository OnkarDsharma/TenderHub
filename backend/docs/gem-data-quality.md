# GeM data provenance and operations

## Provenance

| Field | Source and rule |
| --- | --- |
| `sourceSearchRegions` | Regional full-text query terms that found the listing. Diagnostic only; never geography. |
| `rawMinistryStateName` / `officialState` | Ministry/State Name from the matched official PDF. Raw value is retained. |
| `state` | Canonical Indian state/UT only when the PDF value matches the canonical list or a documented alias; otherwise `Other`. |
| `location` / `rawDeliverySection` | Matched city values and source text from a labeled consignee/delivery section only. Missing section means unknown. |
| `closingDate` / `publishedDate` | PDF dates when parsed, otherwise listing values where available. No invented current date or 14-day deadline. Dates without zone in the GeM formats are interpreted as India Standard Time (UTC+05:30). |
| `gemStatus` | `ACTIVE` only when seen in the ongoing listing; `CLOSED_BY_DATE` when the recorded closing date passed; `UNKNOWN` if evidence is insufficient. Absence from an ongoing sweep does not establish closure or cancellation. |
| PDF provenance | `gemPdfUrl`, `gemPdfFetchedAt`, SHA-256, detected document type, parser version, extraction timestamp, bounded raw text (120,000 characters), and truncation flag. Raw text is stored in MongoDB; this aids reparsing but increases document size. |

Confidence: `verified` means parsed from the expected source section and validated; `partial` means relevant source text exists but normalization is incomplete; `unverified` means a value exists without the required validation; `unknown` means no source-backed value. Parser validation flags remain attached instead of silently fixing conflicts.

## Status and freshness

Ongoing listing presence is current evidence; the scraper records `lastSeenInListingAt` and `lastCheckedAt`. PDF refresh is attempted at least daily, and every 8 hours for records closing within 48 hours. Records not seen in an ongoing search are not closed or cancelled based on absence alone. A passed closing date is labeled `CLOSED_BY_DATE`, not source-confirmed cancellation. Cancellation/amendment states require explicit portal evidence; none is inferred by this pipeline. API/UI timestamps are evidence timestamps, not a guarantee of real-time GeM state.

## Safe reprocessing and monitoring

`npm run repair:gem:history -- --dry-run` is the default and writes a per-record old/new diff report under `/tmp`. By default it selects records not processed by the current parser version, so deploying a new parser makes the old dataset eligible for reprocessing. Narrow the run with `--bid=GEM/...`, `--limit=N`, or continue after a bid using `--resume=GEM/...`; `--force` selects already-current records too. Use `--apply` only after reviewing its report and backup path. The script prefers stored raw PDF text; it fetches a trusted GeM PDF only when raw text is unavailable. Requests are delayed and transient server errors use bounded backoff. A mismatch or parse failure is reported; it does not transfer another bid's PDF fields.

Run `npm run check:gem` for total records, confirmed/unknown status, stale checks, unverified state, PDF failures, closing-date counts, and reports awaiting review. The pipeline emits structured sweep counters to the existing application logger; there is no automated GeM alert dispatch yet, so operators must review those logs and the status command. Review `GeMDataReport` records in MongoDB for user-submitted corrections and set `reviewStatus` to `REVIEWED` when handled. The pipeline cannot prove completeness of GeM search results: full-text search can miss bids, and a source outage or changed portal behavior can reduce coverage. Compare sampled records and page totals with GeM directly.

Fixtures under `backend/tests/fixtures` are synthetic text samples derived from the supplied Punjab/Gujarat RA examples, not official PDFs. Run `node --test tests/gem_pdf_parser.test.js` from `backend`.
