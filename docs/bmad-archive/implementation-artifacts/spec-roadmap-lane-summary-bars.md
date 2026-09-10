---
title: 'Roadmap lane summary bars: a lane draws its own span on the timeline'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_commit: '8b263d1511a8af8b91b6a2998d073c2cdbdfde32'
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/SPEC.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/timeline-component.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/ux-reference.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/data-model.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A lane is a real object on the roadmap — it owns items, it has hours and an FTE
total, it collapses — but on the timeline it is a blank grey band. `RoadmapTimeline.tsx:236-247`
renders a lane row as an empty `div`; `toRoadmapRows` even hands the lane row a placeholder window
(`startPeriod: 1, periodCount: 0`, `roadmap.ts:472-484`) that nothing draws. Three consequences:

- A reader cannot see **when a workstream runs** without scanning its item rows and doing the
  min/max in their head.
- **Collapsing a lane erases it from the timeline entirely.** Collapse is the feature that makes a
  twenty-item roadmap readable, and today it trades all timing information for vertical space.
- The left grid says a lane is `1 240 h · 3.1 FTE`, but the chart never says *over what window*, so
  the lane's FTE figure floats free of the calendar it belongs to.

**Approach:** The lane row draws a **summary bar** spanning the union window of its scheduled items
(spread items, which have no window of their own, are marked separately and never widen it) — the
classic bracket-with-end-caps silhouette from the reference image: a flat slab with a short
downward tab at each end, in a neutral slate that is deliberately *not* the item accent, so a lane
bar is never misread as something schedulable. The span is derived, never stored: `toRoadmapRows`
computes it into the lane row's existing `startPeriod` / `periodCount` fields (the placeholder
finally becomes real), and `roadmapGeometry.ts` turns it into pixels. A collapsed lane's bar also
carries what collapsing hid: rolled-up milestone ticks and the union over-demand stripe.

**And it is switchable.** A **Lane bars** toggle in the toolbar turns the whole summary layer on and
off, remembered per project beside the zoom and collapse preferences. Two readings of the same
roadmap are legitimate — "show me the workstream envelopes" and "show me only the actual items" —
and a bar that cannot be turned off becomes clutter for the second reader. Off restores today's
rendering exactly.

## Boundaries & Constraints

**Always:**

- **A lane's window is derived, every time.** It is `[min startPeriod, max finish]` over the lane's
  **window-bearing** items, computed in `toRoadmapRows` from the same synthesized windows that file
  already produces — a milestone contributes its single period. No new column, no cache, no second
  source of truth.
- **A spread item never widens a lane.** It is excluded from the span outright: a spread item has no
  window of its own (its stored `(1, 0)` is a sentinel, `schema.prisma:163-171`), and letting the
  sentinel's synthesized `[1, np]` reach the span would drag every lane that owns one to full width
  and destroy exactly the "when does this workstream run" reading the bar exists for. The lane's
  spread items are reported by the **spans-project chip** instead (see the visual contract) — the
  information is shown, it just does not deform the span.
- **Geometry is pure.** Rect, end caps and the cap-collision clamp live in `roadmapGeometry.ts` and
  are unit-tested with no DOM, exactly like `barRect` / `stripeSegments`. The component does no
  coordinate arithmetic (`timeline-component.md`, "Geometry is a pure module").
- **A lane bar's left edge is pixel-identical to its earliest child's left edge**, and its right
  edge to its latest child's right edge. It uses the same `BAR_INSET` as `barRect`, so the two
  agree by construction rather than by luck.
- **The lane bar is a read-out, not a control.** It is not draggable, not resizable, has no grab
  cursor and no window key bindings. Clicking it toggles the lane's collapse — the same action the
  left grid's lane row already performs — so the two panes stay one object.
- **The summary never lags its children.** While a drag ghost is live, the lane span is recomputed
  from the ghosted window, so the bar previews the drop with the bar being dragged.
- **Collapsing loses no information.** A collapsed lane's bar carries the rolled-up milestone ticks
  of its hidden children and the union of their over-demand periods as the same 3 px amber stripe
  CAP-9 already defines. An expanded lane draws neither — the item rows below it already do.
- **An empty lane draws nothing.** No bar, no zero-width stub; the row keeps its section tint.
- **The toggle governs the whole summary layer, and nothing else.** On: bar, end caps, rolled-up
  ticks, union stripe, label, tooltip and the spans-project chip. Off: the lane row renders exactly
  as it does today — the section-tinted band and nothing more. Item bars, milestones, item stripes,
  the left grid and the load strip are untouched in both states.
- **Default on**, so the feature is discoverable; the preference is per project, in `localStorage`,
  under `roadmap-lane-bars:{projectId}` — the same shape as `roadmap-collapsed-lanes:{projectId}`
  (`Roadmap.tsx:95-116`) and `roadmap-zoom:{projectId}` (`Roadmap.tsx:118-137`), including the
  try/catch that falls back to the default when storage is unavailable.
- **View state, never project state.** The toggle is per browser, like zoom and collapse. It is not
  a project field, it is not sent to the server, and it is absent from export/import.
- **Off costs nothing.** When the layer is off, the lane rows render no summary DOM and the
  ghost-driven span recompute is skipped — the toggle is an early return, not a `display: none`.
- Colour comes from one place: a `LANE_BAR` constant beside the existing `ACCENT` / `AMBER`, with
  its dark-theme value, following `ux-reference.md`'s "colour encodes kind and state only".
- The three-grid alignment contract still holds: the lane bar is positioned from the same
  `periodWidth` and the same period origin as the header columns and the load strip.
- Purely derived and purely visual: **no migration, no endpoint, no `schemaVersion` bump, no
  export/import change.**

**Ask First:**

- Whether a lane bar should also appear as a mini span in the **left grid** row. Out of scope here.
- **Off + collapsed is deliberately blank.** "Off" means off everywhere, including collapsed lanes,
  because a toggle with an exception is a toggle nobody can predict. If real use shows that
  collapsing with the layer off feels like a bug rather than a choice, the alternative is to keep the
  bar for collapsed lanes only — a UX call to make with evidence, not upfront.
- If a lane turns out to hold *only* spread items often enough that the chip-without-a-bar row reads
  as broken rather than as informative, revisit the chip's placement — not the span rule, which is
  settled.

**Never:**

- **No stored lane window.** A lane has no `startPeriod` / `periodCount` of its own in the database,
  and nothing in this feature may add one.
- **Never feed a spread item's `[1, np]` sentinel into the span**, in `laneSpan` or anywhere
  downstream, including the ghost-preview path.
- **No lane-level scheduling gesture** — dragging a lane bar to shift all its children is a
  different feature with its own atomicity and undo story. Not here, not "just the pointer part".
- Do not put lanes into `selectedItemId`; item selection stays item-only.
- Do not persist the toggle on the server, in a `Project` column, or in the export payload.
- Do not let the toggle gate anything but the lane summary layer — it is not a "simple view" mode.
- Do not add a global keyboard shortcut for it; the toolbar button is the affordance, and the
  roadmap's key space belongs to the bars.
- Do not change item bar visuals, the milestone diamond, the item stripe, the load strip, coverage,
  the editor panel or the demand engine.
- No virtualization, no canvas, no memoisation ceremony — `timeline-component.md`'s performance
  budget is unchanged (a lane bar is one SVG per lane).
- Do not let the end caps grow the row: everything stays inside `ROW_HEIGHT`, and the caps never
  enlarge the click target beyond the bar's own rect.

## Visual Contract

Matching the reference image, and stated here because this is where a "roughly like the picture"
gets lost:

| Element | Treatment |
|---|---|
| Lane summary bar | flat slab, height `LANE_BAR_HEIGHT` **8 px**, corner radius 2, fill `LANE_BAR` `#33627D` (dark theme `#7FA8C0`) |
| End caps | one downward tab at each end, `LANE_CAP_WIDTH` **6 px** × `LANE_CAP_DROP` **5 px**, same fill, flush with the bar's outer edges |
| Vertical placement | bar + caps (13 px) centred in the 34 px row |
| Narrow bar | when the rect is narrower than `2 × LANE_CAP_WIDTH`, the caps shrink to half the rect each and never cross |
| Collapsed: milestones | 7 px slate diamond centred on the tick's period boundary, sitting on the bar |
| Collapsed: over-demand | 3 px amber stripe under the bar over the union of the children's over-demand periods, clipped to the bar |
| Label | `1 240 h · 3.1 FTE`, 11 px muted, 6 px to the right of the bar's right edge, `pointer-events-none`, clipped at the timeline's right edge |
| Spans-project chip | lane owns one or more spread items: a 9 px slate chevron `»` plus `N spread` in 11 px muted, pinned at the timeline's left edge (x = 0), `pointer-events-none`; tooltip names the items |
| Empty lane | no bar, no label |
| Lane with only spread items | no bar (there is no window to draw) — the chip alone, so the row is never blank |
| Tooltip | lane name · `W3–W18` (plus dates when a start date is set) · total hours and FTE · item count |
| Toggle control | toolbar `Button`, `variant="outline" size="sm"`, `aria-pressed`, lucide `Brackets` icon + label `Lane bars`; pressed state uses the existing outline-button active styling, so the strip still reads as app chrome |
| Toggle placement | in the view group, immediately after `Fit` and before the separator that precedes the load selector (`Roadmap.tsx:556-563`) |
| Layer off | lane rows exactly as today: section tint, no bar, no chip, no label |

The silhouette is drawn as **one inline `<svg>` per lane** with a single `<path>`: it gives the exact
bracket shape in one element, scales with the rect, and keeps the caps out of the hit test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lane with several bars | items at W3–W6 and W9–W12 | One bar W3–W12 (the gap is *not* drawn as two bars — a lane is one span) | N/A |
| Lane with a trailing milestone | bars end W10, milestone at W14 | Span extends to W14 | N/A |
| Milestone-only lane | one milestone at W7 | One-period bar at W7 with both caps clamped | N/A |
| Lane with a spread item | spread + two bars at W3–W6 and W9–W12 | Span is W3–W12 — the spread item does **not** widen it; the spans-project chip is drawn at the row's left edge | N/A |
| Lane with only spread items | one or more spread, nothing else | No bar at all; the chip alone marks the row | N/A |
| Spread item added to a lane | user adds one to a lane with bars | The lane bar does not move; only the chip appears | N/A |
| Empty lane | no items | No bar, no label; row tint unchanged | N/A |
| Collapsed lane | items hidden | Bar drawn, plus rolled-up milestone ticks and the union over-demand stripe | N/A |
| Expanded lane | items visible | Bar drawn, no ticks, no stripe (children own those) | N/A |
| Child being dragged | ghost active on one item | Lane bar previews the ghosted span live; reverts if the drag is cancelled | Failed commit → the bar follows the rolled-back item |
| Child moved to another lane | cross-lane drop | Both source and target lane bars recompute after the commit | Rollback recomputes both back |
| Minimum zoom | `periodWidth = 8` | Caps clamped, bar still legible, label suppressed if it would overlap the next thing | N/A |
| Item with no scope | `emptyScope` bar | Still contributes to the span (it is scheduled, it just has no hours) | N/A |
| Lane with 0 hours | items exist, no estimates | Bar drawn; label shows `0 h · 0.0 FTE` | N/A |
| Toggle off | user presses `Lane bars` while it is on | Every lane summary disappears in one render; item rows, load strip and left grid unchanged | N/A |
| Toggle off, then collapse a lane | layer off | The lane row stays blank — off means off (decision above) | N/A |
| Toggle state after reload | toggled off, page reloaded | Still off, for that project only | Storage unavailable → default on, no error surfaced |
| Switch project | project A off, project B never toggled | A stays off, B renders on — the value is re-read on `project.id` change, like collapse and zoom | N/A |
| Toggle during a drag | pointer gesture live | The gesture is unaffected and still commits; the summary layer simply stops rendering | N/A |
| Click on the lane bar | pointer down + up under 3 px | Lane collapses / expands, same as the grid row | N/A |
| Drag attempt on the lane bar | pointer drag | Nothing happens; no ghost, no request | N/A |
| Keyboard | lane row focused, `Enter` / `Space` | Toggles collapse; arrows do nothing on a lane | N/A |

</frozen-after-approval>

## Code Map

**Row model (pure)**

- `src/utils/roadmap.ts` — `RoadmapRow` (`:389`), `toRoadmapRows` (`:425`), the lane row push
  (`:472-484`) that currently hard-codes `startPeriod: 1, periodCount: 0`.
  - Add `laneSpan(items: readonly RoadmapRowItem[]): { startPeriod: number; periodCount: number } | null`
    — the min/max over the window-bearing items only (milestone → its own period; **spread items are
    filtered out before the min/max**), `null` for a lane with no window-bearing items, which covers
    both the empty lane and the spread-only lane. It deliberately does not take `np`: nothing in the
    span rule depends on the project length any more.
  - `toRoadmapRows` writes the span onto the lane row (`periodCount: 0` keeps meaning "nothing to
    draw"), sets the lane row's `overDemandPeriods` to the sorted union of its items', and adds
    `milestonePeriods: number[]` to `RoadmapRow` (always `[]` for item rows), and sets the lane
    row's `spreadItemCount: number` for the chip.
  - Add `recomputeLaneSpans(rows, ghost): RoadmapRow[]` — the live-preview rule as a pure function,
    so the "summary follows the ghost" behaviour is unit-tested, not eyeballed.
- `src/utils/roadmap.test.ts` — every matrix row that is pure span arithmetic.

**Geometry (pure)**

- `src/utils/roadmapGeometry.ts` — constants (`:12-24`), `barRect` (`:63`), `stripeSegments` (`:175`).
  - `LANE_BAR_HEIGHT`, `LANE_CAP_WIDTH`, `LANE_CAP_DROP` beside `BAR_HEIGHT`.
  - `laneBarRect(startPeriod, periodCount, periodWidth)` — delegates to `barRect`, so the inset rule
    lives in exactly one place.
  - `laneSummaryPath(rect): string` — the bracket silhouette as an SVG path, with the narrow-bar cap
    clamp.
  - `laneMilestoneXs(periods, periodWidth): number[]` — rolled-up tick centres, reusing `milestoneX`.
  - `stripeSegments` is reused as-is for the collapsed lane's union stripe. Do not write a second one.
- `src/utils/roadmapGeometry.test.ts` — path shape at a normal width, at `2 × LANE_CAP_WIDTH`, and
  below it; `laneBarRect` edges identical to the earliest/latest child's `barRect` edges.

**Timeline and container**

- `src/components/roadmap/RoadmapTimeline.tsx` — lane branch (`:236-247`), `ACCENT` / `AMBER`
  (`:28-29`), item stripe render (`:400-415`).
  - Replace the empty lane `div` with the summary bar: the SVG path, the collapsed-only milestone
    ticks and union stripe, the right-hand label, a `Tooltip`, `data-testid="roadmap-lane-bar-{id}"`,
    and `onClick` → new `onToggleLane` prop. `cursor-pointer`, never `cursor-grab`.
  - Feed the rows through `recomputeLaneSpans(rows, ghost)` in the existing `useMemo` region so the
    preview costs one pass, not a per-row scan.
  - `LANE_BAR` constant next to `ACCENT`; dark value via the existing class-based dark theme.
  - New `showLaneBars: boolean` prop: when `false` the lane branch returns the plain tinted row it
    returns today, and `recomputeLaneSpans` is skipped — an early return, not hidden DOM.
- `src/components/roadmap/Roadmap.tsx` — `RoadmapTimeline` call site (`:644-663`): pass the existing
  `toggleLane` (`:304`) down, plus `showLaneBars`. `rows` (`:269`) already carries everything else.
  - `laneBarsStorageKey` / `loadShowLaneBars` / `saveShowLaneBars` beside `loadZoomIndex` /
    `saveZoomIndex` (`:118-137`) — same try/catch, default `true`.
  - `const [showLaneBars, setShowLaneBars] = useState(() => loadShowLaneBars(project.id))` next to
    `zoomIndex` / `collapsed` (`:165-167`), re-read in the `project.id` effect (`:185-190`) so a
    project switch picks up that project's preference.
  - Toolbar: the `Lane bars` toggle button after `Fit` (`:556-563`), writing through a small
    `applyShowLaneBars` helper mirroring `applyZoom` (`:192-195`) so state and storage are set in
    one place.

**Docs**

- `docs/bmad-archive/specs/spec-roadmap/ux-reference.md` — "Rows, 34px" (`:36`) says lane rows "carry no
  bar"; that sentence is now false and must describe the summary bar and its toggle instead. Add the
  lane rows to the "Bar visual language" table (`:44-54`), and the `Lane bars` toggle to the toolbar
  strip line (`:30`).
- `docs/bmad-archive/specs/spec-roadmap/timeline-component.md` — add `laneBarRect` / `laneSummaryPath` to
  the geometry list (`:22-31`); record in "Deliberately not built" that the lane bar is a read-out
  and lane-level dragging is explicitly out.

**Not touched:** `server.ts`, `server-validation.ts`, `prisma/schema.prisma`, `src/services/api.ts`,
`src/App.tsx`, `RoadmapGrid.tsx`, `RoadmapLoadStrip.tsx`, `RoadmapEditorPanel.tsx`, `roadmapLoad.ts`,
export/import.

## Tasks & Acceptance

**Execution:**

- [ ] `src/utils/roadmap.ts`, `src/utils/roadmap.test.ts` -- `laneSpan` (spread items excluded),
      real span on the lane row, union `overDemandPeriods`, `milestonePeriods`, `spreadItemCount`,
      `recomputeLaneSpans` -- the span rule is the feature; it must be provable without a browser
- [ ] `src/utils/roadmapGeometry.ts`, `src/utils/roadmapGeometry.test.ts` -- `LANE_BAR_HEIGHT`,
      `LANE_CAP_WIDTH`, `LANE_CAP_DROP`, `laneBarRect`, `laneSummaryPath`, `laneMilestoneXs`
- [ ] `src/components/roadmap/RoadmapTimeline.tsx` -- summary bar SVG, spans-project chip,
      collapsed-only ticks and union stripe, label, tooltip, click-to-collapse, ghost-aware rows
- [ ] `src/components/roadmap/Roadmap.tsx` -- `onToggleLane` passed to the timeline; `Lane bars`
      toggle: storage helpers, state, project-switch re-read, toolbar button, `showLaneBars` prop
- [ ] `src/components/roadmap/Roadmap.test.tsx` -- lane bar present/absent, collapsed rollups,
      click toggles collapse, no request is ever sent by touching a lane bar; the `Lane bars` toggle
      hides the whole layer, persists to `localStorage` and restores from it
- [ ] docs -- `ux-reference.md` rows + bar table, `timeline-component.md` geometry list and the
      "not a control" note

**Acceptance Criteria:**

- Given a lane whose items run W3–W6 and W9–W12, when the roadmap renders, then its lane row shows
  one summary bar from W3 to W12 whose left and right edges match the first and last item bars to
  the pixel.
- Given a lane with no items, when the roadmap renders, then no lane bar and no label are drawn.
- Given a lane holding two bars at W3–W6 and W9–W12 plus a spread item, when the roadmap renders,
  then the lane bar still runs W3–W12 — unchanged from the same lane without the spread item — and a
  spans-project chip marks the row.
- Given a lane holding only spread items, when the roadmap renders, then no lane bar is drawn and the
  chip alone marks the row.
- Given a collapsed lane containing a milestone and an over-demand item, when it is collapsed, then
  the lane bar shows the milestone tick and the amber stripe over exactly those periods; when it is
  expanded, then neither is drawn on the lane bar and the item rows show them instead.
- Given a bar being dragged, when the pointer moves past its lane's current start, then the lane
  summary bar previews the new span during the gesture and settles on the committed span on release.
- Given a bar dragged into another lane, when it is dropped, then both lane bars recompute.
- Given the user presses the pointer on a lane bar and releases without moving, when the gesture
  ends, then the lane collapses or expands and no network request is made.
- Given a user attempts to drag a lane bar, when they move the pointer, then nothing moves, no ghost
  appears and no `PATCH` is sent.
- Given `periodWidth` at the lowest zoom rung, when a one-period lane bar renders, then its end caps
  are clamped so they neither cross nor overflow the bar's rect.
- Given a keyboard-only user with a lane row focused, when they press `Enter` or `Space`, then the
  lane toggles, matching the pointer behaviour.
- Given the `Lane bars` toggle is pressed off, when the roadmap re-renders, then no lane bar, cap,
  tick, stripe, label or chip is in the DOM, and the item rows, left grid and load strip are
  pixel-identical to what they showed with the layer on.
- Given the toggle was turned off and the page is reloaded, when the roadmap opens on the same
  project, then the layer is still off; when it opens on a different project that was never toggled,
  then the layer is on.
- Given `localStorage` throws (private mode), when the roadmap renders, then the layer defaults to on
  and nothing is surfaced to the user.

**Commands:**

- `npx vitest run src/utils/roadmap.test.ts src/utils/roadmapGeometry.test.ts` -- expected: pass,
  every pure matrix row covered
- `npx vitest run src/components/roadmap/Roadmap.test.tsx` -- expected: pass, lane bar rendering and
  collapse behaviour asserted
- `npm run typecheck` -- expected: clean

**Manual checks** (no harness sees these): the silhouette against the reference image — cap size,
slab height, vertical centring in the row; the lane bar reads as chrome, not as a draggable object
(cursor, no ring on click); collapse/expand at every zoom rung; light and dark themes; a lane containing a spread item next to
the identical lane without one (the bars must be the same); a spread-only lane; a long label near the timeline's right edge; fullscreen mode; the toggle's pressed state readable in
both themes and the strip still reading as chrome with one more button in it.

## Suggested Review Order

**The span rule**

- Min/max over window-bearing items; milestones counted, **spread items filtered out before the
  min/max** — `src/utils/roadmap.ts` (`laneSpan`)
- Empty lane and spread-only lane both → `null` → no bar, chip only — same file, and the lane row push
- Union of the children's over-demand periods, sorted and deduplicated — same file

**Pixels**

- `laneBarRect` agreeing with `barRect` edge for edge — `src/utils/roadmapGeometry.ts`
- Cap clamp on a narrow bar — same file (`laneSummaryPath`)
- Stripe reuse rather than a second implementation — same file

**Rendering**

- Collapsed-only rollups; expanded lane draws neither — `src/components/roadmap/RoadmapTimeline.tsx`
- Click toggles, drag does nothing, hit area is the bar rect only — same file
- Ghost-aware rows computed once — same file

**The toggle**

- Layer off is an early return, not hidden DOM; ghost recompute skipped —
  `src/components/roadmap/RoadmapTimeline.tsx`
- Storage helpers mirroring the zoom pair, default on, try/catch — `src/components/roadmap/Roadmap.tsx`
- Re-read on `project.id` change, so preferences do not leak between projects — same file

**Tests and docs**

- Span and preview matrix — `src/utils/roadmap.test.ts`
- Path geometry — `src/utils/roadmapGeometry.test.ts`
- Component behaviour — `src/components/roadmap/Roadmap.test.tsx`
- `ux-reference.md`'s "carry no bar" sentence actually corrected
