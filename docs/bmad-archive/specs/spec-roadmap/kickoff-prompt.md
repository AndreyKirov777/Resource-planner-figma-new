# Kickoff prompt — Slice A

Not part of the contract. Paste the block below into a fresh session opened in this repo.
Optionally prefix it with `/bmad-build`.

---

Implement **Slice A of the Project Roadmap feature**.

## Contract

`docs/bmad-archive/specs/spec-roadmap/` is canonical. Read all five before writing code:
`SPEC.md`, then `data-model.md`, `timeline-component.md`, `ux-reference.md`, `delivery.md`.
Then `docs/bmad-archive/project-context.md` for this repo's conventions.

Do **not** implement from `docs/bmad-archive/specs/spec-wbs-schedule/` or from
`spec-roadmap/svar-integration.md`. Both are superseded and carry banners saying so; they exist
for rationale and audit trail only.

**Visual reference:** https://claude.ai/code/artifact/c480e057-abe0-4618-9e74-91791e66e8bf — a
working mockup of every screen, with real drag, resize and cross-lane drop, built on a demo project
whose figures are computed by the formulas in `data-model.md`. It is a reference, not the contract:
where it and `ux-reference.md` disagree, the file wins.

## Scope

**Slice A only** — its contents are listed in `delivery.md`. Deliver all of it, not a subset. Stop
at its boundary: do not start Slice B (demand engine, load strip, by-period matrix, draft plan).
If something in Slice A turns out to be blocked, finish everything else and say plainly what you
left out and why.

Branch `feat/wbs-schedule-gantt` (the name predates both the roadmap model and the decision to drop
the Gantt library). `prisma/dev.db` is untracked and live — never commit or revert it.

## Build order

1. `src/utils/roadmapGeometry.ts` + its unit tests — the testing contract is in `timeline-component.md`.
2. `src/utils/roadmap.ts` + its unit tests — link inheritance, `itemEffort`, `coverage`,
   `bootstrapRoadmap`, `toRoadmapRows`, period↔date adapters.
3. Prisma migration, `.strict()` schemas in `server-validation.ts`, endpoints in `server.ts`,
   client methods in `src/services/api.ts`.
4. The Roadmap tab and its components; the optional `Roadmap` column in the WBS table last.

Geometry and link inheritance are pure and fully testable. Getting them right first means every
later "this bar is drawn wrong" argument is settled in a unit test rather than in the browser.

## Already decided — do not re-litigate

- **No Gantt or timeline library.** The chart is ours. This was settled by a code-level audit of
  `@svar-ui/react-gantt`; `timeline-component.md` records the evidence and the only conditions under
  which it would reverse.
- **The roadmap is flat.** Lanes hold items; items hold nothing. No nesting, not even as a
  "cheap later addition".
- **Scope links are N:1 with nearest-linked-ancestor inheritance**, in their own table.
  `WbsItem` and `WbsEstimate` do not change.
- **Positions are stored in periods, never ISO dates.**
- **No dependencies, progress, baselines, critical path, virtualization or canvas.**

## Decisions I need from you — ask when you reach each, don't guess silently

1. What happens to roadmap items on a weekly ↔ monthly conversion. *(blocks the migration)*
2. What happens to items when phases are reordered, split or deleted. *(blocks the migration)*
3. Whether export/import carries lanes, items, links and `startDate` as `schemaVersion: 4`.
   *(blocks the endpoints)*
4. Whether bootstrap should place depth-0 **leaves** — CAP-12's "zero unplaced hours" criterion
   cannot hold as written, because level-of-effort nodes like `Project management` have no depth-1
   children. *(blocks `bootstrapRoadmap` and its tests)*

`delivery.md` names the cheapest precedent for each. Do everything that does not depend on them
first, and bring them to me together rather than one at a time if they arrive close together.

## Done means

- `npm run typecheck` clean, and `npm test` clean including every new test listed under
  "Verification per slice" in `delivery.md`.
- **Keyboard parity works for every drag gesture** (CAP-4) — a bar placeable only by dragging is
  not shippable, and the keyboard path is what the component tests drive.
- The WBS tab, with the `Roadmap` column hidden, is pixel-identical to before.
- Report honestly: if a test fails, show the output; if you skipped something, say so.

## First reply

Read the five spec files, then give me a short implementation plan for Slice A — file by file, in
the order you will build them, with the tests you will write for each — **before** writing any code.
