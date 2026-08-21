import { describe, it, expect } from 'vitest';
import {
  periodX,
  periodAtX,
  barRect,
  milestoneX,
  phaseBands,
  rowAt,
  snapDrag,
  stripeSegments,
  fit,
  zoomStep,
  ZOOM_LADDER,
  BAR_INSET,
} from './roadmapGeometry';

describe('periodX / periodAtX', () => {
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

  it('never returns a period below 1', () => {
    expect(periodAtX(-100, 20)).toBe(1);
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
