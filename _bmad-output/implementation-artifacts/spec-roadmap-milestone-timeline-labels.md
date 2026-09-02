---
title: 'Roadmap milestone timeline labels'
type: 'feature'
created: '2026-09-02'
status: 'done'
route: 'one-shot'
---

# Roadmap milestone timeline labels

## Intent

**Problem:** Milestone diamonds on the Roadmap timeline showed no Name. The only way to read a milestone was a tooltip on the 18px hit box, even though the UX contract already specified "name to the right".

**Approach:** Draw the item Name immediately to the right of each milestone diamond, as a non-interactive sidecar label, matching the existing lane-bar label pattern.

## Suggested Review Order

- Sidecar Name sits just past the rotated diamond; bars and spreads stay unlabeled.
  [`RoadmapTimeline.tsx:669`](../../src/components/roadmap/RoadmapTimeline.tsx#L669)

- Offset is half the diamond's visual diagonal plus a 6px gap, same as lane labels.
  [`RoadmapTimeline.tsx:474`](../../src/components/roadmap/RoadmapTimeline.tsx#L474)

- Test: Name is right of the hit box; bars and spreads do not get a milestone label.
  [`Roadmap.test.tsx:1106`](../../src/components/roadmap/Roadmap.test.tsx#L1106)
