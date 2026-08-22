/**
 * Turns a resolved vertical-drag target into the wire payload for
 * `PATCH /api/projects/:id/roadmap/reorder`, and captures the pre-drag
 * order for Undo. Pure — no React, no DOM. See
 * `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`.
 *
 * Kept deliberately simple: rather than diff row-by-row, both lanes/items
 * touched by a move are always renumbered and emitted in full (renumbering
 * a dozen-item lane is cheap, and "always correct" beats "smallest possible
 * payload" for a request the human decision requires to be atomic anyway).
 * The one thing that must stay minimal is *which* fields carry window data:
 * `startPeriod`/`periodCount` are attached ONLY to the dragged item, and
 * only when the gesture actually changed its window — never to a sibling
 * bumped by the renumber, and never to a spread item (the server refuses a
 * window write on one; we simply never send it).
 */
import { RoadmapRowLane, RoadmapRowItem } from './roadmap';
import { RoadmapReorderPayload, RoadmapLaneWithItems, RoadmapItem } from '../services/api';
import { reorderWithin } from './roadmapGeometry';

export type { RoadmapReorderPayload };

export interface ItemReorderCommit {
  entity: 'item';
  itemId: number;
  /** Target lane — always the RESOLVED lane, even when it equals the item's current one. */
  laneId: number;
  /** Target index within that lane, already excluding the dragged item (see `dropTargetAt`). */
  index: number;
  /** Only set when the same gesture also moved the window (a timeline drag with both dx and dy). */
  window?: { startPeriod: number; periodCount: number };
}

export interface LaneReorderCommit {
  entity: 'lane';
  laneId: number;
  /** Target index among lanes, per `laneDropIndexAt` — resolved against the CURRENT (undragged) lane order. */
  index: number;
}

export type RoadmapReorderCommit = ItemReorderCommit | LaneReorderCommit;

function orderedLaneIds(lanes: readonly RoadmapRowLane[]): number[] {
  return [...lanes].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id).map((l) => l.id);
}

function orderedLaneItemIds(items: readonly RoadmapRowItem[], laneId: number): number[] {
  return items
    .filter((i) => i.laneId === laneId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    .map((i) => i.id);
}

/**
 * The wire payload for a resolved drag/keyboard reorder commit, or `null`
 * when applying it would be a no-op (drop on the item's own position, or a
 * lane dropped back where it started) — the caller sends nothing in that
 * case, per the "drop on own position -> no request at all" rule.
 */
export function buildReorder(
  lanes: readonly RoadmapRowLane[],
  items: readonly RoadmapRowItem[],
  commit: RoadmapReorderCommit
): RoadmapReorderPayload | null {
  if (commit.entity === 'lane') {
    const ordered = orderedLaneIds(lanes);
    const from = ordered.indexOf(commit.laneId);
    if (from < 0) return null;
    const next = reorderWithin(ordered, from, commit.index);
    if (next.every((id, i) => id === ordered[i])) return null;
    return { lanes: next.map((id, displayOrder) => ({ id, displayOrder })) };
  }

  const dragged = items.find((i) => i.id === commit.itemId);
  if (!dragged) return null;
  const sourceLaneId = dragged.laneId;
  const destLaneId = commit.laneId;
  const windowPatch =
    commit.window && (commit.window.startPeriod !== dragged.startPeriod || commit.window.periodCount !== dragged.periodCount)
      ? commit.window
      : undefined;

  if (sourceLaneId === destLaneId) {
    const before = orderedLaneItemIds(items, sourceLaneId);
    const ids = before.filter((id) => id !== commit.itemId);
    const clamped = Math.max(0, Math.min(ids.length, commit.index));
    ids.splice(clamped, 0, commit.itemId);
    if (!windowPatch && ids.every((id, i) => id === before[i])) return null; // self-drop no-op
    return {
      items: ids.map((id, displayOrder) => ({
        id,
        laneId: sourceLaneId,
        displayOrder,
        ...(id === commit.itemId && windowPatch ? windowPatch : {}),
      })),
    };
  }

  const destIds = orderedLaneItemIds(items, destLaneId);
  const clampedDest = Math.max(0, Math.min(destIds.length, commit.index));
  destIds.splice(clampedDest, 0, commit.itemId);
  const sourceIds = orderedLaneItemIds(items, sourceLaneId).filter((id) => id !== commit.itemId);

  return {
    items: [
      ...destIds.map((id, displayOrder) => ({
        id,
        laneId: destLaneId,
        displayOrder,
        ...(id === commit.itemId && windowPatch ? windowPatch : {}),
      })),
      ...sourceIds.map((id, displayOrder) => ({ id, laneId: sourceLaneId, displayOrder })),
    ],
  };
}

/**
 * The pre-drag order of every lane in `laneIds` (their own `displayOrder`,
 * for a lane-entity commit) and every item belonging to one of them (for an
 * item-entity commit) — the Undo payload. Never carries window fields:
 * restoring a dragged bar's pre-drag window is the caller's job (it already
 * holds the pre-drag triple, same as the existing single-item undo), kept
 * separate so this function stays about order alone.
 */
export function orderSnapshot(
  lanes: readonly RoadmapRowLane[],
  items: readonly RoadmapRowItem[],
  laneIds: readonly number[]
): RoadmapReorderPayload {
  const laneIdSet = new Set(laneIds);
  const laneEntries = lanes
    .filter((l) => laneIdSet.has(l.id))
    .map((l) => ({ id: l.id, displayOrder: l.displayOrder }));
  const itemEntries = items
    .filter((i) => laneIdSet.has(i.laneId))
    .map((i) => ({ id: i.id, laneId: i.laneId, displayOrder: i.displayOrder }));
  const payload: RoadmapReorderPayload = {};
  if (laneEntries.length > 0) payload.lanes = laneEntries;
  if (itemEntries.length > 0) payload.items = itemEntries;
  return payload;
}

/**
 * The client-side optimistic merge of a `RoadmapReorderPayload` into the full
 * `RoadmapLaneWithItems[]` state `App.tsx` holds: patch lane `displayOrder`,
 * pull every touched item out of its current lane, then re-insert + re-sort
 * each into its (possibly new) lane. Same pull-then-reinsert shape as
 * `App.tsx`'s `patchRoadmapItemInLanes`, generalized to every lane/item a
 * reorder payload touches in one pass. Pure — lives here (not in `App.tsx`)
 * so it's unit-testable the same way as `buildReorder`/`orderSnapshot`.
 */
export function applyRoadmapReorder(
  lanes: readonly RoadmapLaneWithItems[],
  payload: RoadmapReorderPayload
): RoadmapLaneWithItems[] {
  const laneOrderPatch = new Map((payload.lanes ?? []).map((l) => [l.id, l.displayOrder]));
  const itemPatchById = new Map((payload.items ?? []).map((i) => [i.id, i]));

  const pulled: RoadmapItem[] = [];
  const withoutTouchedItems = lanes.map((lane) => {
    const patchedLane = laneOrderPatch.has(lane.id) ? { ...lane, displayOrder: laneOrderPatch.get(lane.id)! } : lane;
    const remaining = patchedLane.items.filter((item) => {
      const patch = itemPatchById.get(item.id);
      if (!patch) return true;
      pulled.push({ ...item, ...patch });
      return false;
    });
    return { ...patchedLane, items: remaining };
  });

  return withoutTouchedItems.map((lane) => {
    const arriving = pulled.filter((item) => item.laneId === lane.id);
    if (arriving.length === 0) return lane;
    return {
      ...lane,
      items: [...lane.items, ...arriving].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id),
    };
  });
}
