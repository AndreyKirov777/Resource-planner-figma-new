---
title: 'WBS-2 — WBS Page UI (Tree Table + Estimate Matrix)'
type: 'feature'
created: '2026-08-13'
status: 'done'
baseline_commit: 'e6995aa946c1733acd421a65a705669fe23119ab'
context: ['{project-root}/docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md', '{project-root}/docs/bmad-archive/implementation-artifacts/spec-wbs-1-data-model-api.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** WBS-1 shipped the data model and API for a Work Breakdown Structure, but there is no UI — a planner cannot create, view, or estimate WBS items yet, so the second estimation viewpoint is unreachable.

**Approach:** Add a fifth "WBS" tab to `App.tsx` rendering a new `Wbs.tsx` component: a flat, indented tree table (shadcn `Table`, matching `ProjectList.tsx`'s existing conventions — no new grid library) with per-item phase assignment, plus a dynamic estimate matrix (one column per discipline in use, hours editable per cell), built entirely on the existing WBS-1 client wrapper.

## Boundaries & Constraints

**Always:**
- Reuse only the WBS-1 client wrapper (`getWbsItems`/`createWbsItem`/`updateWbsItem`/`deleteWbsItem`/`replaceWbsEstimates`) — no new endpoints, no direct `fetch` from the component.
- Tree is a flat table with computed indent (padding by depth), assembled client-side from `WbsItem[]` (`parentId`). Pure tree logic lives in new `src/utils/wbsTree.ts`, unit-tested (repo rule: pure `src/utils/` logic carries tests).
- Estimate matrix columns = disciplines currently used in the project's WBS estimates, plus "+ Add discipline": a `Select` of distinct rate-card disciplines not already shown when the card is non-empty, else a free-text `Input` (mirrors the server's own empty-card bypass). Each cell edits that item's `(discipline, role: "")` estimate; saving calls `replaceWbsEstimates` with the item's full estimate set, preserving all other entries untouched.
- Phase column: `Select` from `parsePhases(project.phases, resourcePlans)` plus "Unassigned" (`phaseName: null`) → `updateWbsItem`.
- Name is inline-editable (`Input`, commit on blur) → `updateWbsItem`.
- "Add root item" / per-row "Add child" set a client-computed `displayOrder` (max sibling order + 1) — the API doesn't auto-increment it (WBS-1 judgment call).
- Deleting an item with descendants warns via `window.confirm` naming the subtree size (matches `ProjectList.tsx`/`RateCard.tsx`) before `deleteWbsItem`, since the DB cascade is silent.
- "Total hours" per row = rollup of own + all descendant estimates, computed client-side in `wbsTree.ts` — never written to the DB.
- `App.tsx`: fetch WBS items alongside `resourceLists`/`resourcePlans` in `loadProjectData` (project-scoped); `TabsList` `grid-cols-4` → `grid-cols-5`; new tab wired like the other four.
- Must not read from or write to `ResourcePlan`/`Allocation` state — WBS and the resource plan stay independent (reconciliation is WBS-3).

**Ask First:** none anticipated. If the discipline picker needs data beyond the already-loaded global rate card, HALT before adding any endpoint.

**Never:**
- No drag-and-drop reordering, no reparenting UI — items are created as a root or as a fixed parent's child via "Add child" and can't be moved afterward (`parentId` update exists in the API but is unused here).
- No reconciliation panel, no reads of `ResourcePlan`/`Allocation`/`estimatedEffortHours` — WBS-3 territory.
- No matrix support for role-specific estimates beyond the default (`role: ""`) bucket — the model allows it, this UI never writes a non-empty `role`.
- No changes to `server.ts`, `server-validation.ts`, or `prisma/schema.prisma`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty project | `GET .../wbs` returns `[]` | Empty state + "Add root item" button | — |
| Add root item | Click "Add root item" | `createWbsItem(projectId, { name: 'New item', parentId: null, displayOrder })` | request fails → inline error, item not added locally |
| Add child | Click row's "+" | `createWbsItem` with `parentId = row.id`, sibling-computed `displayOrder` | same as above |
| Edit discipline cell | Enter hours for item X, discipline D | `replaceWbsEstimates(X.id, [...otherEstimates, { discipline: D, role: '', hours }])` | 400 (unknown discipline) → inline error, cell reverts |
| Delete item with children | Delete on item with N descendants | `confirm` names N descendants; on OK, `deleteWbsItem(id)`, item + subtree removed locally | user cancels → no call |
| Change phase to Unassigned | Select "Unassigned" | `updateWbsItem(id, { phaseName: null })` | — |
| Rename item | Blur Name input after edit | `updateWbsItem(id, { name })` | blank name → reverts, no call |

</frozen-after-approval>

## Code Map

- `src/utils/wbsTree.ts` (new) -- pure `buildWbsTree`/`flattenVisibleTree`/`rollupHours` helpers
- `src/utils/wbsTree.test.ts` (new) -- unit tests for the above
- `src/components/Wbs.tsx` (new) -- the tree table + estimate matrix component
- `src/components/Wbs.test.tsx` (new) -- component test
- `src/App.tsx` -- 5th tab, `wbsItems` state, `loadProjectData` wiring, handler passthrough
- `src/services/api.ts` -- reused as-is (`getWbsItems`, `createWbsItem`, `updateWbsItem`, `deleteWbsItem`, `replaceWbsEstimates`), no changes

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/wbsTree.ts` -- `buildWbsTree(items)` (assembly from flat `parentId` list), `flattenVisibleTree(tree, collapsedIds)` (depth-annotated rows honoring collapse), `rollupHours(node)` (`Map<discipline, hours>` over own + descendant estimates) -- pure logic backing indentation and Total hours
- [x] `src/utils/wbsTree.test.ts` -- multi-level assembly, orphan/missing-parent items surfaced as roots, collapse hides only descendants, rollup merges same-discipline hours across the subtree -- required coverage for new pure logic
- [x] `src/components/Wbs.tsx` -- flat indented table (name, phase select, per-discipline hour cells, total hours, actions) on the WBS-1 wrapper; add-root/add-child/rename/delete/phase-change/discipline-cell-edit/add-discipline-column handlers -- the page itself
- [x] `src/components/Wbs.test.tsx` -- indentation for a 2-level tree; add-root calls `createWbsItem`; matrix-cell edit calls `replaceWbsEstimates` with the merged set; delete-with-children confirms with descendant count -- locks the component/API contract
- [x] `src/App.tsx` -- import `Wbs`, add `wbsItems` state, fetch via `api.getWbsItems` in `loadProjectData`'s `Promise.all`, add `TabsTrigger`/`TabsContent` (`grid-cols-4` → `grid-cols-5`), pass `project`/`resourcePlans`/`rateCards`/`wbsItems` and CRUD handlers -- wires the page in like the other four tabs

**Acceptance Criteria:**
- Given a project with a 3-level WBS tree, when the WBS tab is opened, then each item renders at an indent proportional to its depth and a parent's Total hours equals the sum of its own + all descendant estimates' hours.
- Given an item with two children, when Delete is clicked and confirmed, then the item and both children disappear from the table and no orphaned rows remain in local state.
- Given the global rate card has entries, when "+ Add discipline" is used, then only disciplines not already shown as a column are offered.
- Given a discipline-column cell is edited for an item that already has a role-specific estimate on a different discipline, when the edit is saved, then that other estimate is preserved (not lost) in the same `replaceWbsEstimates` call.

## Spec Change Log

- **Implementation judgment calls (2026-08-13, non-frozen sections only):**
  - Added `descendantIds(items, id)` to `src/utils/wbsTree.ts`, beyond the three named helpers, so the "confirm names the subtree size" (component) and "cascade the removal through local state after the server confirms it" (`App.tsx`) logic share one pure, unit-tested tree walk instead of two independent implementations. It builds on `buildWbsTree` and is covered in `wbsTree.test.ts` alongside the three named helpers.
  - Added a click-to-collapse toggle (▸/▾) on rows with children, backed by local `collapsedIds` state feeding `flattenVisibleTree`. The Task bullet for `Wbs.tsx` doesn't name a collapse control, but `flattenVisibleTree`'s `collapsedIds` parameter (and its dedicated test coverage requirement) only has a reason to exist if some UI actually drives it; a minimal toggle was the smallest way to make that pure function's second parameter meaningfully reachable rather than permanently defaulted to empty.
  - `Wbs.tsx`'s CRUD handler props (`onAddWbsItem`/`onUpdateWbsItem`/`onDeleteWbsItem`/`onReplaceWbsEstimates`) resolve/reject rather than being fire-and-forget, and `App.tsx`'s implementations both update `wbsItems` state *and* rethrow on failure (mirroring `handleAddRateCard`'s existing "re-throw to be caught by the calling function" convention, not `handleAddResourceList`'s swallow-only one). This was necessary so the component can revert an in-flight name/hours draft on failure — the "cell reverts" / "reverts, no call" edge-case rows aren't achievable if the parent swallows the rejection.
  - "Inline error" in the I/O matrix is realized via the same app-level `error` state/banner every other tab already uses on handler failure (`setError` inside each `App.tsx` handler's `catch`, per the documented `handleResourceListUpdate` convention) — no separate component-local error UI was added, since none of the other four tabs have one either.
  - Discipline matrix columns and the "+ Add discipline" Select's offered options are both alphabetized for deterministic rendering/testing; the spec doesn't state an ordering.
  - A discipline-cell edit always writes the edited `(discipline, role: "")` entry to the merged array (even when the value is `0`), rather than omitting zero-valued rows; simplest rule that satisfies "saving a cell must call `replaceWbsEstimates` with that item's FULL estimate set" without adding unspecified delete-on-zero behavior.

- **Review findings, patched (2026-08-13):**
  - **Lost-update race in `commitHours` (`Wbs.tsx`).** `commitHours` built its "preserve all other estimates" merge from the `node.estimates` prop, a snapshot of the last-rendered `wbsItems` state. Editing two discipline-hour cells on the same row in quick succession (tabbing across a row) let the second `commitHours` call fire before the first's `replaceWbsEstimates` PUT had resolved and updated `wbsItems`; both calls then merged from the same stale snapshot, each omitting the other's just-entered value, and since `replaceWbsEstimates` is a full delete-then-recreate, whichever response was processed last silently discarded the other edit — real, user-reachable data loss. Fixed by serializing `commitHours` per item id: a `commitChainRef` (per-item promise chain) makes calls for the same item run strictly sequentially regardless of network timing, and a `pendingEstimatesRef` (per-item last-merged-result) gives each new edit the prior in-flight edit's result as its merge basis instead of the possibly-stale prop, clearing back to the prop once the chain for that item drains. Covered by a new `Wbs.test.tsx` test using a delayed mock that resolves the first `replaceWbsEstimates` call only after the second has already been triggered, asserting the second (later) call's payload contains both edits. This is a bugfix within the frozen "saving a cell... preserving all other entries untouched" behavior (AC4) — it doesn't change what gets called or when a user-visible commit happens, only how the merge basis and call ordering are computed internally.
  - **"+ Add discipline" dead end when every rate-card discipline is already a column (`Wbs.tsx`).** The control rendered a `Select` whenever `rateCards.length > 0`, regardless of whether `availableDisciplines` (rate-card disciplines not already shown) was non-empty — so once every rate-card discipline had a column, the user got an empty dropdown and a permanently-disabled "Add" button, with no way to add a genuinely new discipline. Fixed by keying the `Select`-vs-`Input` branch off `availableDisciplines.length > 0` instead of `rateCards.length > 0`, reusing the existing free-text `Input` fallback (already used for the empty-rate-card case) for this case too. Also added an `aria-label="New discipline"` to the discipline `SelectTrigger` (it previously had none, unlike the Phase `SelectTrigger`), needed for the new tests to target it reliably and a minor accessibility fix in its own right. This doesn't touch the frozen "`Select` of distinct rate-card disciplines not already shown when the card is non-empty, else a free-text `Input`" rule — `availableDisciplines.length > 0` *is* "the card is non-empty and has an offering," it's a more precise reading of that same rule, not a new one. Covered by a new `Wbs.test.tsx` test asserting the free-text `Input` (not an empty `Select`) renders when all rate-card disciplines are already columns.
  - **Missing test coverage for spec-required behaviors.** The I/O & Edge-Case Matrix and Task bullets required coverage that didn't exist yet: "Add child" setting `parentId` to the row's id, phase change to "Unassigned" calling `updateWbsItem(id, { phaseName: null })`, blank-name-reverts making no call, and both "+ Add discipline" paths (`Select` when rate cards exist, free-text `Input` when they don't) including AC3's "only disciplines not already shown are offered." All added to `Wbs.test.tsx`, no behavior changes. Also added `src/App.wbs.test.tsx` — a sibling to `App.test.tsx` that, unlike it, leaves `./components/Wbs` unmocked so `handleAddWbsItem`/`handleUpdateWbsItem`/`handleDeleteWbsItem`/`handleReplaceWbsEstimates` can be exercised through the real component against mocked `api.*` calls; it covers `handleDeleteWbsItem`'s `descendantIds` cascade (the Spec Change Log's own "load-bearing" callout) plus one lighter test per remaining handler. `App.test.tsx` itself is unchanged and keeps mocking `Wbs`, since its purpose (tab rendering/switching) doesn't need the real component.

## Design Notes

Matrix columns are data-driven (disciplines in use), not the full ~21-entry rate-card taxonomy — same reason `RateCard.tsx` uses a region *tab* filter instead of showing every region at once. An added-but-empty discipline column exists only in local state until a cell gets a value.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no new type errors
- `npm test` -- expected: full suite green, including new `wbsTree.test.ts` and `Wbs.test.tsx`

**Manual checks (if no CLI):**
- Dev server: add a root item, add a child, add a discipline column and enter hours on the child, confirm the parent's Total hours rolls up; delete the parent and confirm both rows vanish.

## Suggested Review Order

**Tree assembly (the shape everything else renders from)**

- Flat `WbsItem[]` → forest via `parentId`; orphaned parents surface as roots rather than vanishing.
  [`wbsTree.ts:24`](../../../src/utils/wbsTree.ts#L24)

- Pre-order flatten with a `collapsedIds` filter — the indent table's actual row list.
  [`wbsTree.ts:59`](../../../src/utils/wbsTree.ts#L59)

- Per-discipline hour rollup (own + all descendants) — backs the read-only Total hours column.
  [`wbsTree.ts:82`](../../../src/utils/wbsTree.ts#L82)

**Estimate matrix — the lost-update fix**

- `commitHours` merges against a pending-commit ref (not the possibly-stale prop) and chains same-item requests sequentially, closing a real data-loss race from editing two cells on one row quickly.
  [`Wbs.tsx:193`](../../../src/components/Wbs.tsx#L193)

- Discipline columns are data-driven (in-use ∪ manually-added), not the full rate-card taxonomy.
  [`Wbs.tsx:92`](../../../src/components/Wbs.tsx#L92)

- "+ Add discipline" now falls back to free text whenever no *unused* rate-card discipline remains, not just when the card is empty — closes the dead-end found in review.
  [`Wbs.tsx:97`](../../../src/components/Wbs.tsx#L97)

**Tree actions**

- Client-computed `displayOrder` (max sibling + 1) — the API doesn't auto-increment it.
  [`Wbs.tsx:119`](../../../src/components/Wbs.tsx#L119)

- Delete confirmation names the subtree size before calling the API, since the DB cascade is silent.
  [`Wbs.tsx:144`](../../../src/components/Wbs.tsx#L144)

- The table itself: name/phase/discipline cells, indent, actions — the page's render surface.
  [`Wbs.tsx:326`](../../../src/components/Wbs.tsx#L326)

**App wiring**

- WBS items fetched alongside the plan/list data, project-scoped like everything else.
  [`App.tsx:99`](../../../src/App.tsx#L99)

- Four CRUD handlers — each updates local state and rethrows, so `Wbs.tsx` can revert an in-flight edit on failure.
  [`App.tsx:335`](../../../src/App.tsx#L335)

- Fifth tab wired in exactly like the other four (`grid-cols-4` → `grid-cols-5`).
  [`App.tsx:1153`](../../../src/App.tsx#L1153)
  [`App.tsx:1236`](../../../src/App.tsx#L1236)

**Peripherals**

- Unit coverage for the tree helpers: multi-level assembly, orphan-as-root, collapse-hides-descendants, rollup merge.
  [`wbsTree.test.ts`](../../../src/utils/wbsTree.test.ts)

- Component coverage, including the race-condition regression test (delayed mock, asserts neither edit is lost) and the "+ Add discipline" dead-end regression test.
  [`Wbs.test.tsx`](../../../src/components/Wbs.test.tsx)

- App-level coverage for the four handlers, in particular the cascading local-state delete via `descendantIds`.
  [`App.wbs.test.tsx`](../../../src/App.wbs.test.tsx)
