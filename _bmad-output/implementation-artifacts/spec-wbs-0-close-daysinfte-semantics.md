---
title: 'WBS-0 — Close daysInFTE Semantics'
type: 'chore'
created: '2026-08-12'
status: 'done'
route: 'one-shot'
---

# WBS-0 — Close daysInFTE Semantics

## Intent

**Problem:** SPEC.md carried an unresolved Open Question about whether `daysInFTE` drives
hour/cost math or is cadence-only — blocking the WBS estimate reconciliation work approved
in the 2026-08-12 Sprint Change Proposal, since its hour math would otherwise inherit an
undecided formula.

**Approach:** Close the question as a documented Constraint — decided per-capability, not
as one blanket rule: `hoursPerPeriod()` (CAP-4) is cadence-only (weekly stays fixed at 40h,
monthly scales with `daysInFTE`); `getWeeksPerMonth()` (CAP-7) uses `daysInFTE`
unconditionally, since conversion is its entire purpose. Formalizes existing code in both
files — neither was changed. Logged the resolution to `.memlog.md` (the spec's canonical
source of truth) alongside the SPEC.md edit, added a regression test locking the invariant,
and deferred two pre-existing, out-of-scope issues surfaced along the way.

## Suggested Review Order

**Decision record**

- Start here — the resolved memlog entry is the canonical record; SPEC.md is its render.
  [`.memlog.md:42`](../specs/spec-resource-planner/.memlog.md#L42)

- The Constraint replacing the old Open Question — now split correctly by capability (CAP-4 vs CAP-7).
  [`SPEC.md:73`](../specs/spec-resource-planner/SPEC.md#L73)

**Code**

- Clarifying comment on the function the decision governs; points readers away from confusing it with `modeConversion.ts`.
  [`calculations.ts:71`](../../src/utils/calculations.ts#L71)

- Regression test locking in the now-decided invariant — previously `hoursPerPeriod` had zero coverage.
  [`calculations.test.ts:82`](../../src/utils/calculations.test.ts#L82)

**Deferred (pre-existing, out of scope)**

- Two issues the review surfaced but didn't originate from this change: stale `issues-tasks.md` M1, and a `daysInFTE` default-value drift (20 vs 21) across four files.
  [`deferred-work.md:76`](./deferred-work.md#L76)
