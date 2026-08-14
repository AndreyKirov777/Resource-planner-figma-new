---
title: 'WBS-4 — JSON export/import (schemaVersion 3)'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: '049e36b8018eaad943a32438fc21131a780c7ee8'
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Project JSON export/import (`schemaVersion` 2) carries lists, plans, and allocations only. A WBS and its hours are dropped on round-trip, so the second estimate cannot leave the app (CAP-9 / CAP-11).

**Approach:** Bump export to `schemaVersion` 3 and include `wbsItems` with nested `estimates`. Import rematerializes the tree with new IDs (remap `parentId`) using the same Prisma-direct, field-whitelisted style as lists and plans. No new routes, no UI.

## Boundaries & Constraints

**Always:**

- Export `GET /api/projects/:id/export` writes `{ schemaVersion: 3, exportedAt, data }`. `data` adds `wbsItems` via Prisma `include: { estimates: true }` (relation name `wbsItems` on `Project`). Empty WBS → `wbsItems: []`. Rate card stays excluded.
- Import `POST /api/projects/import` still reads `body.data || body` and **does not branch on `schemaVersion`**. Missing/`[]` `wbsItems` → empty WBS (v2 and raw payloads keep working).
- Recreate WBS with Prisma `wbsItem.create` (nested `estimates.create`), not the WBS POST handlers — do not re-run `validWbsDisciplines`. Snapshot restore, same as imported plan roles.
- Whitelist only: item `name`, `phaseName` (`?? null`), `displayOrder` (`?? 0`), remapped `parentId`; estimate `discipline`, `role` (`?? ''`), `hours` (`?? 0`). Drop `id` / `projectId` / timestamps; assign `projectId` to the new project.
- Create parents before children. Build `oldId → newId`. Unknown or not-yet-created `parentId` (orphan or cycle leftover) → `parentId: null` (root). Do not 500 on a cyclic payload.
- Keep import non-transactional, matching lists/plans. No new endpoints. `readme.test.ts` path set unchanged.

**Ask First:**

- If copy-project (`POST /api/projects/:id/copy`) should also clone WBS — out of scope unless you say so.
- If a cyclic/orphan payload should hard-fail 400 instead of promoting leftovers to roots.

**Never:**

- No `notes` column, no Prisma schema change, no `db push`.
- No copy-project, Excel, PNG, D6, or WBS UI changes.
- Do not wrap the existing import in a new `$transaction`.
- Do not put the rate card in the payload.
- Do not require `schemaVersion === 3` to import — v2 files must still load.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round-trip tree | Project with root + child, estimates (named role and `""`), `phaseName` set / null | Export `schemaVersion: 3` and `wbsItems[]`. Import creates a new project; names, parent links, `displayOrder`, `phaseName`, hours, roles match | N/A |
| Empty WBS | Project with lists/plans only | Export has `wbsItems: []`. Import has no WBS rows | N/A |
| v2 payload | `{ schemaVersion: 2, data }` with no `wbsItems` (or raw unwrapped body) | Import succeeds; new project has empty WBS; lists/plans unchanged | N/A |
| Orphan / cycle `parentId` | Child `parentId` missing from payload, or A↔B | Those items import as roots (`parentId: null`); rest of import continues | No 500 |
| Discipline not on live card | Exported estimate `discipline` absent from current `GlobalRateCard` | Estimate is still written | No 400 from import |

</frozen-after-approval>

## Code Map

- `server.ts` -- export `include` + `schemaVersion: 3`; import WBS arm after plans
- `wbs.integration.test.ts` -- round-trip + v2-compat + orphan-parent cases (existing `isolateTestDb('wbs')` + tree fixtures)
- `docs/api-contracts.md` -- copy/export/import paragraph: v3 + WBS; copy still lists/plans only
- `_bmad-output/specs/spec-resource-planner/SPEC.md` -- CAP-9 success: JSON round-trip includes WBS
- `CHANGELOG.md` -- Unreleased Added
- `README.md` -- export/import one-liners mention WBS (path set unchanged; `readme.test.ts` stays green)

## Tasks & Acceptance

**Execution:**

- [x] `server.ts` -- add `wbsItems: { include: { estimates: true } }` to export `findUnique`; set `schemaVersion: 3` -- WBS leaves the app
- [x] `server.ts` -- after resource-plan import, rematerialize `wbsItems` (topo/queue by remapped parent, whitelist fields, nested estimates) -- WBS survives import
- [x] `wbs.integration.test.ts` -- cover the I/O matrix (round-trip, empty, v2/raw, orphan parent, discipline-not-on-card) -- no export/import coverage exists today
- [x] `docs/api-contracts.md` -- v2 → v3; export/import include WBS; copy does not
- [x] `_bmad-output/specs/spec-resource-planner/SPEC.md` -- CAP-9 success mentions WBS in the JSON round-trip
- [x] `CHANGELOG.md` -- Unreleased Added: project JSON export/import includes the WBS
- [x] `README.md` -- export/import descriptions mention WBS tree + estimates

**Acceptance Criteria:**

- Given a project with a nested WBS and estimates, when it is exported and that payload is imported, then the new project has the same tree shape and hours (new IDs) and lists/plans still round-trip.
- Given a `schemaVersion: 2` export with no `wbsItems`, when it is imported, then the new project loads with empty WBS and existing list/plan behavior.
- Given an exported WBS, when the live rate card no longer contains an estimate's `discipline`, then import still writes that estimate.
- Given a project with no WBS rows, when it is exported, then `data.wbsItems` is `[]` and `schemaVersion` is `3`.

## Spec Change Log

## Design Notes

Import cannot reuse exported `id` / `parentId` — Prisma assigns new IDs, same as plans. Queue items whose remapped parent already exists (or that have no in-payload parent); create those; repeat. Leftovers become roots.

```
old: 1 Root, 2 Child (parentId:1), 3 Orphan (parentId:99)
new: Root, Child(parent=newRoot), Orphan(parent=null)
```

Do not call `validWbsDisciplines` here. Live-card checks belong on interactive WBS writes, not snapshot restore.

## Verification

**Commands:**

- `npx vitest run wbs.integration.test.ts` -- I/O matrix green; `prisma/dev.db` untouched
- `npx vitest run readme.test.ts` -- endpoint path set unchanged

## Suggested Review Order

**Export payload**

- WBS rides out with lists and plans; empty projects still emit `wbsItems: []`.
  [`server.ts:254`](../../server.ts#L254)

- Version bump is export-only; import still ignores `schemaVersion`.
  [`server.ts:268`](../../server.ts#L268)

**Import rematerialize**

- Prisma-direct restore: remap ids, parents first, leftovers become roots.
  [`server.ts:281`](../../server.ts#L281)

- Coerce order/hours; skip null rows and duplicate `(discipline, role)` pairs.
  [`server.ts:315`](../../server.ts#L315)

- Wired after plans; missing `wbsItems` is a no-op.
  [`server.ts:424`](../../server.ts#L424)

**Docs**

- CAP-9 success now names the WBS round-trip and v2 compat.
  [`SPEC.md:60`](../specs/spec-resource-planner/SPEC.md#L60)

- Copy stays lists/plans only; export/import carry WBS at v3.
  [`api-contracts.md:93`](../../docs/api-contracts.md#L93)

**Tests**

- I/O matrix: round-trip, empty, v2/raw, orphan/cycle, unknown discipline.
  [`wbs.integration.test.ts:528`](../../wbs.integration.test.ts#L528)
