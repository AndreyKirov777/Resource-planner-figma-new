> **SUPERSEDED (2026-08-21)** by [`timeline-component.md`](timeline-component.md). A code-level audit the same day — tarballs unpacked, original TS/JSX recovered from the shipped source maps, packages installed and Vite-built, behaviour reproduced in Node, issue tracker checked — concluded that the roadmap chart should be built in-house. The decisive finding: SVAR has no cross-lane bar drag at all (`clientY` never read in `Bars.jsx`; reparenting is a grid-row gesture), so a custom pointer layer was required either way. Note also that the issue numbers below are wrong: **#14** and **#20** are long closed and are not what this file claims, and **#10** is a feature request, not a scroll freeze; the live relevant ones are #28, #31 and #30. This file is retained for the audit trail only — do not implement from it.

# SVAR React Gantt — integration contract

Companion to `SPEC.md`. What the library gives us, what is proven, what is not, and what to do about it. Carried over from `spec-wbs-schedule` with the roadmap model applied; the tarball findings below were made on 2026-08-21 and still stand.

## Package

`@svar-ui/react-gantt` 2.7.x, **MIT**, peer React >= 18, TypeScript types shipped, DOM + one SVG overlay for links, ~90 kB gz plus ~5 kB gz for `style.css`. Core store is `@svar-ui/gantt-store` (also MIT).

**Not** `wx-react-gantt` — that is the pre-2.3 name, deprecated, last published 2025-02, GPLv3. Installing it by mistake changes the licence of the build.

## The docs contradict themselves; the code decides

The vendor's API page for `resources` carries a "PRO Edition only" badge while the pricing page lists "Ability to assign resources to tasks" as open-source. The tarballs were unpacked to settle it.

**Verified present in the MIT build:** `IConfig.resources` / `assignments`, many assignments per task, `getTaskResources`, the assignment actions, the editor Resources tab, the avatar-group cell, `ResourceLoad` (with `wx-overload` above 100 %), links (`ILink`, `add/update/delete-link`, `wx-link` styling).

**Verified free and used by this spec:** `columns` with React `cell` components, `highlightTime(date, unit) → cssClass`, `taskTemplate`, `Toolbar`, `ContextMenu`, `Tooltip`, `Fullscreen`, `api.on` / `api.intercept` / `api.exec`, task types `task` / `summary` / `milestone`.

**Present but unverified at implementation level:** `markers`, `baselines`, `undo`, `criticalPath`. This spec depends on none of them.

**Rule that follows:** settle every feature you intend to depend on by running it. The vendor comparison table is not evidence in either direction.

## What the roadmap model does and does not use

- **Rows.** A lane is a `summary`-type task with `open: true`, no `start`/`end` of consequence and a `taskTemplate` that renders nothing — SVAR's summary bar is suppressed by CSS on `.wx-bar.wx-summary` inside the roadmap container. Items are `task` or `milestone` rows whose `parent` is the lane. Depth is exactly one; `add-task` with a non-lane parent is intercepted and refused, and `indent-task` / `outdent-task` are not wired at all.
- **Links are not used.** `links` stays empty and link handles are hidden via `--wx-*` overrides. This is a deliberate absence (SPEC non-goals), not a gap.
- **Resources are not used as storage and not used as display either.** Effort arrives on the bar from the link engine, not from SVAR assignments. The earlier idea of feeding `assignments` for an avatar-group column is dropped — the roadmap's left grid has `Hours` and `FTE` columns instead.
- **Dragging.** `update-task` from a drag or resize is intercepted, snapped with `snapToPeriod`, and forwarded to `api.ts`; `move-task` (row reorder) is intercepted and refused because of issue #20. Dragging a bar onto another lane arrives as `update-task` with a new `parent` — confirm in the spike that SVAR emits this for cross-parent bar drags; if it does not, re-laning is editor-and-menu only in the first release.

## Known open issues to reproduce in the spike

| Issue | Symptom | Consequence if real |
|---|---|---|
| #10 | horizontal scroll freezes | blocks Slice A — no workaround |
| #14 | timeline header drifts out of sync with grid lines, cumulatively | blocks Slice A — misalignment invalidates the whole read |
| #20 | crash on `move-task` when dragging rows | already mitigated: row reorder is by menu and editor, never by drag |

Roughly half of the project's 29 issues are open and maintainer response is slow, so treat an unreproduced bug as unresolved rather than fixed.

## Integration points

- **Phase bands** come from `highlightTime(date, unit)` returning a per-phase CSS class; SVAR's own vertical `markers` are not relied on.
- **Editing form:** cancel SVAR's own editor with `api.intercept("show-editor", () => false)` and render the app's side panel instead (CAP-11).
- **Persistence:** subscribe to `add-task`, `update-task`, `delete-task` and forward to `src/services/api.ts`. Do not use `RestDataProvider`'s automatic endpoints — this app's API shape is its own.
- **Theming:** `Willow` / `WillowDark` with `fonts={false}`, then override `--wx-*` variables from the app's tokens. Internal class names are hashed; only the semantic `.wx-bar.wx-task`, `.wx-bar.wx-summary`, `.wx-bar.wx-milestone` selectors are stable enough to target.
- **Container:** SVAR needs an explicit height. The roadmap uses a fixed viewport with internal scrolling plus `Fullscreen`.
- **Undo:** the app owns it. A single-operation revert through the same `PATCH` plus a `sonner` toast is what CAP-4 needs; SVAR's own undo is not part of the design.

## Fallback

If the spike fails on #10 or #14, the fallback is **DHTMLX Gantt Community v10** (MIT since June 2026, 180 kB gz). It costs a hand-written React wrapper (`useRef` + `useEffect` + `destructor()`), and React components cannot be used inside its grid cells — a known flickering bug — so the left grid would use `template(task) → html` strings and the lightbox would be replaced wholesale. Everything in `data-model.md` survives that switch unchanged; only `toGanttRows`'s output shape and the component layer would be rewritten.

A second, cheaper fallback exists *because the roadmap is flat and small*: a hand-rolled timeline on a CSS grid (lanes as rows, bars as absolutely positioned divs, drag via pointer events) is a few hundred lines and has no library risk. It should be weighed honestly at the gate — a dozen bars do not need a Gantt engine, and the left grid is two columns.
