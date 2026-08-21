# SVAR React Gantt — integration contract

Companion to `SPEC.md`. What the library gives us, what is proven, what is not, and what to do about it.

## Package

`@svar-ui/react-gantt` 2.7.x, **MIT**, peer React >= 18, TypeScript types shipped, DOM + one SVG overlay for links, ~90 kB gz plus ~5 kB gz for `style.css`. Core store is `@svar-ui/gantt-store` (also MIT).

**Not** `wx-react-gantt` — that is the pre-2.3 name, deprecated, last published 2025-02, GPLv3. Installing it by mistake changes the licence of the build.

## The docs contradict themselves; the code decides

On 2026-08-21 the vendor's API page for `resources` carried a "PRO Edition only" badge while the pricing page listed "Ability to assign resources to tasks" as open-source. The tarballs were unpacked to settle it.

**Verified present and implemented in the MIT build:**

| Thing | Evidence |
|---|---|
| `IConfig.resources`, `IConfig.assignments` | `@svar-ui/gantt-store` 2.7.1 type declarations |
| Many resources per task | `_assignments.byTask` is `Record<TID, IAssignment[]>` — an array per task |
| `IAssignment` | `{ id, task, resource, units?, start?, end?, data? }` |
| `getTaskResources(id)` | store API |
| `add-assignment` / `update-assignment` / `delete-assignment` | actions in the React dist |
| Resources tab in the editor | combo picker that filters out already-assigned resources |
| Avatar-group grid cell | renders the assignees of a row |
| `ResourceLoad` | component with overload computation (`percent > 100 → wx-overload`) |

**Verified free and used by this spec:** `columns` with React `cell` and `editor` components, `highlightTime(date, unit) → cssClass`, `taskTemplate`, `Toolbar`, `ContextMenu`, `Tooltip`, `Fullscreen`, `api.on` / `api.intercept` / `api.exec`, `RestDataProvider`.

**Present in the build but unverified at implementation level:** `markers`, `baselines`, `undo`, `criticalPath` — the config keys exist despite the docs calling them PRO. This spec does not depend on any of them.

**Rule that follows:** settle every feature you intend to depend on by running it. The vendor comparison table is not evidence in either direction.

## Why we still don't use the built-in resource model as storage

SVAR expresses an assignment as **resource + percentage**; this app estimates in **role + hours**, with discipline derived from the rate card. Letting SVAR own that relationship would make hours a derived value and break the WBS-3 reconciliation contract, the WBS-4 export/import shape and the server's `.strict()` schemas.

So: the built-in mechanism may be used **as a view, never as storage**. If adopted, feed it

```
resources   ← ResourceList rows (id, name = role, plus rate/location in `data`)
assignments ← derived from WbsEstimate: { task, resource, units, data: { hours } }
units        = hours / (periodCount × hoursPerPeriod) × 100
```

with `data.hours` carrying the truth, and write back through the existing `replaceWbsEstimates`. Role *picking* stays with `RolesEditor` (SPEC constraint) — this is only about display: the avatar-group column reads better than text chips in Schedule mode's narrow left grid.

## Known open issues to reproduce in the spike

| Issue | Symptom | Consequence if real |
|---|---|---|
| #10 | horizontal scroll freezes | blocks Slice A — no workaround |
| #14 | timeline header drifts out of sync with grid lines, cumulatively | blocks Slice A — misalignment invalidates the whole read |
| #20 | crash on `move-task` when dragging rows | already mitigated: row drag-to-restructure is **off** in Schedule mode for the first release; indent/outdent stay on the menu and keyboard |

Roughly half of the project's 29 issues are open and maintainer response is slow, so treat an unreproduced bug as unresolved rather than fixed.

## Integration points

- **Phase bands** come from `highlightTime(date, unit)` returning a per-phase CSS class; SVAR's own vertical `markers` are not relied on. Today's date, if wanted, uses the same mechanism.
- **Editing form:** cancel SVAR's own editor with `api.intercept("show-editor", () => false)` and render the app's side panel instead (CAP-9). A modal Sheet would contradict "the timeline stays visible".
- **Persistence:** subscribe to `add-task`, `update-task`, `delete-task`, `move-task`, `indent-task`, `outdent-task` and forward to `src/services/api.ts`. Do not use `RestDataProvider`'s automatic endpoints — this app's API shape is its own.
- **Theming:** `Willow` / `WillowDark` with `fonts={false}`, then override `--wx-*` variables from the app's tokens. Internal class names are hashed; only the semantic `.wx-bar.wx-task.<type>` selectors are stable enough to target.
- **Container:** SVAR needs an explicit height. Schedule mode uses a fixed viewport with internal scrolling plus `Fullscreen`, unlike Estimate mode's content-sized grid capped at `MAX_GRID_HEIGHT`.
- **Undo:** the app owns it. A single-operation revert through `onUpdateWbsItem` plus a `sonner` toast is what CAP-4 needs; SVAR's own undo is not part of the design.

## Fallback

If the spike fails on #10 or #14, the fallback is **DHTMLX Gantt Community v10** (MIT since June 2026, 180 kB gz). It costs a hand-written React wrapper (`useRef` + `useEffect` + `destructor()`), and React components cannot be used inside its grid cells — a known flickering bug — so the left grid would use `template(task) → html` strings and the lightbox would be replaced wholesale. Everything in `data-model.md` survives that switch unchanged; only `wbsGantt.ts`'s output shape and the component layer would be rewritten.
