# Tender detail page: field checklist

Everything `frontend/src/pages/TenderDetails.jsx` (and `SimilarTenders.jsx`) rendered
before the "bid file" redesign, grouped by section. The **After** column records
where each item lives in the redesigned page. Verification results are at the end.

Conditional items (shown only when the data exists) are marked *(if present)*.

## 1. Header

| Item | Source | After |
| --- | --- | --- |
| Back to Directory | `navigate(-1)` | Above header |
| Status chip | `tender.status` or "Active" | Header chips (cobalt, with dot) |
| Tender ID | `tender.sourceTenderId` | Header chips (mono) + bid bar |
| Category chip | `tender.tenderCategory` *(if present)* | Header chips |
| Docs Available chip | `documentDownloadStartDate(Str)` *(when docs pending)* | Header chips |
| Title | `tender.title` (brackets stripped) | Header title (on page, no card) |
| Department | first part of `organisationChain` or `department` | Header meta |
| Site | `workLoc.famousLocation` | Header meta |
| PIN | `workLoc.pincode` *(if not N/A)* | Header meta |
| Inviting officer | `invitingAuthorityName` or fallback text | Header authority row |
| Office address | `invitingAuthorityAddress` / `location` / fallback text | Header authority row |
| Save Tender / Saved in Watchlist | `toggleBookmark` | Header actions + bid bar |
| Contractor AI Dossier | `/services/:id` | Header actions |
| Original Portal | opens portal helper dialog | Header actions |

## 2. Key figures

| Item | Source | After |
| --- | --- | --- |
| Tender value | `estimatedValue` | Wide figure tile + bid bar |
| EMD deposit | `emdAmount` | Narrow figure tile + bid bar |
| Tender fee | `tenderFee` | EMD tile sub-line |
| Bid submission close date | Bid End date | Wide crimson deadline tile |
| Bid submission close time | Bid End time | Deadline tile sub-line |
| Time to close (or Closed + days ago) | Bid End vs now | Narrow figure tile + bid bar |
| Next milestone name | earliest upcoming milestone | Time-to-close tile + dates header |

## 3. Multi-work notice *(if `relatedTenders`)*

Heading, total works count, Ref (`tenderReferenceNumber`/`baseTenderId`), explanation
text; per sibling: tender ID, value (or "Value N/A"), title, published date, View Work.

## 4. Critical dates

| Item | After |
| --- | --- |
| Published: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Download Start: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Download End: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Clarification Start *(if present)* | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Clarification End *(if present)* | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Bid Start: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Bid End: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| Bid Opening: date, time, relative label | Track node + label (desktop), timeline row (mobile); undated ones listed under the track |
| "Next" indicator: milestone, date + time, relative label | Dates panel header + crimson node + "Next ·" label |
| Section description "Portal milestones from publication to bid opening" | Dates panel header |

## 5. Tender progress *(post-closing, `TenderProgress` component, unchanged)*

## 6. Basic details

Organisation Chain (every level), Tender Reference Number, Tender ID, Tender Type,
Tender Category, Form Of Contract, No. of Covers, Two Stage Bidding, Withdrawal
Allowed, Technical Evaluation, ItemWise Tech Eval, Payment Mode, Multi Currency BOQ,
Multi Currency Fee. Section description.

## 7. Fee & EMD

EMD Deposit amount, fee type tag (`emdFeeType` or "Fixed"), Payable To, Payable At,
Exemption; Tender Fee amount, Payable To, Payable At, Fee Exemption; description
"Payable before bid submission".

Payment instruments: table of S.No + Instrument Type *(if present)*, otherwise the
offline or online payment-mode sentence.

## 8. Work execution location

Description text, Project Site / Area Description, District / City (+ state), Postal
Pincode, Portal Location (`workLoc.rawLocation`), Portal Location (NIT)
(`tender.location`), Bid Opening Office, Pre-Bid Meeting, Google Maps link.

## 9. Work item details

Description text, Title, Work Description *(if different from title)*, Tender Value in ₹
(formatted + raw figure), Product Category, Sub category, Contract Type, Tenderer
Class, Location, Pincode, Bid Validity(Days), Period Of Work(Days), Pre Bid Meeting
Date, Pre Bid Meeting Place, Pre Bid Meeting Address, Bid Opening Place, NDA/Pre
Qualification, Should Allow NDA Tender, Allow Preferential Bidder, Independent
External Monitor/Remarks.

## 10. Covers information

"No. of Covers: n"; per row: cover number, cover type, description, doc type.
Fallback text for the standard 2-cover system when no rows.

## 11. Other important documents *(if present)*

Count text; per row: S.No, Category, Sub Category, Sub Category Description, Format/File.

## 12. Tender documents & attachments

- Header: description, file count or "Pending Release".
- Notices group: title, count, "PDF Format"; per file: name, PDF label, description,
  size, View Notice, Download.
- ZIP package: title, "Direct ZIP Archive", file name, ZIP Archive label, description,
  size, Download ZIP, Inspect & Unzip Files / Unpacking... / Unpacked (n files),
  explanation callout, unpacking message, error + Retry.
- Extracted files: heading with count, Ready in Browser; per file: name, type, size,
  View (PDF), Excel / Download, CSV (BOQ).
- Legacy work documents group *(older data)*: title, count, "Extracted Files"; per file:
  name, type, description, size, View Document + download / Excel + CSV / Download File.
- Nothing released: heading, explanation, availability schedule, Check Status on
  Official Portal.

## 13. Similar open tenders (`SimilarTenders`)

Heading (closed variant "Open tenders you can still bid on"), description; per tender:
value, close date, title, department, location.

## 14. Portal helper dialog, navigation, footer — unchanged

---

## Verification (after the "bid file" redesign)

Checked by diffing every `tender.*`, `doc.*`, `cover.*`, `inst.*`, `sibling.*`, `file.*` and
`workLoc.*` reference and every visible label string against the original page, then
loading tender 2026_DLG_179099_4 with live data on desktop (light), and at 360px (dark).

**Result: no field, value, button, link or file row was dropped.**

| Section | Where it lives now |
| --- | --- |
| Multi-work notice | Cobalt info panel; siblings as rows (value, title, ID, View Work, Pub date) |
| Basic details | Spec sheet: Identification / Contract & bidding / Evaluation / Payment. Organisation chain as breadcrumb (all levels, last emphasised). The 6 Yes/No fields are labelled chips under their group |
| Fee & EMD + Payment instruments | Navy payment slip in the sticky right rail (below content on phones); instruments inside the slip with an "S.No / Instrument Type" header |
| Work execution location | Site name large; two hairline fact rows (District / City, Postal Pincode, Portal Location; Portal Location (NIT), Bid Opening Office, Pre-Bid Meeting); Google Maps as a text button |
| Work item details | Spec sheet: Work description / Financial & contract / Location / Timeline & bid conditions / Eligibility & conditions. Should Allow NDA Tender and Allow Preferential Bidder as Yes/No chips |
| Covers | Grouped by cover ("Cover 1, Fee/PreQual/Technical"), each document a checklist row with its doc-type chip; a "Description / Doc Type" header row keeps the column labels. If a cover mixes cover types, each row shows its own |
| Other important documents | Dense table, all five columns |
| Documents | File tables (Name, Label, Size, actions) with quiet View/Download buttons on every row; BOQ package as a green-edged block with extracted files nested inside; legacy group and "not available yet" panel kept |
| Similar open tenders | Rows: value, title, department, location, close date |
| Tender progress, portal dialog, nav, footer | Unchanged |

**Presentation-only changes worth knowing**

- Column headers "Cover", "Cover Type" and "Instrument Type" are no longer table headers: the cover number and type are now the group heading, and "Instrument Type" is a small header row inside the payment slip.
- Labels keep their original wording (for example "Tender Reference Number"); no text was re-cased, because the copy is unchanged.
- The Docs Available, multi-work and "documents not available yet" notices moved from amber to cobalt, because crimson and green are now reserved for the deadline and file-ready states.
