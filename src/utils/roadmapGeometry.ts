/**
 * Pure pixel geometry for the roadmap timeline. No React, no DOM — every
 * coordinate the chart draws is computed here and unit-tested without a
 * browser, following the `wbsGrid.ts` precedent (the grid draws into a
 * canvas/DOM tree, so arithmetic left inside the component would be
 * permanently untestable).
 *
 * Periods are 1-based throughout, matching `Allocation.periodNumber` and
 * `Phase` semantics elsewhere in the app.
 */

/** Row height, matching `ROW_HEIGHT` used by the WBS grid and `SECTION_ROW_THEME` rows. */
export const ROW_HEIGHT = 34;
/** Timeline header height (two rows: 22px phase band + 21px period column, +1px border). */
export const HEADER_HEIGHT = 44;
/** Bar height inside its 34px row. */
export const BAR_HEIGHT = 18;
/** Horizontal inset applied to each side of a bar's rect, so adjacent bars never touch. */
export const BAR_INSET = 2;
/** Visible side of the milestone diamond (before the 45° rotation). */
export const MILESTONE_SIZE = 9;
/** Transparent square that catches the pointer — the diamond alone is too small to grab. */
export const MILESTONE_HIT = 18;

/** Height of a lane summary bar's flat slab. */
export const LANE_BAR_HEIGHT = 8;
/** Width of each of the summary bar's end caps. */
export const LANE_CAP_WIDTH = 6;
/** How far each end cap drops below the slab. */
export const LANE_CAP_DROP = 5;
/** Corner radius on the slab's two top corners. */
export const LANE_BAR_RADIUS = 2;
/** Side of the rolled-up milestone tick (rotated 45° to a diamond), before rotation. */
export const LANE_MILESTONE_SIZE = 5;

/** Fixed zoom ladder for `periodWidth`, in pixels per period. No free-pixel zoom. */
export const ZOOM_LADDER: readonly number[] = [8, 12, 16, 24, 32, 40, 56, 72];
export const DEFAULT_ZOOM_INDEX = 3; // periodWidth = 24

/** Step the zoom ladder one notch in `direction` (+1 zoom in, -1 zoom out), clamped. */
export function zoomStep(currentIndex: number, direction: 1 | -1): number {
  return Math.min(ZOOM_LADDER.length - 1, Math.max(0, currentIndex + direction));
}

/**
 * Pick the zoom-ladder index whose `periodWidth` best fits `periodCount` periods
 * into `containerWidth` — the largest width that fits, or the smallest rung if
 * even that overflows (a very long project never disappears below the minimum).
 */
export function fit(periodCount: number, containerWidth: number): number {
  if (periodCount <= 0) return DEFAULT_ZOOM_INDEX;
  let best = 0;
  for (let i = 0; i < ZOOM_LADDER.length; i++) {
    if (periodCount * ZOOM_LADDER[i] <= containerWidth) best = i;
  }
  return best;
}

/** X of a period's left edge. Period 1 starts at x = 0. */
export function periodX(period: number, periodWidth: number): number {
  return (period - 1) * periodWidth;
}

export interface Rect {
  left: number;
  width: number;
}

/** A bar's rect for `[startPeriod, startPeriod + periodCount)`, inset `BAR_INSET` each side. */
export function barRect(startPeriod: number, periodCount: number, periodWidth: number): Rect {
  const rawLeft = periodX(startPeriod, periodWidth);
  const rawWidth = Math.max(0, periodCount) * periodWidth;
  return {
    left: rawLeft + BAR_INSET,
    width: Math.max(0, rawWidth - BAR_INSET * 2),
  };
}

/** X of the boundary at the end of `startPeriod` — where a milestone diamond centres. */
export function milestoneX(startPeriod: number, periodWidth: number): number {
  return periodX(startPeriod, periodWidth) + periodWidth;
}

/**
 * A lane summary bar's rect. Delegates to `barRect` so the inset rule lives
 * in exactly one place — a lane bar's edges therefore agree, by
 * construction, with its earliest/latest child's bar edges.
 */
export function laneBarRect(startPeriod: number, periodCount: number, periodWidth: number): Rect {
  return barRect(startPeriod, periodCount, periodWidth);
}

/**
 * The bracket-with-end-caps silhouette as one SVG path, relative to `rect`'s
 * own local coordinate space (x=0 at `rect.left`): a flat slab of height
 * `LANE_BAR_HEIGHT` with a short downward tab at each end, flush with the
 * rect's outer edges. When the rect is narrower than `2 * LANE_CAP_WIDTH`
 * the caps shrink to half the rect each, so they meet in the middle but
 * never cross.
 */
export function laneSummaryPath(rect: Rect): string {
  const w = Math.max(0, rect.width);
  const h = LANE_BAR_HEIGHT;
  const drop = LANE_CAP_DROP;
  const cap = w < 2 * LANE_CAP_WIDTH ? w / 2 : LANE_CAP_WIDTH;
  const r = Math.min(LANE_BAR_RADIUS, w / 2, h);
  const right = w;

  return [
    `M ${r} 0`,
    `L ${right - r} 0`,
    `A ${r} ${r} 0 0 1 ${right} ${r}`,
    `L ${right} ${h}`,
    `L ${right} ${h + drop}`,
    `L ${right - cap} ${h + drop}`,
    `L ${right - cap} ${h}`,
    `L ${cap} ${h}`,
    `L ${cap} ${h + drop}`,
    `L 0 ${h + drop}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

/** Rolled-up milestone tick centres for a collapsed lane's summary bar, reusing `milestoneX`. */
export function laneMilestoneXs(periods: readonly number[], periodWidth: number): number[] {
  return periods.map((p) => milestoneX(p, periodWidth));
}

export interface PhaseBandInput {
  name: string;
  periodCount: number;
  color: string;
  /** WBS hour total for the phase, shown in the header band. Purely passed through. */
  hours?: number;
}

export interface PhaseBand {
  name: string;
  left: number;
  width: number;
  color: string;
  hours: number;
}

/** Phase bands over uniform period columns — widths sum exactly to the full timeline width. */
export function phaseBands(phases: readonly PhaseBandInput[], periodWidth: number): PhaseBand[] {
  const bands: PhaseBand[] = [];
  let cursor = 0;
  for (const phase of phases) {
    const width = Math.max(0, phase.periodCount) * periodWidth;
    bands.push({ name: phase.name, left: cursor, width, color: phase.color, hours: phase.hours ?? 0 });
    cursor += width;
  }
  return bands;
}

/** Visible-row index containing pixel `y` (never below 0). */
export function rowAt(y: number, rowHeight: number): number {
  if (rowHeight <= 0) return 0;
  return Math.max(0, Math.floor(y / rowHeight));
}

export type SnapDragMode = 'move' | 'resizeStart' | 'resizeEnd';

export interface SnapOrigin {
  startPeriod: number;
  periodCount: number;
}

export interface SnapResult {
  startPeriod: number;
  periodCount: number;
}

/**
 * The whole interaction rule in one function. `origin` is the item's pre-drag
 * `{ startPeriod, periodCount }`; `dxPx` is the pointer's horizontal delta
 * since the gesture began (or a keyboard step already converted to a whole
 * `periodWidth`); `np` is the project's period count. A milestone
 * (`origin.periodCount === 0`) always returns `periodCount: 0` and only ever
 * moves, regardless of `mode`.
 */
export function snapDrag(
  mode: SnapDragMode,
  origin: SnapOrigin,
  dxPx: number,
  periodWidth: number,
  np: number
): SnapResult {
  const delta = periodWidth > 0 ? Math.round(dxPx / periodWidth) : 0;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  if (origin.periodCount <= 0) {
    // Milestone: move only, no duration ever.
    const startPeriod = clamp(origin.startPeriod + delta, 1, Math.max(1, np));
    return { startPeriod, periodCount: 0 };
  }

  const finish = origin.startPeriod + origin.periodCount - 1; // inclusive last period

  switch (mode) {
    case 'move': {
      const maxStart = Math.max(1, np - origin.periodCount + 1);
      const startPeriod = clamp(origin.startPeriod + delta, 1, maxStart);
      return { startPeriod, periodCount: origin.periodCount };
    }
    case 'resizeEnd': {
      const maxCount = Math.max(1, np - origin.startPeriod + 1);
      const periodCount = clamp(origin.periodCount + delta, 1, maxCount);
      return { startPeriod: origin.startPeriod, periodCount };
    }
    case 'resizeStart': {
      const startPeriod = clamp(origin.startPeriod + delta, 1, finish);
      const periodCount = finish - startPeriod + 1;
      return { startPeriod, periodCount };
    }
    default:
      return { ...origin };
  }
}

// ---------------------------------------------------------------------------
// Vertical placement — reorder within a lane, cross-lane move, lane reorder.
// See spec-roadmap-vertical-drag.md. `rowAt` (floor) is reused for the
// "slot" math below rather than re-implemented — a slot is just `rowAt`
// evaluated half a row lower, which rounds instead of floors.
// ---------------------------------------------------------------------------

/** The minimal row shape vertical placement needs — a slice of `RoadmapRow`. */
export interface RowDescriptor {
  kind: 'lane' | 'item';
  /** The row's own id: a lane id for a lane row, an item id for an item row. */
  id: number;
  /** The lane this row belongs to — its own id for a lane row, the owning lane for an item row. */
  laneId: number;
  /** Only meaningful for a lane row. */
  collapsed: boolean;
}

export interface DropTarget {
  laneId: number;
  /** Index within the target lane's item list, AFTER the dragged item has been removed from it. */
  index: number;
}

/** The target lane's current items, in display order, as a list of ids. */
function laneItemIdsOf(rows: readonly RowDescriptor[], laneId: number): number[] {
  return rows.filter((r) => r.kind === 'item' && r.laneId === laneId).map((r) => r.id);
}

/**
 * Resolve pointer Y to an insertion slot `{ laneId, index }`. `slot =
 * round(y / rowHeight)` (via `rowAt(y + rowHeight/2, rowHeight)`, so the
 * floor math lives in one place) yields 0…rows.length. A slot landing on a
 * lane row reads as "first position in that lane" (or "append" when that
 * lane is collapsed) — otherwise an item could never be inserted at a
 * lane's head, and a collapsed lane's hidden items could never be targeted
 * at all. Above the first row clamps to the head of the first lane; below
 * the last row clamps to the tail of the last lane. The dragged item is
 * excluded before the index is resolved, so a drop on its own position
 * reproduces its exact current index — a guaranteed no-op.
 */
export function dropTargetAt(
  y: number,
  rows: readonly RowDescriptor[],
  rowHeight: number,
  draggedItemId: number
): DropTarget | null {
  if (rows.length === 0) return null;
  const slot = Math.min(rows.length, rowHeight > 0 ? rowAt(y + rowHeight / 2, rowHeight) : 0);
  const landing = slot < rows.length ? rows[slot] : undefined;

  let laneId: number;
  let rawIndex: number;

  if (landing === undefined) {
    // Below the last row -> tail of the last lane.
    const lastLane = [...rows].reverse().find((r) => r.kind === 'lane');
    if (!lastLane) return null;
    laneId = lastLane.id;
    rawIndex = laneItemIdsOf(rows, laneId).length;
  } else if (landing.kind === 'lane') {
    laneId = landing.id;
    const laneItemIds = laneItemIdsOf(rows, laneId);
    rawIndex = landing.collapsed ? laneItemIds.length : 0;
  } else {
    laneId = landing.laneId;
    rawIndex = laneItemIdsOf(rows, laneId).indexOf(landing.id);
  }

  const laneItemIds = laneItemIdsOf(rows, laneId);
  const draggedIndex = laneItemIds.indexOf(draggedItemId);
  const index = draggedIndex !== -1 && draggedIndex < rawIndex ? rawIndex - 1 : rawIndex;
  return { laneId, index };
}

/**
 * Resolve pointer Y to a target ordinal among LANES (`entity: 'lane'`).
 * Coarser than `dropTargetAt`: each lane's whole zone (its header plus its
 * item rows) is split at its vertical midpoint — the upper half targets
 * "before this lane", the lower half falls through to the next lane's
 * check. Past every lane's midpoint targets "after the last lane". The
 * caller passes the result straight to `reorderWithin`, which clamps it
 * after removing the dragged lane, so no separate self-removal step is
 * needed here.
 */
export function laneDropIndexAt(y: number, rows: readonly RowDescriptor[], rowHeight: number): number {
  const laneRowIndices: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'lane') laneRowIndices.push(i);
  });
  const n = laneRowIndices.length;
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const zoneStart = laneRowIndices[i] * rowHeight;
    const zoneEnd = (laneRowIndices[i + 1] ?? rows.length) * rowHeight;
    if (y < (zoneStart + zoneEnd) / 2) return i;
  }
  return n;
}

/** Move the element at `from` to `to`, clamping `to` into the post-removal bounds. */
export function reorderWithin<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  const clampedTo = Math.max(0, Math.min(copy.length, to));
  copy.splice(clampedTo, 0, moved);
  return copy;
}

/** The y (top offset) an insert line draws at for a resolved `DropTarget`. */
export function indicatorY(target: DropTarget, rows: readonly RowDescriptor[], rowHeight: number): number {
  const laneItemRowIndices: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'item' && r.laneId === target.laneId) laneItemRowIndices.push(i);
  });
  if (target.index < laneItemRowIndices.length) {
    return laneItemRowIndices[target.index] * rowHeight;
  }
  const laneHeaderIndex = rows.findIndex((r) => r.kind === 'lane' && r.id === target.laneId);
  const afterRowIndex =
    laneItemRowIndices.length > 0 ? laneItemRowIndices[laneItemRowIndices.length - 1] : laneHeaderIndex;
  return (afterRowIndex + 1) * rowHeight;
}

export interface StripeItem {
  startPeriod: number;
  periodCount: number;
}

/**
 * Pixel segments for the over-demand stripe along a bar's bottom, one per
 * contiguous run of `overPeriods` that intersects the bar's own window —
 * clipped to the bar's rect (2px-inset), so a run extending outside the bar
 * (before its start or after its finish) never draws past the bar's edges.
 */
export function stripeSegments(
  item: StripeItem,
  overPeriods: readonly number[],
  periodWidth: number
): Rect[] {
  if (item.periodCount <= 0) return [];
  const finish = item.startPeriod + item.periodCount - 1;
  const inBar = new Set(
    overPeriods.filter((p) => p >= item.startPeriod && p <= finish)
  );
  if (inBar.size === 0) return [];

  const sorted = Array.from(inBar).sort((a, b) => a - b);
  const rects: Rect[] = [];
  const bar = barRect(item.startPeriod, item.periodCount, periodWidth);
  const barRight = bar.left + bar.width;

  let runStart = sorted[0];
  let runEnd = sorted[0];
  const flush = () => {
    const left = Math.max(bar.left, periodX(runStart, periodWidth));
    const right = Math.min(barRight, periodX(runEnd + 1, periodWidth));
    if (right > left) rects.push({ left, width: right - left });
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === runEnd + 1) {
      runEnd = sorted[i];
      continue;
    }
    flush();
    runStart = sorted[i];
    runEnd = sorted[i];
  }
  flush();
  return rects;
}
