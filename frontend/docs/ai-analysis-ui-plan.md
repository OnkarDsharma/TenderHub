# AI Tender Analysis page: UI refinement plan

Scope: frontend only. Files touched: `src/pages/Services.jsx` (hero, empty state, advisory) and `src/index.css` (replace the stacked `.estimator-*` overrides with one scoped block). Backend untouched. The dossier results area (tabs, BOQ, copilot) is not redesigned.

## Direction

The reference screen (dark navy at the top, a soft haze band, a saturated blue core at the bottom-centre, one pill input) works because it has one accent, one object in focus and almost no chrome. The current page fights that: a badge, a two-sentence paragraph, a white card with four boxes, a dashed divider, an amber pill, three icon cards. The fix is subtraction, not more gradients.

Rules for the new layout:
- One hero, one accent (blue), one secondary (amber, only for the advisory line).
- No coloured icon squares, no uppercase eyebrow badge, no cards inside cards.
- White type on the hero. Display font (Plus Jakarta Sans) for the heading only. Hairline dividers instead of boxes.
- Every state the page already handles (status, error, sign-in prompt, example tender, profile prefilled warning, analyzing) keeps a place.

## Hero (replaces the current blue section)

Full-bleed section directly under the navbar, bottom corners rounded 32px to match the home hero. Height: `min-height: min(78vh, 720px)` on desktop, ~560px on mobile. When a dossier is loaded it collapses to ~260px so results stay above the fold.

Background, three layers in CSS, no images:
1. Base: `linear-gradient(180deg, #071330 0%, #0e2250 45%, #1a3f8f 100%)`.
2. Haze: a wide white ellipse at ~45% height, `rgba(255,255,255,.55)`, blur 60px. This is the soft cloud band in the reference.
3. Core: `radial-gradient` at 50% / 92%, `#2f7bff` to transparent, blur 40px. Static. No animation.

Dark mode uses the same hero (it is already dark). Page body below stays as it is.

Content, top to bottom:
- **Top-left:** small white text, 12px, 70% opacity: "AI Quantity Surveyor". Nothing else.
- **Top-right:** Contractor Profile Baseline as a glass chip (see below).
- **Centre:** `h1` "AI Tender Analysis", white, 44px mobile / 60px desktop, weight 700, tracking -0.03em. One sub line under it, 16px, white 70%: "Eligibility fit, material schedules and contract risk, from the tender ID." The current two-sentence paragraph is dropped.
- **Input pill:** 680px max, 64px tall, dark navy `#0b1630` fill, 1px white/12% border, soft shadow. Search icon left, placeholder "Enter a tender ID or portal reference", and a 44px white circular button on the right with an arrow icon (`aria-label="Analyze tender"`). While analyzing the arrow becomes a spinner and the input is disabled. Enter key still submits.
- Under the pill, one line, 13px: status (white), error (amber), or "Try an example · JK-PWD-2026-0412" (white 70%, underlined on hover). The existing sign-in button for unauthenticated errors stays, restyled as a white outline pill.
- **Bottom-centre:** the advisory line (see below).

## Contractor Profile Baseline (top-right chip)

Default: a single row, glass style (`rgba(255,255,255,.08)` fill, 1px white/15% border, `backdrop-filter: blur(12px)`, radius 999px). Contents: building icon, company name or "Profile not set", a dot, registration class or "Class not set". Clicking opens a popover anchored below-right, 320px wide, white (dark: slate-900), containing exactly what the card shows today: Registered Entity, Registration Class, Avg Annual Turnover, the amber "example values prefilled" note when applicable, the Dossier access badge, and a "Configure profile" button that opens the existing profile modal. Escape and outside click close it.

Mobile (< 768px): the chip moves to a full-width row under the input instead of the corner.

The `profileReady` gating on the Analyze button is unchanged.

## Advisory line and the detailed scope dialog

Bottom-centre of the hero, one line, 13px, amber-200 text with a small alert icon: "AI output is advisory. Verify every requirement in the source NIT." followed by an underlined "Read the full scope and limitations" button.

Clicking opens a dialog using the existing `Dialog` / `DialogContent` primitives from `src/components/ui/Modal.jsx`. Dialog width 720px. Title: "Current platform scope and AI limitations". Body: the three existing points as a numbered list with hairline dividers, no cards, no coloured icon tiles. Text is the current copy, unchanged. A single "Understood" close button. Also closes on Escape and backdrop click.

The inline amber pill and the expandable white card below the hero are removed, as is the `showScopeAdvisory` toggle state (it becomes the dialog's open state).

## Below the hero, before a dossier exists

The "Analysis Workspace" row (icon, title, sentence) is removed. The hero already says what to do. In its place: a quiet three-column strip, max-width 960px, 48px top padding, hairline dividers between columns, no icons:

| Eligibility fit | Materials and BOQ | Contract risk |
|---|---|---|
| Turnover and solvency against the NIT thresholds, with your profile applied. | Cement, steel and aggregate quantities with SOR-based estimates. | GCC clauses, penalties and milestone exposure flagged for review. |

Headings 15px semibold, body 14px slate-500. Dark mode: slate-400.

## When a dossier is loaded

Hero collapses to the compact height, heading drops to 32px, sub line hidden, chip and advisory line stay. The results area below is unchanged apart from inheriting the new page padding.

## CSS cleanup

`src/index.css` has four separate `.estimator-page` blocks (lines ~677, ~871, ~1809, ~1833) that override each other with attribute selectors like `[class*="rounded-2xl"]`. Remove the hero-related ones (~1809-1829 and ~1833-1868) and the empty-state rules (~887-896); keep the page background and `h1` letter-spacing rules. Add one scoped block, `.ai-hero`, holding the three gradient layers, the pill, the chip and the reduced-motion guard. Dossier-area overrides (tabs, chat height) stay as they are.

## Things I am not changing

- Any API call, request shape or response handling.
- The dossier tabs, BOQ tables, execution timeline and copilot chat.
- The profile edit modal and its fields.
- Navbar, footer, other pages.

## Verification

Run the dev server, check `/services` at 1440px, 1024px, 768px and 375px in light and dark mode, in the empty state, the analyzing state, the error state (unauthenticated), and with a loaded dossier. Confirm the chip popover and scope dialog open and close with keyboard and mouse. Run `npm run lint` and `npm run build`.
