---
title: 'Roadmap Unlinked switch and Lane bars as switches'
type: 'feature'
created: '2026-09-08'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'e285bde3aeb11e8b81929440a3b86d21eed1950e'
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/ux-reference.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Linked vs unlinked bars already look different (solid fill vs dashed outline), but the planner cannot turn that distinction off, and Lane bars is a pressed outline button while the new control should be a switch.

**Approach:** Replace the Lane bars button with a labeled switch. Add a matching Unlinked switch beside it that gates the WBS-link visual language. On (default): unlinked bars/spreads use the dashed outline; linked ones stay filled. Off: every bar/spread uses the filled paint. Persist both per project in localStorage.

## Boundaries & Constraints

**Always:**

- Unlinked means no direct WBS link: `wbsItemIds.length === 0` on a bar or spread. A linked item with 0 hours still paints as linked.
- Default both switches on. Persist Unlinked as `roadmap-unlinked-outline:{projectId}` next to `roadmap-lane-bars:{projectId}`. View state only — not a project field, not sent to the server, not in export/import.
- Paint gate is `row.emptyScope && showUnlinkedOutline` on the live timeline and PNG. Name color follows the paint (accent on dashed, white on fill).
- Selection ring stays independent of this switch.
- Milestones stay diamonds; they never take the outline.
- Toolbar: label-then-switch, `text-xs`, no icons. Place Unlinked immediately after Lane bars, still before the Load separator. Tooltip on Unlinked: `Dashed outline on bars and spreads with no WBS link`.
- Lane bars meaning is unchanged: it only gates the lane summary layer.

**Ask First:**

- Changing the default of Unlinked to off (would change how existing roadmaps first render).

**Never:**

- Do not persist either switch on the server or in PNG chrome (the export draws bars, never the switches).
- Do not add a keyboard shortcut for these switches.
- Do not restyle the rest of the toolbar, change the selection ring, or change how hours/FTE are computed.
- Do not treat `hours === 0` as the unlinked predicate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default | fresh project, no localStorage | Both switches on; unlinked bar/spread dashed; linked filled; lane bars visible | N/A |
| Unlinked off | user turns Unlinked off | Unlinked bar/spread paints filled (same as linked); grid still shows 0 h | N/A |
| Unlinked on | user turns it back on | Dashed outline returns on items with empty `wbsItemIds` | N/A |
| Linked, 0 hours | `wbsItemIds: [n]`, no estimates | Filled, never dashed | N/A |
| Lane bars off | user turns Lane bars off | Lane summary gone; item paint unchanged | N/A |
| Persist | Unlinked off, remount same project | Still off; a never-toggled project stays on | Storage throw → default on, nothing surfaced |
| PNG | Unlinked off | Exported bars use filled paint for empty-scope rows | N/A |
| Milestone | any switch state | Diamond, no outline treatment | N/A |

</frozen-after-approval>

## Code Map

- `src/components/roadmap/Roadmap.tsx` — toolbar (`:743-758`): replace the Lane bars `Button` (`Brackets` + `aria-pressed`) with a labeled switch; add Unlinked beside it. Mirror `loadShowLaneBars` / `saveShowLaneBars` / `applyShowLaneBars` (`:144-163`, `:252-255`) and the `project.id` re-read (`:223`). Pass `wbsItemIds` in `rowItems` (`:274-285`). Pass `showUnlinkedOutline` into the timeline (`:902`) and `buildRoadmapPngModel` (`:676`).
- `src/components/ui/switch.tsx` — new shadcn-style Radix switch, same `data-slot` / `cn` pattern as `src/components/ui/checkbox.tsx`. Needs `@radix-ui/react-switch`. Pair with existing `src/components/ui/label.tsx`.
- `src/utils/roadmap.ts` — add `wbsItemIds: number[]` to `RoadmapRowItem` (`:379-387`). `toRoadmapRows` (`:559`) currently sets `emptyScope` from `hours === 0`; change to `(bar \|\| spread) && wbsItemIds.length === 0`. Helpers/fixtures that omit the field should default `[]`.
- `src/components/roadmap/RoadmapTimeline.tsx` — new `showUnlinkedOutline` prop beside `showLaneBars` (`:73`). Gate dashed paint at spread `:506` and bar `:521`, and the accent name color at `:600`.
- `src/utils/roadmapPng.ts` — add `showUnlinkedOutline` to `RoadmapPngInput` / `RoadmapPngExportModel` (`:73`, `:88`); thread through `buildRoadmapPngModel` (`:167`). Gate dashed draw at spread `:475` and bar `:510`.
- Tests: `src/utils/roadmap.test.ts` (`:396`, `:418`, `:421`) — emptyScope from links, not hours. `src/components/roadmap/Roadmap.test.tsx` Lane bars (`:1498`) query `role="switch"`. Add Unlinked on/off/persist. `src/utils/roadmapPng.test.ts` — PNG respects the flag. `src/utils/roadmapOrder.test.ts` fixtures need `wbsItemIds`.
- Docs: `docs/bmad-archive/specs/spec-roadmap/ux-reference.md` toolbar (`:30`) and bar table (`:48-50`); `docs/bmad-archive/specs/spec-roadmap/SPEC.md` CAP-6 (`:65`).

**Read-only:** `server.ts`, `server-validation.ts`, `api.ts`, schema, `RoadmapGrid.tsx`, `RoadmapEditorPanel.tsx`, `roadmapLoad.ts`.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/ui/switch.tsx` -- add Radix Switch primitive -- toolbar needs a real switch, not a pressed button
- [x] `src/utils/roadmap.ts` + `src/utils/roadmap.test.ts` + `src/utils/roadmapOrder.test.ts` -- `emptyScope` from `wbsItemIds`; fixtures compile -- predicate is the WBS link
- [x] `src/components/roadmap/Roadmap.tsx` -- both toolbar switches, persistence, pass flags and `wbsItemIds`
- [x] `src/components/roadmap/RoadmapTimeline.tsx` + `src/utils/roadmapPng.ts` -- gate dashed paint
- [x] `src/components/roadmap/Roadmap.test.tsx` + `src/utils/roadmapPng.test.ts` -- switch roles, Unlinked on/off/persist, PNG flag
- [x] docs -- ux-reference toolbar + bar table; CAP-6 success line

**Acceptance Criteria:**

- Given an unlinked bar, when Unlinked is on, then it has the dashed outline and accent name; when Unlinked is off, then it uses the filled paint and the grid still shows 0 h.
- Given a bar linked to a WBS node with no estimates, when the roadmap renders, then the bar is filled (not dashed) regardless of the Unlinked switch.
- Given the Lane bars switch is turned off, when the roadmap re-renders, then no lane summary is drawn and item paint is unchanged.
- Given Unlinked was turned off, when the same project remounts, then Unlinked is still off; a never-toggled project defaults on; a localStorage throw defaults on with nothing surfaced.
- Given a keyboard user, when they tab to Lane bars or Unlinked, then each control is `role="switch"` named by its visible label.

## Spec Change Log

## Verification

**Commands:**

- `npm test -- src/utils/roadmap.test.ts src/utils/roadmapPng.test.ts src/components/roadmap/Roadmap.test.tsx src/utils/roadmapOrder.test.ts` -- expected: pass
- `npm run typecheck` -- expected: no errors

**Manual checks:**

- Roadmap toolbar: two labeled switches (Lane bars, Unlinked) left of the Load separator. Toggle Unlinked on a mix of linked and unlinked bars/spreads; selection ring still appears on click; reload keeps the choice; Export PNG matches the live Unlinked state.

## Suggested Review Order

**Toolbar switches**

- Lane bars and Unlinked are labeled switches, Unlinked last before Load.
  [`Roadmap.tsx:785`](../../../src/components/roadmap/Roadmap.tsx#L785)

- Unlinked persists per project next to Lane bars, default on.
  [`Roadmap.tsx:171`](../../../src/components/roadmap/Roadmap.tsx#L171)

- New Radix switch primitive matching the existing `data-slot` chrome.
  [`switch.tsx:8`](../../../src/components/ui/switch.tsx#L8)

**Link predicate and paint**

- `emptyScope` is no WBS link, not zero hours.
  [`roadmap.ts:561`](../../../src/utils/roadmap.ts#L561)

- Live bars and spreads dash only when Unlinked is on.
  [`RoadmapTimeline.tsx:524`](../../../src/components/roadmap/RoadmapTimeline.tsx#L524)

- PNG uses the same gate so export matches the live view.
  [`roadmapPng.ts:513`](../../../src/utils/roadmapPng.ts#L513)

**Contract**

- CAP-6: dashed outline is the default Unlinked-on reading.
  [`SPEC.md:65`](../specs/spec-roadmap/SPEC.md#L65)

**Tests**

- Switch roles, on/off paint, persist, spreads, PNG flag.
  [`Roadmap.test.tsx:1586`](../../../src/components/roadmap/Roadmap.test.tsx#L1586)
