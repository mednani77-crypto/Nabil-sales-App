# Instructions for AI agents working on this repo

Read `docs/SPEC.md` before changing anything. The product brief (Arabic) is `docs/brief-ar.md`.
The approved design lives in `design/` — `design/Main.dc.html` is the full interactive phone
prototype (markup + a `renderVals()` script holding realistic demo data and every flow).

## Who you work for
- Owner: Mohamad — reviews from his phone. Write PR descriptions and user-facing summaries in
  **Arabic**, short, with English terms in parentheses at the end of sentences (RTL readability).
- End user: Nabil, a truck sales rep in Dire Dawa. The app UI is Arabic, RTL, phone-first.

## Hard rules (break any of these = the PR is wrong)
1. Operations are append-only. Never update or delete a row in `operations`. Corrections are new operations.
2. Never store a balance. Compute from operations via `src/domain/postings.ts` / `balances.ts`.
3. Money is integer santim (`number`, integer). Use `src/domain/money.ts` helpers. No floats.
4. Quantities are integers in the item's base unit. Use `src/domain/units.ts`.
5. Snapshot unit name, factor and price on every operation line.
6. A sale never reduces the company account. Customer → company-bank payments are ONE operation.
7. Every new rule in `src/domain/` gets a Vitest test in the same PR.
8. Domain code (`src/domain/`) is pure: no React, no Dexie, no Date.now() inside calculations
   (pass dates/ids in).

## Commands
- `npm install` — install
- `npm run dev` — dev server
- `npm test` — Vitest (must pass)
- `npm run build` — type-check + production build (must pass)

## Layout
- `src/domain/` — pure accounting logic + tests
- `src/db/` — Dexie schema, repositories, demo seed
- `src/ui/` — shared UI components (icons, sheet, toast, layout)
- `src/screens/` — one file per screen
- `src/styles.css` — design tokens and components (no CSS framework)

## UI conventions
- Colors: ink `#0D1B2A`, ground `#EDF0F4`, amber CTA `#F4A100`, teal money-in `#0A7C6E`,
  red debit `#A32A20`, blue info `#1E4FB8`. Fonts: Alexandria (numbers/headings), IBM Plex Sans Arabic (body).
- Touch targets ≥ 44px. Primary action is a sticky bottom button. No emoji in UI; inline SVG icons.
- Numbers use Western digits with thousands separators (`fmtMoney`).

## Workflow
- One phase (or one coherent slice) per branch and PR. Update the phase table in `docs/SPEC.md`.
- Never commit secrets. Supabase keys go in `.env.local` (git-ignored) and the host's env settings.
