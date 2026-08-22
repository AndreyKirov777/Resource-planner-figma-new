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
