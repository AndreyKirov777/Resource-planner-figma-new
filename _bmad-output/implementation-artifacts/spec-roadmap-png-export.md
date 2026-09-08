---
title: 'Roadmap Export to PNG'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: 'ddd09437d6c88a36a8998b5410eaa74a3d6e9c7c'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Roadmap tab has no image export, so planners cannot drop a clean chart into a slide or email without screenshotting chrome (toolbar, Load, editor, buttons).

**Approach:** Add an "Export PNG" control on the Roadmap toolbar that opens a small dialog (scope + background) and downloads a canvas-drawn PNG of the chart data only — never UI controls.

## Boundaries & Constraints

**Always:**
- Local handler inside `Roadmap.tsx` (same pattern as Client View PNG). No App callback, no API, no Prisma.
- Two scopes: **Table + roadmap** (left grid 320px + timeline) and **Roadmap only** (timeline alone).
- Two backgrounds: **white** (`fillRect` white) and **transparent** (no canvas fill).
- Draw via programmatic canvas (`SCALE = 2`) using `roadmapGeometry` + current `RoadmapRow`s — not DOM screenshot, no new npm deps.
- Filename: `roadmap-{projectName}-{YYYY-MM-DD}.png` (sanitize like Client View).
- Empty roadmap (`lanes.length === 0`): toast/alert, no download. No Export button on empty-state.
- Export respects current zoom, collapsed lanes, and Lane bars toggle (draw the bars when on — never the toggle button).
- Full project horizon (`np * periodWidth`), not the scrolled viewport.
- No project-title chrome on the image — chart content only.

**Hard rule — zero UI chrome in the PNG:**
- No toolbar (either row), no "Project Roadmap" title, no Export/Start date/Lane bars/Load/Draft/Add/Fullscreen buttons.
- No editor panel.
- No Load strip.
- No grip, row menus, collapse chevrons (▸/▾), selection rings, drag ghosts, drop indicators, tooltips, or popovers.

**Ask First:**
- Including Load strip in a third scope.
- Shared PNG util refactor with Client View / Resource Plan.
- PDF or print.

**Never:**
- Add html2canvas / html-to-image / jspdf or any new dependency.
- Persist export prefs or add server endpoints.
- Change Resource Plan or Client View PNG behavior.
- Put Load demand/supply strip into the image.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path table+timeline, white | ≥1 lane, Export with defaults | PNG downloads; grid + timeline; white bg | N/A |
| Roadmap only, transparent | scope = timeline-only, bg = transparent | PNG width = timeline only; no white fill | N/A |
| Empty lanes | `roadmapLanes.length === 0` | No download | toast/alert |
| Unsafe project name | `Acme/Q3:Plan*` | Filename uses `_` substitutes | N/A |
| Lane bars off | `showLaneBars === false` | No lane summary bars drawn | N/A |
| Collapsed lane | lane in collapsed set | Item rows omitted; summary bar if lane bars on | N/A |

</frozen-after-approval>

## Code Map

- `src/utils/roadmapPng.ts` — pure `buildRoadmapPngModel` + canvas `downloadRoadmapPng`
- `src/utils/roadmapPng.test.ts` — I/O matrix, forbidden chrome labels, filename, both scopes/backgrounds
- `src/components/roadmap/Roadmap.tsx` — Export PNG button + dialog + local handler
- `src/components/roadmap/Roadmap.test.tsx` — toolbar opens dialog; export calls builder with options
- `src/utils/roadmapGeometry.ts` — read-only geometry (`barRect`, `milestoneX`, `phaseBands`, `stripeSegments`, `laneBarRect` / `laneSummaryPath`, row/header heights)
- `src/utils/clientViewPng.ts` — pattern reference only (do not call)

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/roadmapPng.ts` — create builder + canvas download (scope, background; chart-only)
- [x] `src/utils/roadmapPng.test.ts` — I/O matrix + no chrome-label leakage
- [x] `src/components/roadmap/Roadmap.tsx` — Export PNG button left of Fullscreen + options dialog
- [x] `src/components/roadmap/Roadmap.test.tsx` — dialog + option wiring
- [x] `src/components/roadmap/ExportPngDialog.tsx` — scope + background options

**Acceptance Criteria:**
- Given a populated Roadmap, when the user exports Table + roadmap with white background, then a PNG downloads showing left grid + timeline and no toolbar/Load/editor/buttons.
- Given Roadmap only + transparent, when exported, then the file has timeline-only width and transparent background.
- Given empty lanes, when Export would run, then no file downloads and the user is notified.
- Given any scope, the exported image never contains UI control labels such as `Add lane`, `Export PNG`, `Lane bars`, `Fullscreen`, or `Load`.

## Spec Change Log

## Design Notes

Canvas redraw is required so chrome cannot leak. Reuse the same `rows` / `periodWidth` / `showLaneBars` / phases already computed in `Roadmap.tsx`. Phase band colors and accent `#8f4f8f` / amber `#d97706` / lane bar `#33627D` match the live timeline. Spread bars use a lighter solid fill `#c084c0` so they stay distinct from bars.

## Verification

**Commands:**
- `npx vitest run src/utils/roadmapPng.test.ts src/components/roadmap/Roadmap.test.tsx`
- `npm run typecheck`

**Manual checks:**
- All 4 combinations of scope × background; confirm no buttons/chevrons/grip/Load/editor in the file.
