---
title: 'Client View Export to PNG'
type: 'feature'
created: '2026-08-11'
status: 'done'
baseline_commit: 'b57c3e69700a459dae8cce8ff10f4366ffd63c13'
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Client View (`/client/:projectId`) can export Excel but has no PNG export, so planners cannot share a quick client-safe image of the plan.

**Approach:** Add an "Export to PNG" button beside Excel on Client View that downloads a canvas PNG whose columns and summary match the client-facing UI/Excel — never internal cost, margin, or rate-card role.

## Boundaries & Constraints

**Always:**
- Implement as a **local handler inside** `ClientView.tsx` (same pattern as Excel). Client View is a separate route and does not receive App callbacks.
- PNG content is **client-safe only**: Role (`clientRole`), Name, Hourly rate, Daily rate (`clientHourlyRate * 8`), per-period allocation %, Price, Efforts — plus TOTALS row.
- Financial summary on the PNG: Total Price, Total Estimated Efforts, Duration, Blended Hourly Rate, Blended Daily Rate, and Phase Breakdown (phase name, price, efforts) — matching the on-screen card / Excel Phase Summary.
- Money/effort math only via `src/utils/calculations.ts` (`totalClientCost`, `estimatedEffortHours`, `hoursPerPeriod`) and existing ClientView totals helpers.
- Empty-plan / missing project: same alert as Excel (`No planning data to export`).
- Filename: `resource-plan-{projectName}-{YYYY-MM-DD}.png` (parallel to Excel naming).
- Button: `size="sm" variant="outline"` next to Export to Excel; label `Export to PNG`.
- Visual style may follow App’s canvas PNG conventions (white bg, header, table, summary card) but with **client columns/metrics only**.

**Ask First:**
- Extracting a shared PNG util used by both App (internal) and ClientView (client).
- Changing Resource Plan’s existing PNG export behavior or columns.

**Never:**
- Reuse or call `App.tsx` `handleExportToPNG` from Client View (leaks int rate, margin, int cost).
- Include rate-card role, `intHourlyRate`, margin %, total internal cost, or project margin anywhere in the Client View PNG.
- Persist anything or add API endpoints.
- Add new npm dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Project loaded, ≥1 resource plan | PNG downloads with client columns, totals, summary + phase breakdown | N/A |
| Empty plans | `resourcePlans.length === 0` | No download | `alert('No planning data to export')` |
| Zero periods | Phases resolve to 0 periods | PNG still has role/rate/price/effort columns + summary; no period cols | N/A |
| EUR/GBP currency | `clientCurrency` EUR or GBP | Symbol €/£ on rates, price, blended metrics | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ClientView.tsx` -- Client route UI; Excel + PNG toolbar; local PNG handler
- `src/utils/clientViewPng.ts` -- Pure `buildClientPngExport` + canvas `downloadClientViewPng`
- `src/components/ClientView.test.tsx` -- I/O matrix + client-safety tests for PNG export
- `src/App.tsx` -- Internal `handleExportToPNG` reference only (do not call)
- `src/utils/calculations.ts` -- `totalClientCost`, `estimatedEffortHours`, `hoursPerPeriod`
- `src/utils/phases.ts` -- `parsePhases` (already used)
- `src/main.tsx` -- `/client/:projectId` route (no change expected)

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ClientView.tsx` -- Add header `Export to PNG` button + `handleExportToPNG` that draws a client-safe canvas (table + financial summary + phase breakdown) and triggers download -- primary deliverable
- [x] `src/components/ClientView.test.tsx` (create) -- Unit-test edge cases from the I/O matrix for the export helper (empty plans → alert/no download; happy path produces a download link with `.png` name; assert drawn/exported column labels omit internal fields) -- locks client-safety and empty handling

**Acceptance Criteria:**
- Given a loaded Client View with plans, when the user clicks Export to PNG, then a PNG file downloads and contains only client-facing columns and summary metrics (no internal cost/margin/int rate).
- Given empty `resourcePlans`, when Export to PNG is clicked, then the user sees the same alert as Excel and no file downloads.
- Given EUR or GBP project currency, when exporting, then the PNG uses the matching currency symbol for client money fields.

## Spec Change Log

## Design Notes

Client View owns its data (`api.getProject`); wiring through App would be wrong. Prefer extracting row/totals building into a small pure function in the same file (or adjacent helper) so tests can assert column labels and empty-plan behavior without mounting the full Glide grid.

Period columns make the canvas grow with plan length (same as Excel width) — that is intentional for client fidelity; do not drop periods to “fit” unless the human renegotiates.

## Verification

**Commands:**
- `npx vitest run src/components/ClientView.test.tsx` -- expected: all tests pass
- `npx tsc --noEmit` -- expected: no new type errors in ClientView

**Manual checks (if no CLI):**
- Open `/client/{id}` with a real plan → Export to PNG → open image → confirm no Int. Cost / Margin / rate-card role columns; Phase Breakdown present.

## Suggested Review Order

**UI entry**

- Toolbar button wired next to Excel on the client route
  [`ClientView.tsx:472`](../../../src/components/ClientView.tsx#L472)

- Local handler builds client-only payload and downloads (never App PNG)
  [`ClientView.tsx:228`](../../../src/components/ClientView.tsx#L228)

**Client-safe export model**

- Pure builder: Role/Name/client rates/periods/price/efforts only
  [`clientViewPng.ts:72`](../../../src/utils/clientViewPng.ts#L72)

- Column set mirrors Client View Excel (no int cost/margin)
  [`clientViewPng.ts:90`](../../../src/utils/clientViewPng.ts#L90)

- Filename sanitized + Excel-parallel naming
  [`clientViewPng.ts:171`](../../../src/utils/clientViewPng.ts#L171)

**Canvas download**

- Draws table + financial summary + phase breakdown, then triggers download
  [`clientViewPng.ts:203`](../../../src/utils/clientViewPng.ts#L203)

**Tests**

- I/O matrix, client-safety labels, currency, download attr, filename sanitize
  [`ClientView.test.tsx:28`](../../../src/components/ClientView.test.tsx#L28)
