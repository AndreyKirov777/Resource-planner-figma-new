---
title: 'WBS-2R — WBS Table Redesign (Glide Grid, Role×Hours Cells)'
type: 'refactor'
created: '2026-08-13'
status: 'done'
baseline_commit: '2cde1e79f0f0caba9e567b0c60e5228a5510c5fa'
context: ['{project-root}/docs/bmad-archive/implementation-artifacts/spec-wbs-2-wbs-page-ui.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The WBS page from WBS-2 reads as a control panel, not a WBS document: a dynamically-widening "discipline × hours" matrix with an "+ Add discipline" flow, a phase `Select` on every row, and three buttons per row.

**Approach:** Rewrite `Wbs.tsx` as a five-column `@glideapps/glide-data-grid` grid — `WBS · Task Description · Phase · Roles · Hours` — collapsing all hours into one composite role×hours cell, inheriting phase down the tree, moving row actions to a selection-driven toolbar, and folding reconciliation into a collapsed summary strip.

## Boundaries & Constraints

**Always:**

- Follow `ResourcePlan.tsx`'s established `DataEditor` usage: mandatory `dist/index.css` import, `GridColumn[]` in a `useMemo`, stable `useCallback`s for `getCellContent`, renderers via the `customRenderers` prop, and a wrapper `div` with a **computed pixel height** — the grid never grows to fit content, so height must recompute when collapse/expand changes the visible row count.
- **WBS** = outline number (`1`, `1.1`, `1.2.2.1`) from tree position, never persisted.
- **Phase** inherits: `null` means "inherit from the nearest ancestor that sets one"; only a row with no ancestor value is Unassigned. Inherited renders de-emphasised, explicit renders normally.
- **Roles** holds role×hours pairs (`BA ×16, UX ×8`). Role is picked from the global rate card and its `discipline` derived from the same row via the existing `resolveDiscipline` — never typed by hand. Empty rate card falls back to free text, mirroring the server's own bypass in `validWbsDisciplines`, so an un-imported card can't block work.
- **Hours** is the read-only own+descendants rollup (existing `rollupHours`), never persisted.
- Outline numbering and phase resolution are pure, unit-tested functions in `src/utils/wbsTree.ts` (repo rule: pure `src/utils/` logic carries tests). Both are derived state and must stay derived.
- `buildReconciliationReport` receives **effective** (inherited) phase names — resolve before the call. `wbs.ts` keeps its signature and stays reconciliation-only; do not teach it to walk the tree.
- The pair editor is a **standalone component** passed to `provideEditor`, not inline JSX inside the renderer, so it carries its own tests.
- Cell-content derivation, commit/merge and delete-with-cascade live in a module that does not import the grid; `Wbs.tsx` is a thin adapter. Canvas cells are unreachable from Testing Library, so logic left in the component is permanently untestable.
- Row actions (add child, delete) move to the toolbar, acting on `gridSelection`; delete still confirms with the descendant count.
- Reconciliation moves into a `Collapsible`, closed by default, its trigger showing `WBS 128 h · Plan 96 h · +32`, reusing `ResourcePlan.tsx:1393-1416`.
- The per-item commit serialization (`commitChainRef` / `pendingEstimatesRef`) must survive — it fixes a real lost-update race where two quick edits to one row each merge against a stale snapshot and clobber one another.

**Ask First:**

- If outline numbering or phase inheritance appears to need a new DB column.
- If the roles editor seems to need a new endpoint — the WBS-1 wrapper is sufficient.
- If `getRowThemeOverride` can't produce the section-row styling and the fallback would mean forking `ui/` primitives.

**Never:**

- No `notes` column and **no schema, `server.ts` or `server-validation.ts` changes at all** — this slice is purely front-end. `notes` split out 2026-08-13; see `deferred-work.md`.
- No keyboard outliner (Enter/Tab/Shift+Tab), no reparenting UI, no cycle guards — split out 2026-08-13. `parentId` is still set once at creation.
- No export/import or `schemaVersion` changes, no new or changed routes, no `WbsEstimate` model changes, no changes to `buildReconciliationReport`'s logic or output shape.
- No AG Grid, no third grid library, no edits to `src/components/ui/` primitives.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                     | Expected Output / Behavior                                                              | Error Handling                       |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Outline numbering         | 3-level tree, siblings by `displayOrder`          | `1`, `1.1`, `1.1.1`, `1.2`, `2` — depth-first, 1-based, dot-joined                          | N/A                                  |
| Collapsed subtree         | Root collapsed                                     | Descendants hidden, numbers unchanged, container height shrinks                            | N/A                                  |
| Phase resolution          | Root `"Phase 1"`; child `null`; sibling `"Phase 2"` | Child inherits `Phase 1` (faded); sibling uses `Phase 2` for its own subtree (normal)       | N/A                                  |
| Phase absent or stale     | Root `null`, or a name matching no project phase   | Renders `Unassigned`; hours land in reconciliation's `Unassigned` bucket (WBS-3 behaviour)  | N/A                                  |
| Add a role×hours pair     | Rate card non-empty, role picked, hours entered    | `replaceWbsEstimates` with the full merged set; discipline derived from the rate-card row   | Surfaces via app-level error banner  |
| Two rapid edits, same row | Two pairs edited before the first request settles  | Both survive — second merges against the first's result, requests strictly sequential        | A failure must not block later edits |
| Empty rate card           | `GlobalRateCard` has no rows                       | Role falls back to free text; the server's empty-card bypass accepts it                     | N/A                                  |
| Hours rollup              | Parent with estimates on two descendants           | Parent's `Hours` = own + all descendants, all roles merged                                  | N/A                                  |
| Invalid hours             | Blank, negative, or non-numeric                    | Blank → `0`; negative/non-numeric reverts                                                   | No request issued                    |
| Delete with descendants   | Selected row has N descendants                     | Confirm names N, then deletes; local state drops the whole subtree                          | Cancel makes no call                 |
| No selection              | Toolbar delete / add-child with nothing selected   | Those actions are disabled                                                                  | N/A                                  |

</frozen-after-approval>

## Code Map

- `src/components/Wbs.tsx` — full rewrite; holds the matrix and per-row controls being removed.
- `src/components/RolesEditor.tsx` — **new**; the role×hours overlay editor.
- `src/utils/wbsTree.ts` — add outline numbering + effective-phase resolution beside `buildWbsTree` / `flattenVisibleTree` / `rollupHours` / `descendantIds`.
- `src/utils/wbs.ts` — **logic unchanged**; only its caller changes.
- `src/components/ReconciliationPanel.tsx` — internals unchanged; gains a summary line for the trigger.
- `src/components/ResourcePlan.tsx:116-174` — `RoleCellRenderer`. **Do NOT copy this as-is.** It is dead code that has never executed (never registered in any `customRenderers`), and its shape is *broken* for a portaling menu: see "Overlay editor semantics" in Design Notes before writing any `provideEditor`. Useful only as an illustration of the `isMatch`/`draw`/`provideEditor` triple.
- `node_modules/@glideapps/glide-data-grid/dist/esm/internal/click-outside-container/click-outside-container.js` — read it. It is 30 lines and it explains why an overlay containing a portaled dropdown dismisses itself.
- `src/components/ui/select.tsx:64` — `SelectContent` renders inside `SelectPrimitive.Portal`, i.e. into `document.body`, outside the overlay's wrapper. This is the other half of the same problem.
- `index.html:8-15` — `#portal` is `z-index: 1000`; Radix content is `z-50`, so a dropdown opened inside an overlay also paints *behind* it.
- `src/components/ResourcePlan.tsx:1393-1416` — the `Collapsible` pattern to copy.
- `src/components/ResourcePlan.test.tsx:6-12` — the `vi.mock` that neutralises Glide under jsdom.
- `src/components/Wbs.test.tsx`, `src/App.wbs.test.tsx` — rework: 4 tests target the deleted matrix, 9 assert in-grid DOM that canvas makes unreachable.

## Tasks & Acceptance

**Execution:**

- [x] `src/utils/wbsTree.ts` -- add outline numbering (tree → id-keyed strings) and effective-phase resolution -- derived state, kept pure and out of the component.
- [x] `src/utils/wbsTree.test.ts` -- cover both, including the Matrix rows for numbering, inheritance, override and absent/stale.
- [x] `src/components/RolesEditor.tsx` -- new overlay editor with rate-card picker and free-text fallback -- extracted so it survives the canvas.
- [x] `src/components/RolesEditor.test.tsx` -- add/edit/remove, discipline derivation, invalid-hours rejection, empty-card fallback, two-rapid-edits race.
- [x] `src/components/Wbs.tsx` -- rewrite onto `DataEditor`: five columns, custom renderers for Task Description (indent + chevron) and Roles (chips), `getRowThemeOverride` for root section rows, toolbar actions on `gridSelection`, reconciliation in a `Collapsible` -- the core of this slice.
- [x] `src/components/Wbs.test.tsx`, `src/App.wbs.test.tsx` -- rework: delete the 4 matrix tests, move indent-depth to the pure suite, move estimate-merge and the race to `RolesEditor.test.tsx`, re-target the rest at the toolbar and the extracted model.

**Acceptance Criteria:**

- Given a multi-level WBS, when the tab opens, then every row shows its outline number, indent, effective phase, role×hours chips and rolled-up hours, and no discipline columns exist anywhere.
- Given a non-empty rate card, when a role is assigned, then the persisted estimate carries that role's rate-card discipline, and reconciliation figures match what the old matrix produced for the same hours.
- Given a parent with an explicit phase and children with none, when reconciliation runs, then the children's hours are attributed to the parent's phase, not to Unassigned.
- Given the page loads, then reconciliation is collapsed and its trigger shows the WBS/plan/variance summary.
- Given `npm test` and `npm run typecheck`, then both pass with no test asserting against deleted matrix UI.

## Spec Change Log

- **Loopback 1 → iteration 2 (2026-08-13). Classification: `bad_spec`.**

  **Triggering findings.** Four independent reviewers (blind adversarial ×2, edge-case, acceptance) converged on one root cause with six shipped symptoms, all confirmed by reading the vendored sources rather than by inference: the role picker and the phase picker were **completely non-functional** (portaled Radix menu dismissed the Glide overlay on `mousedown` before `onValueChange` could fire); Enter and Tab **silently discarded** typed hours (Glide `preventDefault`s both, so the blur-only commit never ran); Escape and outside-click lost drafts the same way; blank *and* unparseable hours both persisted as `0`, violating the frozen Matrix row that requires a revert for non-numeric; and a rejected write left local state optimistically wrong, so a later unrelated edit could resurrect the rejected value through the full-set replace. Neither of Glide's two escape hatches (`isOutsideClick`, `click-outside-ignore`) appeared anywhere in the code.

  **Why `bad_spec` and not `patch`.** The root cause sits outside the frozen block, in this spec's own Code Map and Design Notes: they named `ResourcePlan.tsx:116-174` as the template to copy while noting, without drawing the conclusion, that it is **dead code that has never executed**. The spec then said nothing about how an overlay editor commits or how it dismisses. Six defects from one unaddressed design dimension is precisely the case where patching symptoms produces incoherent code.

  **What was amended.** Code Map: the `RoleCellRenderer` entry now carries an explicit do-not-copy warning plus pointers to the three files that explain the failure (`click-outside-container.js`, `ui/select.tsx:64`, `index.html`'s `#portal` z-index). Design Notes: a new "Overlay editor semantics" section with five non-negotiable rules, plus eight additional correctness requirements drawn from the same review round (height clamp, indent clamp, hours rounding, stale-phase → Unassigned, expand-on-add-child, chip/text clipping, duplicate-role handling, selection invalidation). The frozen block was **not** touched — the contract was correct; the guidance was not.

  **Known-bad state avoided.** Re-deriving against the unamended spec would reproduce the inert pickers verbatim, because the spec actively pointed at the broken pattern as the thing to copy.

  **KEEP — these worked and must survive re-derivation:**
  - The module split. `src/utils/wbsGrid.ts` (grid-free model: `buildGridRows`, converters, `parseHours`, `nameEditFor`/`phaseEditFor`, `nextDisplayOrder`, `deleteConfirmMessage`, `createEstimateCommitter`) plus tree-shaped primitives staying in `wbsTree.ts`. The acceptance audit confirmed all 12 "Always" bullets honoured through this shape.
  - `createEstimateCommitter` **instantiated once in `Wbs.tsx` and passed to the editor as a prop**, never owned by the editor — the overlay unmounts on every close, and an editor-owned committer would reset the chain and reintroduce the lost-update race the guard exists to close.
  - `withEffectivePhases` resolving inheritance *before* `buildReconciliationReport`, leaving `wbs.ts` untouched. Its 13 tests passed unmodified; that must remain true.
  - The test harness approach: mock `DataEditor` with a component that routes through the component's **real** `getCellContent` / `onCellEdited` / `onGridSelectionChange`, rather than a bare stub. The audit verified these tests genuinely fail when the implementation is gutted.
  - The five-column layout, `getRowThemeOverride` section rows, toolbar-on-`gridSelection` actions, and the `Collapsible` reconciliation strip with its summary trigger — all verified correct.
  - Strict adherence to the "Never" list: `prisma/schema.prisma`, `server.ts`, `server-validation.ts`, `src/utils/wbs.ts` and `src/utils/wbs.test.ts` were confirmed byte-identical to the baseline. Keep it that way.
  - **Write source files as plain UTF-8 text.** Iteration 1 emitted a raw `NUL` byte into `RolesEditor.tsx` as a key separator, which made git treat the file as binary and silently excluded it from code review. Write it as the six-character escape sequence, never as the byte itself.

- **Implementation judgment calls, iteration 2 (2026-08-13, non-frozen sections only):**
  - **`NameEditor` and `PhaseEditor` ship inside `RolesEditor.tsx`, not in files of their own.** Task Description and Phase are custom cells (indent + chevron; inherited-vs-explicit tinting), and a custom renderer's overlay has no editor unless its own `provideEditor` supplies one — so both needed real editors, and both are subject to the same five overlay rules as the roles editor. They live beside `RolesEditor` because they share its dismissal guards (`CLICK_OUTSIDE_IGNORE`, `OVERLAY_MENU_CLASS`, `isInsidePortaledMenu`); splitting them would have duplicated those or created a fourth module to hold them. All three are standalone components with their own tests, which is what the frozen bullet requires.
  - **Both of Glide's escape hatches are applied, not one.** The spec offers `isOutsideClick` *or* the `click-outside-ignore` class. They guard different code paths (`DataEditor` prop vs. the container's own ancestor walk) and are each one line, so both are used. The z-index fix rides on the same class: Radix copies its content's computed z-index onto `[data-radix-popper-content-wrapper]`, so `z-[1100]` on `SelectContent` is what actually lifts the menu above `#portal`'s `1000`.
  - ~~**Escape commits the pending draft rather than blocking the close.**~~ **SUPERSEDED 2026-08-13.** This was iteration 2's reading of Rule 3, and it made *every* exit path commit, leaving no way at all to abandon an edit in progress. Two reviewers flagged it and the user decided: **Escape cancels and discards; every other path (Enter, Tab, Done, blur, outside-click) still commits.** Rule 3 in Design Notes has been reworded so a future re-derivation cannot reinstate the old behaviour. A non-numeric draft still reverts with a visible message, per the frozen Matrix.
  - **`formatHours` moved from `ReconciliationPanel.tsx` into `wbsGrid.ts`, imported back by the panel.** The "round hours for display, matching `ReconciliationPanel.formatHours`" requirement needs one implementation, not two; it is now a pure, unit-tested util per the repo rule. Behaviour is byte-identical and `ReconciliationPanel.test.tsx` passes unmodified. The panel also gained the exported `reconciliationSummary(report)` that builds the collapsed trigger's `WBS … · Plan … · ±…` line, reusing its own variance formatting.
  - **`pairKey` is `JSON.stringify([discipline, role])`.** `role` alone is not a unique key: the pre-redesign matrix wrote one `(discipline, role: '')` row per discipline, so an item can hold several pairs with an empty role. This is also the key separator that iteration 1 emitted as a raw `NUL`; JSON keeps it unambiguous and plain text.
  - **`effectivePhases`/`withEffectivePhases` take the project's live phase names.** Iteration 1's one-argument `withEffectivePhases(items)` could not implement the "stale phase renders Unassigned" requirement, since staleness is only definable against the current phase list. A stale name is now treated exactly as `null`: it neither renders verbatim nor propagates down the subtree. Passing no list disables the check, which keeps pure-inheritance tests readable.
  - **`src/components/gridTheme.ts` extracted** (optional, carried over from iteration 1): the 25-key theme object was byte-identical in `ResourcePlan.tsx` and `ClientView.tsx`; all three grids now import `GRID_THEME`. Verbatim move, no appearance change. Note `ResourcePlan.tsx` is CRLF — edits must preserve it or the diff becomes unreviewable.
  - **Commits are issued off the per-item promise chain, so the first request lands on a microtask** rather than synchronously. Ordering and payloads are unaffected; `basisFor` is still updated synchronously, which is what closes the stale-snapshot half of the race.

- **Implementation judgment calls (2026-08-13, non-frozen sections only) — from iteration 1, retained for context:**
  - **New module `src/utils/wbsGrid.ts` (+ `wbsGrid.test.ts`), not named in the Code Map.** Boundaries require "cell-content derivation, commit/merge and delete-with-cascade live in a module that does not import the grid"; the Code Map named no such file, so one was added beside `wbsTree.ts`. It holds `buildGridRows` (the single pass that combines tree assembly, outline numbers, phase inheritance, role pairs and the hours rollup into one row shape), the pair/payload converters, `parseHours`, `nameEditFor`/`phaseEditFor`, `nextDisplayOrder`, `deleteConfirmMessage` and `createEstimateCommitter`. `wbsTree.ts` kept only the tree-shaped primitives the spec named for it.
  - **`withEffectivePhases(items)` added to `wbsTree.ts`** alongside `outlineNumbers`/`effectivePhases`. The frozen rule is that `buildReconciliationReport` receives *effective* phase names and that `wbs.ts` must not learn to walk the tree; this is the one-line adapter that resolves inheritance before the call, kept pure and unit-tested rather than inlined in the component.
  - **The commit serializer lives in `Wbs.tsx`, not in `RolesEditor`.** The `commitChainRef`/`pendingEstimatesRef` pair from WBS-2 became `createEstimateCommitter`, instantiated once in `Wbs.tsx` and passed to `RolesEditor` as a prop. It cannot live inside the editor: `provideEditor` mounts and unmounts it on every overlay open/close, which would reset the chain and reintroduce the exact lost-update race the guard exists to close. `RolesEditor` seeds its draft from `committer.basisFor(...)` for the same reason.
  - **Discipline for a free-text role is the role itself.** `deriveDiscipline` returns `resolveDiscipline(role, rateCards) || role`. With an empty rate card nothing resolves, but `wbsEstimateSchema` requires `discipline: min(1)`, so a constant was needed; the role is the only non-arbitrary one available and the server's empty-card bypass accepts it. With a non-empty card the role always comes from the picker, so this branch is unreachable there.
  - **Roles are edited as a whole set, not cell-by-cell.** Because the Roles cell is composite, `RolesEditor` holds every pair for the row, and each mutation persists the item's full estimate set — which is what "`replaceWbsEstimates` with the full merged set" means once there is no per-discipline column to merge against.
  - **Toolbar selection is cleared when the visible row set changes** (collapse/expand, and after a successful delete). `gridSelection` is a row *index*, so hiding or revealing rows would silently re-point it at a different item while the toolbar's Delete acts on it.
  - **`src/components/gridTheme.ts` extracted** (explicitly allowed as optional): the 25-key Glide theme object was byte-identical in `ResourcePlan.tsx` and `ClientView.tsx`; both now import `GRID_THEME`, as does the new grid. Verbatim move, no appearance change.
  - **Test harness instead of a bare grid stub.** `Wbs.test.tsx` and `App.wbs.test.tsx` mock `DataEditor` with a component that reads each row through the real `getCellContent` and exposes buttons firing the real `onGridSelectionChange`/`onCellEdited`/committer callbacks. Canvas cells are unreachable from Testing Library, but the component's wiring still is; the alternative was deleting the re-targeted tests outright.
  - **Test disposition:** the 4 discipline-matrix tests were deleted; indent-depth moved to `wbsTree.test.ts`; the estimate-merge and two-rapid-edits tests moved to `RolesEditor.test.tsx` (the race now uses two pairs on one row, its natural post-redesign shape); phase/name/+Child/delete-confirm were re-targeted at the toolbar, `onCellEdited` and `wbsGrid.ts`. The Radix pointer-capture polyfill block was removed from both files (no Radix `Select` renders once the overlays are unmounted) and now lives only in `RolesEditor.test.tsx`.

## Design Notes

**Discipline derivation** — the Roles cell picks a role and takes the discipline from the same rate-card row, mirroring what reconciliation already does on the plan side:

```ts
// wbs.ts already exports this; the Roles editor uses it in the same direction
const discipline = resolveDiscipline(role, rateCards); // rateCards.find(rc => rc.role === role)?.discipline
```

Because the discipline is never typed by a human it cannot drift from the rate card, which is what keeps `validWbsDisciplines` and per-discipline reconciliation working unchanged.

**Phase inheritance** — walk up until a non-null `phaseName` is found:

```
root "Phase 1"      → Phase 1  (explicit)
  child null        → Phase 1  (inherited, faded)
    grandchild null → Phase 1  (inherited)
  child "Phase 2"   → Phase 2  (explicit — overrides its own subtree)
root null           → Unassigned
```

**Overlay editor semantics — the part that was missing and broke the first attempt.** Glide's `provideEditor` overlay is hostile to the two things this design needs (a portaled dropdown, and multi-field editing). All five rules below are non-negotiable; each was a shipped defect in iteration 1.

1. **A portaled menu inside an overlay dismisses the overlay before it can commit.** `ClickOutsideContainer` registers a *capture-phase* `document` `mousedown` listener and fires `onClickOutside` for any target not inside its `wrapperRef`. Radix `SelectContent` portals to `document.body`, so mousedown on an option closes the overlay before `pointerup` — `onValueChange` never fires and the picker is inert. Fix with **one** of Glide's two escape hatches: pass `isOutsideClick` to `DataEditor` so it returns false for `[data-radix-popper-content-wrapper]` targets, or put the `click-outside-ignore` class on the portaled content. Also raise the menu above `#portal`'s `z-index: 1000`.
2. **Commit must not hang on `onBlur` alone.** Glide's overlay `onKeyDown` calls `preventDefault()` for Enter and Tab, so focus never moves and no `blur` fires; React does not fire `blur` on unmount either. Every editor must commit on Enter, Tab, and explicit Done — handling those in its own `onKeyDown` and calling `stopPropagation()` — in addition to blur.
3. **Closing must never *silently* discard a typed draft.** Blur, outside-click and Done unmount the editor, and anything typed but uncommitted dies with it unless flushed — flush it. **Escape is the one exception: it must cancel and discard** (user decision, 2026-08-13). That is not a silent loss but an explicit cancel gesture, and it is the only way to abandon an edit in progress; without it every path commits and there is no way out. Iteration 2 initially made Escape commit as well, which is why this rule now says so explicitly.
4. **Blank is not the same as invalid.** `<input type="number">` reports `''` for *any* unparseable content (`1e`, `1.2.3`, `-`, `1,5`, pasted text), so a numeric input cannot distinguish "cleared" from "typed garbage" — and the frozen Matrix requires different outcomes (`0` versus revert). Use a text input with `inputMode="decimal"` and validate the raw string, or track validity separately. Never let unparseable input silently persist as `0`.
5. **A failed write must roll local state back.** Optimistically keeping a rejected value is worse than a visible failure here: the next edit sends the item's *entire* estimate set built from that phantom basis, so one rejected write can resurrect itself through an unrelated later edit.

**Additional correctness requirements** (each a confirmed iteration-1 defect):

- Clamp the container height — it is `f(row count)` with no ceiling, and past roughly 480 rows it exceeds the browser's maximum canvas dimension and renders blank.
- Clamp indent depth. `depth * INDENT_PX` unclamped pushes the label and the chevron out of the column; past ~depth 25 the node can never be expanded again because the hit test can no longer be satisfied inside the column.
- Round hours for display, matching `ReconciliationPanel.formatHours` (1 decimal). Raw floats otherwise render as `0.30000000000000004` in the grid while the summary strip shows `0.3`.
- A stale `phaseName` (naming no current project phase) must render as `Unassigned`, per the frozen Matrix. Rendering it verbatim also makes it inherit down the subtree and leaves the phase picker showing a value absent from its own options.
- `+ Child` on a collapsed parent must expand that parent, or the new row is invisible and the user creates duplicates.
- Clip cell text and chips to the column. A first chip wider than the cell must still be clipped, not painted over the neighbouring column.
- Adding a role that is already present must not silently overwrite its hours — either exclude present roles from the picker or make the overwrite explicit.
- Invalidate the toolbar selection whenever the visible row set changes; it is a row *index*, so it silently re-points at a different item otherwise.

**Glide specifics, verified against v6.0.3 before writing this spec:**

- `getRowThemeOverride` exists as `(row: number) => Partial<Theme> | undefined` — the intended hook for section-row tinting.
- For the chevron prefer the **renderer-level** `onClick`, whose `posX`/`posY` are already cell-local, over grid-level `onCellClicked` where you would do bounds math yourself.
- Custom cells must supply `copyData: string`. Use the exported `measureTextCached` and `getMiddleCenterBias` for chip layout and vertical centring rather than hand-rolling text metrics.
- `ActionCellRenderer.draw` in `ResourcePlan.tsx` mutates `ctx.font`/`textAlign`/`textBaseline` **without** save/restore; copying that shape bleeds styling into neighbouring cells. Wrap draws in `ctx.save()`/`ctx.restore()`.
- `@glideapps/glide-data-grid-cells` is **not** installed — there is no built-in dropdown or tags cell to lean on.

## Verification

**Commands:**

- `npm run typecheck` -- expected: clean. `npm run build` does **not** type-check, so this is the only compile gate.
- `npm test` -- expected: all suites pass, including reworked `Wbs`/`App.wbs` and the new `RolesEditor`/`wbsTree` cases.
- `npx vitest run src/utils/wbs.test.ts` -- expected: the 13 existing reconciliation tests pass **unmodified**, proving the engine's contract was not disturbed.

**Manual checks:**

- Collapse a root row: descendants hide and the container height shrinks to match.
- Assign two roles with different hours to one item: chips render both, `Hours` shows their sum, and the reconciliation summary moves by that amount.
- Edit two role pairs on the same row in quick succession: both persist after reload.

**Manual checks that are the ONLY possible coverage.** These three sites cannot be unit-tested in this project: the test harness mocks `DataEditor`, so Glide's real overlay never mounts, and jsdom has no canvas. Mutation probes deleting `stopPropagation()`, `ctx.clip()` and `isOutsideClick` all passed the full suite. Do not paper over this with tests that appear to cover it — run these by hand instead, and treat a regression here as invisible to CI.

1. **Portaled menu survives the click.** Open the Roles overlay, open the role menu, click an option — the overlay must stay open and the value must commit. (This exact interaction was completely broken in iteration 1.)
2. **Keys act on the menu, not the grid.** With the role menu open, press Enter and Escape — each must act on the menu, not on the overlay behind it or the grid behind that. Repeat for the Phase overlay.
3. **Name edit keys don't leak.** In a name edit, Enter and Tab must commit without also moving the grid cursor.
4. **Escape cancels.** Type into any editor, press Escape — the edit is discarded, and reopening shows the original value.
5. **Chips are clipped, not overflowing.** A role chip wider than the Roles column must be cut at the column edge, never painted over `Hours`.
6. **Overflow is honest.** A row with more roles than fit shows `+N`, and N matches the number actually hidden.
7. **Deep nesting stays usable.** Nest an item past the indent clamp and confirm its chevron is still inside the column and still toggles.

## Suggested Review Order

**Start here — the shape of the change**

- One pass turns the item tree into rendered rows: outline number, inherited phase, role pairs, rollup.
  [`wbsGrid.ts:173`](../../../src/utils/wbsGrid.ts#L173)

- The component is a thin adapter over that model; everything below hangs off these props.
  [`Wbs.tsx:364`](../../../src/components/Wbs.tsx#L364)

**Overlay editor semantics — where iteration 1 failed, read closely**

- Both Glide escape hatches in one constant; without it the role picker is completely inert.
  [`RolesEditor.tsx:36`](../../src/components/RolesEditor.tsx#L36)

- The other half: tells Glide a click inside a portaled menu is not an outside click.
  [`Wbs.tsx:606`](../../../src/components/Wbs.tsx#L606)

- Writes replay as mutators over a known-good basis, so a rejection can't undo a newer edit.
  [`RolesEditor.tsx:153`](../../src/components/RolesEditor.tsx#L153)

- Queue replay itself — the subtlest code here, and the fix for the resurrection bug.
  [`wbsGrid.ts:62`](../../../src/utils/wbsGrid.ts#L62)

- Per-item serialization carried over from WBS-2; still the guard against lost updates.
  [`wbsGrid.ts:360`](../../../src/utils/wbsGrid.ts#L360)

- Free text only when the card is genuinely empty; exhausted is a distinct, non-failing state.
  [`RolesEditor.tsx:252`](../../src/components/RolesEditor.tsx#L252)

**Correctness fixes worth confirming**

- Edits resolve by the id captured when the overlay opened, never by row index.
  [`Wbs.tsx:566`](../../../src/components/Wbs.tsx#L566)

- Blank yields 0, unparseable reverts — the reason these are text inputs, not `type="number"`.
  [`wbsGrid.ts:239`](../../../src/utils/wbsGrid.ts#L239)

- Clearing a phase that no longer exists must still issue a write, or the dead name is permanent.
  [`wbsGrid.ts:296`](../../../src/utils/wbsGrid.ts#L296)

- Depth clamp lives here, not in the component, so the clamp is actually testable.
  [`wbsGrid.ts:432`](../../../src/utils/wbsGrid.ts#L432)

**Derived state — pure, and the reason reconciliation still works**

- Phase inheritance resolved before the report, leaving `wbs.ts` and its 13 tests untouched.
  [`wbsTree.ts:171`](../../../src/utils/wbsTree.ts#L171)

- Walks up to the nearest ancestor that sets a phase; stale names fold to Unassigned.
  [`wbsTree.ts:140`](../../../src/utils/wbsTree.ts#L140)

- Positional outline numbers, never persisted.
  [`wbsTree.ts:103`](../../../src/utils/wbsTree.ts#L103)

**Canvas rendering — no test can reach these; see the manual checks above**

- Indent, chevron and hit region; the chevron test is bounded on both axes.
  [`Wbs.tsx:155`](../../../src/components/Wbs.tsx#L155)

- Chip layout with an honest `+N` when roles are hidden.
  [`Wbs.tsx:272`](../../../src/components/Wbs.tsx#L272)

- Section tinting for root rows, via `getRowThemeOverride`.
  [`Wbs.tsx:594`](../../../src/components/Wbs.tsx#L594)

**Peripherals**

- Grid theme extracted verbatim from two components that held byte-identical copies.
  [`gridTheme.ts:1`](../../../src/components/gridTheme.ts#L1)

- Harness routes through the real `getCellContent`/`onCellEdited`, not a bare stub.
  [`Wbs.test.tsx:1`](../../../src/components/Wbs.test.tsx#L1)

- Overlay commit paths, Escape-cancels, and the concurrent-rejection ordering tests.
  [`RolesEditor.test.tsx:1`](../../src/components/RolesEditor.test.tsx#L1)
