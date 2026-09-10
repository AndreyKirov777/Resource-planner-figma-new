---
title: 'Roadmap bar name labels'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'one-shot'
baseline_commit: '599130c8c116cbe8b51f1fdcce41be41906b9d4e'
---

# Roadmap bar name labels

## Intent

**Problem:** Empty-scope bars and spreads painted "no scope linked" instead of the item name, so the timeline hid the only identifier the planner already typed.

**Approach:** Always paint the item name on bars and spreads (live timeline and PNG). Keep the dashed empty-scope treatment; hours and FTE stay in the grid and tooltip.

## Suggested Review Order

**On-bar label**

- Empty-scope bars and spreads now render `row.name`, not a placeholder.
  [`RoadmapTimeline.tsx:602`](../../../src/components/roadmap/RoadmapTimeline.tsx#L602)

- PNG spread and bar `clipText` follow the same name rule.
  [`roadmapPng.ts:502`](../../../src/utils/roadmapPng.ts#L502)
  [`roadmapPng.ts:530`](../../../src/utils/roadmapPng.ts#L530)

- Drawn-label collection no longer injects the old placeholder string.
  [`roadmapPng.ts:130`](../../../src/utils/roadmapPng.ts#L130)

**CAP-6 contract**

- Success criterion: name on the bar; empty-scope is visual, not a caption.
  [`SPEC.md:65`](../specs/spec-roadmap/SPEC.md#L65)

- Visual-language table matches live bars, spreads, and empty-scope style.
  [`ux-reference.md:48`](../specs/spec-roadmap/ux-reference.md#L48)

**Tests**

- Empty-scope and scoped bars both assert the name, never the placeholder.
  [`Roadmap.test.tsx:1116`](../../../src/components/roadmap/Roadmap.test.tsx#L1116)

- PNG model includes empty-scope bar and spread names.
  [`roadmapPng.test.ts:117`](../../../src/utils/roadmapPng.test.ts#L117)
