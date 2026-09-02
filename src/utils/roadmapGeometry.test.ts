import { describe, it, expect } from 'vitest';
import {
  periodX,
  barRect,
  milestoneX,
  phaseBands,
  rowAt,
  snapDrag,
  barDragMode,
  BAR_RESIZE_HIT_PX,
  stripeSegments,
  fit,
  zoomStep,
  ZOOM_LADDER,
  BAR_INSET,
  laneBarRect,
  laneSummaryPath,
  laneMilestoneXs,
  LANE_CAP_WIDTH,
  dropTargetAt,
  laneDropIndexAt,
  reorderWithin,
  indicatorY,
  RowDescriptor,
  ROW_HEIGHT,
} from './roadmapGeometry';

/** Inverse of `periodX`, reimplemented here since production only needs the forward direction. */
function periodAtX(x: number, periodWidth: number): number {
  if (periodWidth <= 0) return 1;
  return Math.max(1, Math.floor(x / periodWidth) + 1);
}

describe('periodX', () => {
  it('period 1 starts at x=0', () => {
    expect(periodX(1, 20)).toBe(0);
  });

  it('round-trips exactly at period boundaries', () => {
    const periodWidth = 20;
    for (let p = 1; p <= 10; p++) {
      const x = periodX(p, periodWidth);
      expect(periodAtX(x, periodWidth)).toBe(p);
      // one pixel before the boundary still belongs to the previous period
      if (p > 1) expect(periodAtX(x - 1, periodWidth)).toBe(p - 1);
      // one pixel after the boundary (but before the next) still belongs to p
      expect(periodAtX(x + periodWidth - 1, periodWidth)).toBe(p);
    }
  });
});

describe('barRect', () => {
  it('insets 2px on each side', () => {
    const rect = barRect(1, 2, 20);
    expect(rect.left).toBe(0 + BAR_INSET);
    expect(rect.width).toBe(2 * 20 - BAR_INSET * 2);
  });

  it('offsets by startPeriod', () => {
    const rect = barRect(3, 1, 20);
    expect(rect.left).toBe(periodX(3, 20) + BAR_INSET);
  });
});

describe('milestoneX', () => {
  it('sits at the boundary at the END of startPeriod', () => {
    expect(milestoneX(1, 20)).toBe(20);
    expect(milestoneX(3, 20)).toBe(60);
  });
});

describe('phaseBands', () => {
  it('sums widths to the full timeline width over uneven phases', () => {
    const phases = [
      { name: 'Discovery', periodCount: 3, color: '#fff' },
      { name: 'Build', periodCount: 7, color: '#000' },
      { name: 'Launch', periodCount: 1, color: '#abc' },
    ];
    const periodWidth = 16;
    const bands = phaseBands(phases, periodWidth);
    const totalWidth = bands.reduce((sum, b) => sum + b.width, 0);
    expect(totalWidth).toBe(11 * periodWidth);
    // contiguous, no gaps or overlaps
    expect(bands[0].left).toBe(0);
    expect(bands[1].left).toBe(bands[0].width);
    expect(bands[2].left).toBe(bands[0].width + bands[1].width);
  });

  it('passes hours through, defaulting to 0', () => {
    const bands = phaseBands([{ name: 'A', periodCount: 1, color: '#fff', hours: 120 }], 10);
    expect(bands[0].hours).toBe(120);
    const noHours = phaseBands([{ name: 'B', periodCount: 1, color: '#fff' }], 10);
    expect(noHours[0].hours).toBe(0);
  });
});

describe('rowAt', () => {
  it('resolves the row index from y', () => {
    expect(rowAt(0, 34)).toBe(0);
    expect(rowAt(33, 34)).toBe(0);
    expect(rowAt(34, 34)).toBe(1);
    expect(rowAt(68, 34)).toBe(2);
  });

  it('clamps negative y to row 0', () => {
    expect(rowAt(-10, 34)).toBe(0);
  });
});

describe('snapDrag — move', () => {
  const periodWidth = 20;
  const np = 16;

  it('sub-period delta rounds to 0 periods', () => {
    const result = snapDrag('move', { startPeriod: 3, periodCount: 2 }, 5, periodWidth, np);
    expect(result).toEqual({ startPeriod: 3, periodCount: 2 });
  });

  it('exact one-period delta moves by exactly one period', () => {
    const result = snapDrag('move', { startPeriod: 3, periodCount: 2 }, periodWidth, periodWidth, np);
    expect(result).toEqual({ startPeriod: 4, periodCount: 2 });
  });

  it('multi-period delta moves by several periods', () => {
    const result = snapDrag('move', { startPeriod: 3, periodCount: 2 }, periodWidth * 3, periodWidth, np);
    expect(result).toEqual({ startPeriod: 6, periodCount: 2 });
  });

  it('never changes duration', () => {
    const result = snapDrag('move', { startPeriod: 3, periodCount: 4 }, periodWidth, periodWidth, np);
    expect(result.periodCount).toBe(4);
  });

  it('clamps at period 1', () => {
    const result = snapDrag('move', { startPeriod: 2, periodCount: 3 }, -periodWidth * 10, periodWidth, np);
    expect(result.startPeriod).toBe(1);
  });

  it('clamps at the project end', () => {
    const result = snapDrag('move', { startPeriod: 10, periodCount: 3 }, periodWidth * 10, periodWidth, np);
    // bar must stay inside [1, np]: last start with count 3 in a 16-period project is 14
    expect(result.startPeriod).toBe(np - 3 + 1);
  });
});

describe('barDragMode', () => {
  const wide = 100;

  it('maps the start 8px to resizeStart', () => {
    expect(barDragMode(0, wide)).toBe('resizeStart');
    expect(barDragMode(BAR_RESIZE_HIT_PX, wide)).toBe('resizeStart');
  });

  it('maps the body to move', () => {
    expect(barDragMode(BAR_RESIZE_HIT_PX + 1, wide)).toBe('move');
    expect(barDragMode(wide / 2, wide)).toBe('move');
    expect(barDragMode(wide - BAR_RESIZE_HIT_PX - 1, wide)).toBe('move');
  });

  it('maps the end 8px to resizeEnd', () => {
    expect(barDragMode(wide - BAR_RESIZE_HIT_PX, wide)).toBe('resizeEnd');
    expect(barDragMode(wide, wide)).toBe('resizeEnd');
  });

  it('at exactly 16px the zones meet with no overlap — start then end, no body', () => {
    const meet = BAR_RESIZE_HIT_PX * 2;
    expect(barDragMode(BAR_RESIZE_HIT_PX, meet)).toBe('resizeStart');
    expect(barDragMode(BAR_RESIZE_HIT_PX + 1, meet)).toBe('resizeEnd');
  });

  it('on a short bar start wins the overlapping middle', () => {
    const short = 10;
    expect(barDragMode(0, short)).toBe('resizeStart');
    expect(barDragMode(5, short)).toBe('resizeStart'); // also in end zone; start checked first
    expect(barDragMode(8, short)).toBe('resizeStart');
    expect(barDragMode(9, short)).toBe('resizeEnd'); // past start zone, still in end zone
  });

  it('zero or negative width stays move', () => {
    expect(barDragMode(0, 0)).toBe('move');
    expect(barDragMode(4, -1)).toBe('move');
  });
});

describe('snapDrag — resizeEnd', () => {
  const periodWidth = 20;
  const np = 16;

  it('sub-period delta leaves duration unchanged', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 3, periodCount: 2 }, 5, periodWidth, np);
    expect(result).toEqual({ startPeriod: 3, periodCount: 2 });
  });

  it('exact delta changes duration by exactly one period', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 3, periodCount: 2 }, periodWidth, periodWidth, np);
    expect(result).toEqual({ startPeriod: 3, periodCount: 3 });
  });

  it('multi-period delta', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 3, periodCount: 2 }, periodWidth * 4, periodWidth, np);
    expect(result).toEqual({ startPeriod: 3, periodCount: 6 });
  });

  it('never changes startPeriod', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 5, periodCount: 2 }, -periodWidth, periodWidth, np);
    expect(result.startPeriod).toBe(5);
  });

  it('clamps to a minimum duration of 1', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 3, periodCount: 2 }, -periodWidth * 10, periodWidth, np);
    expect(result.periodCount).toBe(1);
  });

  it('clamps to the project end', () => {
    const result = snapDrag('resizeEnd', { startPeriod: 14, periodCount: 1 }, periodWidth * 10, periodWidth, np);
    expect(result.periodCount).toBe(np - 14 + 1);
  });
});

describe('snapDrag — resizeStart', () => {
  const periodWidth = 20;
  const np = 16;

  it('sub-period delta leaves the window unchanged', () => {
    const result = snapDrag('resizeStart', { startPeriod: 3, periodCount: 4 }, 5, periodWidth, np);
    expect(result).toEqual({ startPeriod: 3, periodCount: 4 });
  });

  it('exact delta moves start by one period, compensating duration so finish is fixed', () => {
    const origin = { startPeriod: 3, periodCount: 4 }; // periods 3..6
    const result = snapDrag('resizeStart', origin, periodWidth, periodWidth, np);
    expect(result).toEqual({ startPeriod: 4, periodCount: 3 }); // still finishes at 6
  });

  it('multi-period delta', () => {
    const origin = { startPeriod: 3, periodCount: 6 }; // periods 3..8
    const result = snapDrag('resizeStart', origin, periodWidth * 3, periodWidth, np);
    expect(result).toEqual({ startPeriod: 6, periodCount: 3 }); // still finishes at 8
  });

  it('finish period never moves', () => {
    const origin = { startPeriod: 3, periodCount: 6 };
    const result = snapDrag('resizeStart', origin, -periodWidth, periodWidth, np);
    const finish = result.startPeriod + result.periodCount - 1;
    expect(finish).toBe(origin.startPeriod + origin.periodCount - 1);
  });

  it('clamps to a minimum duration of 1 at the finish edge', () => {
    const origin = { startPeriod: 3, periodCount: 4 }; // finish = 6
    const result = snapDrag('resizeStart', origin, periodWidth * 10, periodWidth, np);
    expect(result).toEqual({ startPeriod: 6, periodCount: 1 });
  });

  it('clamps at period 1', () => {
    const origin = { startPeriod: 3, periodCount: 4 };
    const result = snapDrag('resizeStart', origin, -periodWidth * 10, periodWidth, np);
    expect(result.startPeriod).toBe(1);
    expect(result.periodCount).toBe(6); // finish 6, start 1 => 6 periods
  });
});

describe('snapDrag — milestone', () => {
  const periodWidth = 20;
  const np = 16;

  it('always returns periodCount 0 regardless of mode', () => {
    const origin = { startPeriod: 5, periodCount: 0 };
    for (const mode of ['move', 'resizeStart', 'resizeEnd'] as const) {
      const result = snapDrag(mode, origin, periodWidth, periodWidth, np);
      expect(result.periodCount).toBe(0);
      expect(result.startPeriod).toBe(6);
    }
  });

  it('clamps to [1, np]', () => {
    const origin = { startPeriod: 5, periodCount: 0 };
    const low = snapDrag('move', origin, -periodWidth * 20, periodWidth, np);
    expect(low.startPeriod).toBe(1);
    const high = snapDrag('move', origin, periodWidth * 20, periodWidth, np);
    expect(high.startPeriod).toBe(np);
  });
});

describe('stripeSegments', () => {
  const periodWidth = 20;

  it('returns nothing when no over-demand periods intersect the bar', () => {
    const segs = stripeSegments({ startPeriod: 3, periodCount: 2 }, [10, 11], periodWidth);
    expect(segs).toEqual([]);
  });

  it('covers exactly the affected periods inside the bar', () => {
    const segs = stripeSegments({ startPeriod: 3, periodCount: 4 }, [4, 5], periodWidth);
    expect(segs).toHaveLength(1);
    const bar = barRect(3, 4, periodWidth);
    expect(segs[0].left).toBeGreaterThanOrEqual(bar.left);
    expect(segs[0].left + segs[0].width).toBeLessThanOrEqual(bar.left + bar.width);
    // covers periods 4-5: from periodX(4) to periodX(6)
    expect(segs[0].left).toBe(periodX(4, periodWidth));
    expect(segs[0].width).toBe(periodX(6, periodWidth) - periodX(4, periodWidth));
  });

  it('clips a run that starts before the bar', () => {
    const bar = { startPeriod: 5, periodCount: 3 }; // periods 5..7
    const segs = stripeSegments(bar, [3, 4, 5, 6], periodWidth);
    expect(segs).toHaveLength(1);
    const rect = barRect(5, 3, periodWidth);
    expect(segs[0].left).toBe(rect.left); // clipped to the bar's own inset left edge
  });

  it('clips a run that ends after the bar', () => {
    const bar = { startPeriod: 5, periodCount: 3 }; // periods 5..7
    const segs = stripeSegments(bar, [6, 7, 8, 9], periodWidth);
    expect(segs).toHaveLength(1);
    const rect = barRect(5, 3, periodWidth);
    expect(segs[0].left + segs[0].width).toBe(rect.left + rect.width); // clipped to the bar's right edge
  });

  it('produces two segments for two non-adjacent over-demand runs', () => {
    const segs = stripeSegments({ startPeriod: 1, periodCount: 10 }, [2, 3, 7], periodWidth);
    expect(segs).toHaveLength(2);
  });

  it('a milestone (periodCount 0) has no stripe', () => {
    expect(stripeSegments({ startPeriod: 5, periodCount: 0 }, [5], periodWidth)).toEqual([]);
  });
});

describe('dropTargetAt / laneDropIndexAt / reorderWithin / indicatorY', () => {
  const RH = ROW_HEIGHT;
  // row0: Lane 1 (open)          row1: item 10        row2: item 11
  // row3: Lane 2 (open, empty)
  // row4: Lane 3 (collapsed)     row5(hidden): item 30 -- still in the descriptor list, just not "visible"
  const rows: RowDescriptor[] = [
    { kind: 'lane', id: 1, laneId: 1, collapsed: false },
    { kind: 'item', id: 10, laneId: 1, collapsed: false },
    { kind: 'item', id: 11, laneId: 1, collapsed: false },
    { kind: 'lane', id: 2, laneId: 2, collapsed: false },
    { kind: 'lane', id: 3, laneId: 3, collapsed: true },
  ];
  // A separate fixture whose collapsed lane 3 actually carries an item, to prove
  // "collapsed -> append" rather than "collapsed -> head".
  const rowsWithHiddenItem: RowDescriptor[] = [
    ...rows,
    { kind: 'item', id: 30, laneId: 3, collapsed: false },
  ];

  it('lands on a lane row -> head of that lane', () => {
    expect(dropTargetAt(0, rows, RH, 99)).toEqual({ laneId: 1, index: 0 });
  });

  it('above the first row clamps to the head of the first lane', () => {
    expect(dropTargetAt(-1000, rows, RH, 99)).toEqual({ laneId: 1, index: 0 });
  });

  it('below the last row clamps to the tail of the last lane', () => {
    expect(dropTargetAt(100000, rows, RH, 99)).toEqual({ laneId: 3, index: 0 }); // lane 3 has no items in `rows`
    expect(dropTargetAt(100000, rowsWithHiddenItem, RH, 99)).toEqual({ laneId: 3, index: 1 });
  });

  it('lands between two items -> inserts at that index', () => {
    // Boundary between item 10 (row1) and item 11 (row2): slot = round(51/34) = 2.
    expect(dropTargetAt(51, rows, RH, 99)).toEqual({ laneId: 1, index: 1 });
  });

  it('empty lane resolves to index 0', () => {
    // Lane 2's own header row, no items.
    expect(dropTargetAt(3 * RH, rows, RH, 99)).toEqual({ laneId: 2, index: 0 });
  });

  it('collapsed lane appends to the end instead of resolving to head', () => {
    // Lane 3's header row (index 4), with one hidden item already in it.
    expect(dropTargetAt(4 * RH, rowsWithHiddenItem, RH, 99)).toEqual({ laneId: 3, index: 1 });
  });

  it('drop on own position resolves to the item\'s current index -- a no-op', () => {
    // Item 10's own row, dragging item 10 itself.
    expect(dropTargetAt(1 * RH, rows, RH, 10)).toEqual({ laneId: 1, index: 0 });
    // Item 11's own row, dragging item 11 itself -> still index 1 (its current position).
    expect(dropTargetAt(2 * RH, rows, RH, 11)).toEqual({ laneId: 1, index: 1 });
  });

  it('cross-lane: dragged item excluded from its ORIGIN lane never shifts the target lane index', () => {
    // Dragging item 10 (lane 1) onto lane 2's empty header -> lane 2 unaffected by item 10's removal from lane 1.
    expect(dropTargetAt(3 * RH, rows, RH, 10)).toEqual({ laneId: 2, index: 0 });
  });

  it('laneDropIndexAt: near the top resolves to the first lane, past every midpoint appends at the end', () => {
    expect(laneDropIndexAt(0, rows, RH)).toBe(0);
    expect(laneDropIndexAt(100000, rows, RH)).toBe(3); // 3 lanes -> append index 3
  });

  it('laneDropIndexAt: empty rows resolves to 0', () => {
    expect(laneDropIndexAt(0, [], RH)).toBe(0);
  });

  it('reorderWithin moves an element and clamps an out-of-range target', () => {
    expect(reorderWithin([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(reorderWithin([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(reorderWithin([1, 2, 3], 0, 999)).toEqual([2, 3, 1]); // clamped to the end
  });

  it('reorderWithin is a no-op copy when `from` is out of range', () => {
    expect(reorderWithin([1, 2, 3], -1, 0)).toEqual([1, 2, 3]);
  });

  it('indicatorY draws at the top of the target item row', () => {
    expect(indicatorY({ laneId: 1, index: 0 }, rows, RH)).toBe(1 * RH);
    expect(indicatorY({ laneId: 1, index: 1 }, rows, RH)).toBe(2 * RH);
  });

  it('indicatorY for an append target draws just past the lane\'s last row', () => {
    // Lane 1 has 2 items -> appending draws right where lane 2's header starts.
    expect(indicatorY({ laneId: 1, index: 2 }, rows, RH)).toBe(3 * RH);
  });

  it('indicatorY for an empty lane draws right after its own header', () => {
    expect(indicatorY({ laneId: 2, index: 0 }, rows, RH)).toBe(4 * RH);
  });
});

describe('zoom ladder', () => {
  it('zoomStep clamps within the ladder', () => {
    expect(zoomStep(0, -1)).toBe(0);
    expect(zoomStep(ZOOM_LADDER.length - 1, 1)).toBe(ZOOM_LADDER.length - 1);
    expect(zoomStep(2, 1)).toBe(3);
  });

  it('fit picks the widest rung that fits the container', () => {
    const idx = fit(10, 200); // 200/10 = 20px/period max
    expect(ZOOM_LADDER[idx]).toBeLessThanOrEqual(20);
    // the next rung up would overflow
    if (idx + 1 < ZOOM_LADDER.length) {
      expect(10 * ZOOM_LADDER[idx + 1]).toBeGreaterThan(200);
    }
  });

  it('fit falls back to the smallest rung when even that overflows', () => {
    const idx = fit(1000, 100);
    expect(idx).toBe(0);
  });
});

describe('laneBarRect', () => {
  it('agrees with barRect edge for edge — the two agree by construction', () => {
    const periodWidth = 24;
    expect(laneBarRect(3, 4, periodWidth)).toEqual(barRect(3, 4, periodWidth));
  });
});

describe('laneSummaryPath', () => {
  it('draws caps LANE_CAP_WIDTH in from each edge at a normal width', () => {
    const rect = { left: 100, width: 80 }; // >> 2 * LANE_CAP_WIDTH
    const d = laneSummaryPath(rect);
    expect(d).toContain(`L ${LANE_CAP_WIDTH} `);
    expect(d).toContain(`L ${rect.width - LANE_CAP_WIDTH} `);
  });

  it('shrinks the caps to half the rect when narrower than 2 * LANE_CAP_WIDTH, meeting but never crossing', () => {
    const rect = { left: 0, width: LANE_CAP_WIDTH }; // < 2 * LANE_CAP_WIDTH
    const d = laneSummaryPath(rect);
    const half = rect.width / 2;
    // both the left cap's inner edge and the right cap's inner edge land on the same x —
    // they meet exactly, never overlap past each other.
    const occurrences = d.split(`${half} `).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('at exactly 2 * LANE_CAP_WIDTH the caps meet the un-shrunk boundary', () => {
    const rect = { left: 0, width: 2 * LANE_CAP_WIDTH };
    const d = laneSummaryPath(rect);
    expect(d).toContain(`L ${LANE_CAP_WIDTH} `);
  });

  it('is drawn in local coordinates starting at 0, independent of rect.left', () => {
    const a = laneSummaryPath({ left: 0, width: 40 });
    const b = laneSummaryPath({ left: 500, width: 40 });
    expect(a).toBe(b);
  });
});

describe('laneMilestoneXs', () => {
  it('reuses milestoneX for each rolled-up period', () => {
    const periodWidth = 20;
    expect(laneMilestoneXs([2, 5], periodWidth)).toEqual([milestoneX(2, periodWidth), milestoneX(5, periodWidth)]);
  });

  it('empty periods -> empty ticks', () => {
    expect(laneMilestoneXs([], 20)).toEqual([]);
  });
});
