---
title: 'Roadmap per-item bar colours'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: ''
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/specs/spec-roadmap/ux-reference.md'
  - '{project-root}/_bmad-output/specs/spec-roadmap/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every roadmap bar, spread and milestone painted the same accent, so planners could not tell workstreams apart by colour.

**Approach:** Persist a per-item colour from a fixed fill-safe swatch palette. Pick it in the editor; live timeline and PNG use it for fill, unlinked dashed outline, and drag ghost. Lane summaries stay slate.

## Boundaries & Constraints

**Always:**

- Store `RoadmapItem.color` (default `#8f4f8f`) on the server; validate against `PHASE_COLORS` plus the legacy default.
- Kind stays encoded by shape; colour is item identity. Spreads use a lightened mix of the same hue.
- Unlinked dashed outline and name colour follow the item colour when Unlinked is on.
- Lane summary bars / collapsed milestone ticks stay `#33627D` / dark `#7FA8C0`.

**Never:**

- Do not use pastel `PHASE_COLORS` for item fills.
- Do not include lane-bar slate in the item palette.
- Do not add free hex / custom picker in this change.
- Do not recolour lane summaries from child items.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default | existing / new item, no colour pick | Paint `#8f4f8f` | N/A |
| Swatch click | editor Color grid | PATCH `{ color }` | Failed save reverts + field error |
| Unknown hex | API body `#ff00aa` | 400 validation | Zod refine |
| Unlinked on | empty `wbsItemIds`, custom colour | Dashed outline in that colour | N/A |
| Spread | same colour as a bar | Lighter solid fill of same hue | N/A |
| PNG | coloured rows | Canvas fill/stroke match live | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` + migration `20260908160000_add_roadmap_item_color`
- `src/utils/roadmapColors.ts` — palette + paint helpers
- `server-validation.ts` / `server.ts` / `src/services/api.ts` — create/update `color`
- `src/utils/roadmap.ts` — `RoadmapRow.color` via `toRoadmapRows`
- `src/components/roadmap/RoadmapEditorPanel.tsx` — Color swatches after Kind
- `src/components/roadmap/RoadmapTimeline.tsx` + `src/utils/roadmapPng.ts` — paint from `row.color`

## Tasks & Acceptance

**Execution:**

- [x] Schema, Zod, API, client types
- [x] Palette helpers + row threading
- [x] Editor swatches
- [x] Timeline + PNG + drag ghost
- [x] Docs + tests

**Acceptance Criteria:**

- Given a bar with colour `#E3F2FD`, when Unlinked is off, then the bar fills that colour.
- Given an unlinked bar with a non-default colour and Unlinked on, then the dashed outline and name use a darkened stroke of that colour.
- Given the editor Color swatch `#E3F2FD`, when clicked, then `onUpdate` receives `{ color: '#E3F2FD' }`.
- Given PNG export of a coloured bar, when drawn, then canvas fill styles include that hex.

## Verification

**Commands:**

- `npm test -- src/utils/roadmapColors.test.ts src/utils/roadmap.test.ts src/utils/roadmapPng.test.ts src/components/roadmap/RoadmapEditorPanel.test.tsx src/components/roadmap/Roadmap.test.tsx server-validation.test.ts`
- `npm run typecheck`
