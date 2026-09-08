import { describe, it, expect } from 'vitest';
import { WbsItem, WbsEstimate, Phase } from '../services/api';
import { buildWbsTree } from './wbsTree';
import {
  effectiveRoadmapItems,
  scopeLeaves,
  itemEffort,
  totalHours,
  coverage,
  bootstrapRoadmap,
  periodToDate,
  toRoadmapRows,
  convertRoadmapItemsToMonthly,
  convertRoadmapItemsToWeekly,
  remapRoadmapItemsForPhaseChange,
  laneSpan,
  recomputeLaneSpans,
  RoadmapLinkRecord,
  RoadmapRow,
  RoadmapRowItem,
} from './roadmap';

let nextId = 1;
function estimate(role: string, hours: number, discipline = 'Engineering'): WbsEstimate {
  return { id: nextId++, discipline, role, hours, wbsItemId: 0, createdAt: '', updatedAt: '' };
}
function wbsItem(
  overrides: Partial<WbsItem> & { id: number; name: string }
): WbsItem {
  return {
    parentId: null,
    phaseName: null,
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    estimates: [],
    ...overrides,
  };
}

const PHASES: Phase[] = [
  { name: 'Discovery', periodCount: 2, color: '#fff' },
  { name: 'Build', periodCount: 6, color: '#000' },
  { name: 'Launch', periodCount: 2, color: '#abc' },
];

describe('effectiveRoadmapItems', () => {
  it('empty WBS -> empty map', () => {
    const tree = buildWbsTree([]);
    expect(effectiveRoadmapItems(tree, []).size).toBe(0);
  });

  it('a node with no link and no linked ancestor resolves to null', () => {
    const items = [wbsItem({ id: 1, name: 'Root' })];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, []);
    expect(eff.get(1)).toEqual({ roadmapItemId: null, inherited: false });
  });

  it('linking a depth-1 node places its whole subtree with one link', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root' }),
      wbsItem({ id: 2, name: 'Child', parentId: 1 }),
      wbsItem({ id: 3, name: 'Grandchild', parentId: 2 }),
    ];
    const tree = buildWbsTree(items);
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 2, roadmapItemId: 100 }];
    const eff = effectiveRoadmapItems(tree, links);
    expect(eff.get(1)).toEqual({ roadmapItemId: null, inherited: false });
    expect(eff.get(2)).toEqual({ roadmapItemId: 100, inherited: false });
    expect(eff.get(3)).toEqual({ roadmapItemId: 100, inherited: true });
  });

  it('a grandchild linked to a DIFFERENT item carves only it and its descendants out', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root' }),
      wbsItem({ id: 2, name: 'Child', parentId: 1 }),
      wbsItem({ id: 3, name: 'Grandchild', parentId: 2 }),
      wbsItem({ id: 4, name: 'GreatGrandchild', parentId: 3 }),
      wbsItem({ id: 5, name: 'OtherGrandchild', parentId: 2 }),
    ];
    const tree = buildWbsTree(items);
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 2, roadmapItemId: 100 },
      { wbsItemId: 3, roadmapItemId: 200 },
    ];
    const eff = effectiveRoadmapItems(tree, links);
    expect(eff.get(2)?.roadmapItemId).toBe(100);
    expect(eff.get(3)?.roadmapItemId).toBe(200); // carved out
    expect(eff.get(4)?.roadmapItemId).toBe(200); // carved subtree
    expect(eff.get(5)?.roadmapItemId).toBe(100); // sibling untouched
  });

  it('a link on a leaf places only the leaf', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root' }),
      wbsItem({ id: 2, name: 'Leaf', parentId: 1 }),
    ];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, [{ wbsItemId: 2, roadmapItemId: 100 }]);
    expect(eff.get(1)?.roadmapItemId).toBeNull();
    expect(eff.get(2)?.roadmapItemId).toBe(100);
  });
});

describe('itemEffort / scopeLeaves', () => {
  it('an item with no scope has zero effort', () => {
    const items = [wbsItem({ id: 1, name: 'Root' })];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, []);
    expect(scopeLeaves(100, tree, eff)).toEqual([]);
    expect(totalHours(itemEffort(100, items, tree, eff))).toBe(0);
  });

  it('sums own estimates over the whole inherited subtree, by role', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', estimates: [estimate('Backend', 10)] }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, estimates: [estimate('Backend', 20), estimate('QA', 5)] }),
    ];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, [{ wbsItemId: 1, roadmapItemId: 100 }]);
    const effort = itemEffort(100, items, tree, eff);
    expect(effort.get('Backend')).toBe(30);
    expect(effort.get('QA')).toBe(5);
    expect(totalHours(effort)).toBe(35);
  });

  it('a linked parent with an unlinked subtree still rolls the subtree up (no deeper link exists)', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', estimates: [estimate('PM', 8)] }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, estimates: [estimate('Backend', 12)] }),
    ];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, [{ wbsItemId: 1, roadmapItemId: 100 }]);
    expect(scopeLeaves(100, tree, eff).sort()).toEqual([1, 2]);
    expect(totalHours(itemEffort(100, items, tree, eff))).toBe(20);
  });

  it('a grandchild carved out to another item is excluded from the ancestor item effort', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', estimates: [estimate('PM', 4)] }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, estimates: [estimate('Backend', 10)] }),
      wbsItem({ id: 3, name: 'Grandchild', parentId: 2, estimates: [estimate('Frontend', 6)] }),
    ];
    const tree = buildWbsTree(items);
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 1, roadmapItemId: 100 },
      { wbsItemId: 3, roadmapItemId: 200 },
    ];
    const eff = effectiveRoadmapItems(tree, links);
    expect(totalHours(itemEffort(100, items, tree, eff))).toBe(14); // 4 + 10, not 6
    expect(totalHours(itemEffort(200, items, tree, eff))).toBe(6);
  });
});

describe('coverage', () => {
  it('empty WBS -> everything zero', () => {
    const report = coverage([], [], [], PHASES);
    expect(report.unplaced).toEqual([]);
    expect(report.unplacedHours).toBe(0);
    expect(report.unplacedShare).toBe(0);
    expect(report.unplaceable).toEqual([]);
    expect(report.empty).toEqual([]);
    expect(report.phaseMismatch).toEqual([]);
  });

  it('empty roadmap -> all WBS hours are unplaced', () => {
    const items = [wbsItem({ id: 1, name: 'Root', estimates: [estimate('Backend', 40)] })];
    const report = coverage(items, [], [], PHASES);
    expect(report.unplaced).toEqual([{ wbsItemId: 1, hours: 40 }]);
    expect(report.unplacedHours).toBe(40);
    expect(report.unplacedShare).toBe(1);
  });

  it('a linked parent with an unlinked subtree: nothing unplaced under it', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', estimates: [estimate('PM', 8)] }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, estimates: [estimate('Backend', 12)] }),
    ];
    const roadmapItems = [{ id: 100, kind: 'bar' as const, startPeriod: 1, periodCount: 2 }];
    const report = coverage(items, [{ wbsItemId: 1, roadmapItemId: 100 }], roadmapItems, PHASES);
    expect(report.unplaced).toEqual([]);
    expect(report.unplacedHours).toBe(0);
  });

  it('a grandchild carved out to another item: only the OUTER unplaced remainder is reported', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', estimates: [estimate('PM', 4)] }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, estimates: [estimate('Backend', 10)] }),
      wbsItem({ id: 3, name: 'Sibling', parentId: 1, estimates: [estimate('Frontend', 6)] }),
    ];
    // Only 'Sibling' subtree is linked; Root+Child stay unplaced together.
    const roadmapItems = [{ id: 200, kind: 'bar' as const, startPeriod: 1, periodCount: 2 }];
    const report = coverage(items, [{ wbsItemId: 3, roadmapItemId: 200 }], roadmapItems, PHASES);
    expect(report.unplaced).toEqual([{ wbsItemId: 1, hours: 14 }]);
  });

  it('a leaf with no effective item and no effective phase is unplaceable', () => {
    const items = [wbsItem({ id: 1, name: 'Root', phaseName: null, estimates: [estimate('Backend', 5)] })];
    const report = coverage(items, [], [], PHASES);
    expect(report.unplaceable).toEqual([{ wbsItemId: 1, hours: 5 }]);
  });

  it('a leaf with a phase but no roadmap item is unplaced but NOT unplaceable', () => {
    const items = [wbsItem({ id: 1, name: 'Root', phaseName: 'Build', estimates: [estimate('Backend', 5)] })];
    const report = coverage(items, [], [], PHASES);
    expect(report.unplaceable).toEqual([]);
    expect(report.unplacedHours).toBe(5);
  });

  it('an item with no scope leaves is empty', () => {
    const items = [wbsItem({ id: 1, name: 'Root', estimates: [estimate('Backend', 5)] })];
    const roadmapItems = [{ id: 100, kind: 'bar' as const, startPeriod: 1, periodCount: 2 }];
    const report = coverage(items, [], roadmapItems, PHASES);
    expect(report.empty).toEqual([100]);
  });

  it('a milestone is never reported as empty', () => {
    const roadmapItems = [{ id: 100, kind: 'milestone' as const, startPeriod: 1, periodCount: 0 }];
    const report = coverage([], [], roadmapItems, PHASES);
    expect(report.empty).toEqual([]);
  });

  it('phase mismatch: item window shares no period with the leaf effective phase', () => {
    // Build phase = periods 3..8. Item window = periods 9..10 (Launch) -> mismatch.
    const items = [wbsItem({ id: 1, name: 'Leaf', phaseName: 'Build', estimates: [estimate('Backend', 5)] })];
    const roadmapItems = [{ id: 100, kind: 'bar' as const, startPeriod: 9, periodCount: 2 }];
    const report = coverage(items, [{ wbsItemId: 1, roadmapItemId: 100 }], roadmapItems, PHASES);
    expect(report.phaseMismatch).toEqual([{ roadmapItemId: 100, wbsItemId: 1, phaseName: 'Build' }]);
  });

  it('no phase mismatch when the window overlaps the phase at all', () => {
    const items = [wbsItem({ id: 1, name: 'Leaf', phaseName: 'Build', estimates: [estimate('Backend', 5)] })];
    // Build = periods 3..8; item 7..10 overlaps at 7-8.
    const roadmapItems = [{ id: 100, kind: 'bar' as const, startPeriod: 7, periodCount: 4 }];
    const report = coverage(items, [{ wbsItemId: 1, roadmapItemId: 100 }], roadmapItems, PHASES);
    expect(report.phaseMismatch).toEqual([]);
  });
});

describe('milestones refuse scope (enforced by callers; coverage stays well-defined)', () => {
  it('a milestone with a (would-be-invalid) link still resolves through effectiveRoadmapItems', () => {
    // The invariant ("milestone carries no scope") is enforced at the API boundary,
    // not here — this only proves the pure layer does not crash or lie about it.
    const items = [wbsItem({ id: 1, name: 'Leaf', estimates: [estimate('Backend', 5)] })];
    const tree = buildWbsTree(items);
    const eff = effectiveRoadmapItems(tree, [{ wbsItemId: 1, roadmapItemId: 999 }]);
    expect(eff.get(1)?.roadmapItemId).toBe(999);
  });
});

describe('bootstrapRoadmap', () => {
  it('a one-level tree yields one lane per depth-0 leaf, each with one same-named item', () => {
    const items = [
      wbsItem({ id: 1, name: 'Design', phaseName: 'Discovery', estimates: [estimate('Design', 10)] }),
      wbsItem({ id: 2, name: 'Build it', phaseName: 'Build', estimates: [estimate('Backend', 20)] }),
    ];
    const result = bootstrapRoadmap(items, PHASES);
    expect(result.lanes).toHaveLength(2);
    expect(result.lanes[0].name).toBe('Design');
    expect(result.lanes[0].items).toEqual([
      { name: 'Design', startPeriod: 1, periodCount: 2, wbsItemIds: [1], hours: 10, phaseName: 'Discovery', flagged: false },
    ]);
    expect(result.lanes[1].items[0].startPeriod).toBe(3); // Build starts at period 3
    expect(result.lanes[1].items[0].periodCount).toBe(6);
  });

  it('a two-level tree: depth-0 nodes become lanes, depth-1 nodes become items linked to themselves', () => {
    const items = [
      wbsItem({ id: 1, name: 'Platform' }),
      wbsItem({ id: 2, name: 'Backend', parentId: 1, phaseName: 'Build', estimates: [estimate('Backend', 40)] }),
      wbsItem({ id: 3, name: 'Frontend', parentId: 1, phaseName: 'Build', estimates: [estimate('Frontend', 30)] }),
    ];
    const result = bootstrapRoadmap(items, PHASES);
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0].name).toBe('Platform');
    expect(result.lanes[0].items.map((i) => i.name)).toEqual(['Backend', 'Frontend']);
    expect(result.lanes[0].items[0].wbsItemIds).toEqual([2]);
  });

  it('a depth-1 node with no effective phase spans the whole project and is flagged', () => {
    const items = [
      wbsItem({ id: 1, name: 'Platform' }),
      wbsItem({ id: 2, name: 'Ops', parentId: 1, phaseName: null, estimates: [estimate('PM', 10)] }),
    ];
    const result = bootstrapRoadmap(items, PHASES);
    const item = result.lanes[0].items[0];
    expect(item.flagged).toBe(true);
    expect(item.startPeriod).toBe(1);
    expect(item.periodCount).toBe(10); // 2+6+2
  });

  it('a depth-0 leaf (no children) becomes its own lane with one item', () => {
    const items = [
      wbsItem({ id: 1, name: 'Platform' }),
      wbsItem({ id: 2, name: 'Child', parentId: 1, phaseName: 'Build', estimates: [estimate('Backend', 5)] }),
      wbsItem({ id: 3, name: 'Contingency', phaseName: 'Launch', estimates: [estimate('PM', 8)] }),
    ];
    const result = bootstrapRoadmap(items, PHASES);
    expect(result.lanes).toHaveLength(2);
    const contingencyLane = result.lanes.find((l) => l.name === 'Contingency')!;
    expect(contingencyLane.items).toEqual([
      { name: 'Contingency', startPeriod: 9, periodCount: 2, wbsItemIds: [3], hours: 8, phaseName: 'Launch', flagged: false },
    ]);
  });

  it('after apply, every leaf with an effective phase is placed (zero unplaced hours)', () => {
    const items = [
      wbsItem({ id: 1, name: 'Platform' }),
      wbsItem({ id: 2, name: 'Backend', parentId: 1, phaseName: 'Build', estimates: [estimate('Backend', 40)] }),
      wbsItem({ id: 3, name: 'Deep', parentId: 2, estimates: [estimate('Backend', 5)] }), // inherits phase
      wbsItem({ id: 4, name: 'Contingency', phaseName: 'Launch', estimates: [estimate('PM', 8)] }),
    ];
    const preview = bootstrapRoadmap(items, PHASES);
    // Simulate apply: one direct link per preview item at the node it names.
    const links: RoadmapLinkRecord[] = [];
    let nextRoadmapId = 100;
    preview.lanes.forEach((lane) => {
      lane.items.forEach((item) => {
        const roadmapItemId = nextRoadmapId++;
        item.wbsItemIds.forEach((wbsItemId) => links.push({ wbsItemId, roadmapItemId }));
      });
    });
    const roadmapItemsForCoverage = links.map((l, i) => ({
      id: l.roadmapItemId,
      kind: 'bar' as const,
      startPeriod: 1,
      periodCount: 1,
    }));
    const report = coverage(items, links, roadmapItemsForCoverage, PHASES);
    expect(report.unplacedHours).toBe(0);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inverse of `periodToDate`, reimplemented here since production only needs the forward direction. */
function dateToPeriod(date: Date, planningMode: 'weekly' | 'monthly', startDate: string | null): number | null {
  if (startDate == null) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  if (planningMode === 'monthly') {
    return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth()) + 1;
  }
  return Math.floor(Math.floor((date.getTime() - start.getTime()) / DAY_MS) / 7) + 1;
}

describe('calendar round-trip', () => {
  it('round-trips exactly at period boundaries with a startDate (weekly)', () => {
    const startDate = '2026-01-05'; // Monday
    for (let period = 1; period <= 10; period++) {
      const date = periodToDate(period, 'weekly', startDate)!;
      expect(dateToPeriod(date, 'weekly', startDate)).toBe(period);
    }
  });

  it('round-trips exactly at period boundaries with a startDate (monthly)', () => {
    const startDate = '2026-01-01';
    for (let period = 1; period <= 10; period++) {
      const date = periodToDate(period, 'monthly', startDate)!;
      expect(dateToPeriod(date, 'monthly', startDate)).toBe(period);
    }
  });

  it('without startDate, the adapter returns null', () => {
    expect(periodToDate(3, 'weekly', null)).toBeNull();
  });
});

describe('toRoadmapRows', () => {
  it('produces a lane row followed by its item rows, sums hours/fte on the lane', () => {
    const lanes = [{ id: 1, name: 'Backend', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'API', kind: 'bar' as const, startPeriod: 1, periodCount: 2, displayOrder: 0, wbsItemIds: [1] },
      { id: 11, laneId: 1, name: 'Launch', kind: 'milestone' as const, startPeriod: 3, periodCount: 0, displayOrder: 1, wbsItemIds: [] },
    ];
    const effort = new Map([[10, new Map([['Backend', 80]])]]);
    const rows = toRoadmapRows(lanes, items, effort, new Set(), 40, 20);
    expect(rows.map((r) => r.kind)).toEqual(['lane', 'bar', 'milestone']);
    expect(rows[0].hours).toBe(80);
    expect(rows[1].fte).toBe(1); // 80h / (2 periods * 40h)
    expect(rows[2].fte).toBe(0);
  });

  it('collapsing a lane hides its items but keeps the lane row', () => {
    const lanes = [{ id: 1, name: 'Backend', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'API', kind: 'bar' as const, startPeriod: 1, periodCount: 2, displayOrder: 0, wbsItemIds: [] },
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set([1]), 40, 20);
    expect(rows).toHaveLength(1);
    expect(rows[0].collapsed).toBe(true);
  });

  it('an unlinked bar is emptyScope even when hours are present; a milestone never is', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'Empty bar', kind: 'bar' as const, startPeriod: 1, periodCount: 2, displayOrder: 0, wbsItemIds: [] },
      { id: 11, laneId: 1, name: 'MS', kind: 'milestone' as const, startPeriod: 3, periodCount: 0, displayOrder: 1, wbsItemIds: [] },
    ];
    const effort = new Map([[10, new Map([['Backend', 80]])]]);
    const rows = toRoadmapRows(lanes, items, effort, new Set(), 40, 20);
    expect(rows.find((r) => r.id === 10)?.emptyScope).toBe(true);
    expect(rows.find((r) => r.id === 10)?.hours).toBe(80);
    expect(rows.find((r) => r.id === 11)?.emptyScope).toBe(false);
  });

  it('a linked bar with no estimates is not emptyScope', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'Linked empty', kind: 'bar' as const, startPeriod: 1, periodCount: 2, displayOrder: 0, wbsItemIds: [99] },
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    expect(rows.find((r) => r.id === 10)?.emptyScope).toBe(false);
    expect(rows.find((r) => r.id === 10)?.hours).toBe(0);
  });

  it('carries the item colour through, defaulting when omitted', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'Blue', kind: 'bar' as const, startPeriod: 1, periodCount: 2, displayOrder: 0, wbsItemIds: [], color: '#417B9E' },
      { id: 11, laneId: 1, name: 'Default', kind: 'bar' as const, startPeriod: 3, periodCount: 1, displayOrder: 1, wbsItemIds: [] },
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    expect(rows.find((r) => r.id === 10)?.color).toBe('#417B9E');
    expect(rows.find((r) => r.id === 11)?.color).toBe('#5D6E85');
  });

  it('a spread item renders over the whole project [1, np], ignoring its stored (1, 0) sentinel', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 12, laneId: 1, name: 'PM', kind: 'spread' as const, startPeriod: 1, periodCount: 0, displayOrder: 0, wbsItemIds: [1] },
    ];
    const effort = new Map([[12, new Map([['PM', 400]])]]);
    const rows = toRoadmapRows(lanes, items, effort, new Set(), 40, 20);
    const row = rows.find((r) => r.id === 12)!;
    expect(row.startPeriod).toBe(1);
    expect(row.periodCount).toBe(20);
    expect(row.fte).toBe(0.5); // 400h / (20 periods * 40h)
    expect(row.emptyScope).toBe(false);
  });

  it('a spread item with no scope is flagged emptyScope', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 13, laneId: 1, name: 'Empty spread', kind: 'spread' as const, startPeriod: 1, periodCount: 0, displayOrder: 0, wbsItemIds: [] },
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    expect(rows.find((r) => r.id === 13)?.emptyScope).toBe(true);
  });

  it('a lane with two bars and a gap draws one span, not two — min/max over the gap', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'A', kind: 'bar' as const, startPeriod: 3, periodCount: 4, displayOrder: 0, wbsItemIds: [] }, // W3-6
      { id: 11, laneId: 1, name: 'B', kind: 'bar' as const, startPeriod: 9, periodCount: 4, displayOrder: 1, wbsItemIds: [] }, // W9-12
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    const lane = rows.find((r) => r.kind === 'lane')!;
    expect(lane.startPeriod).toBe(3);
    expect(lane.periodCount).toBe(10); // covers through W12
  });

  it('a trailing milestone extends the lane span', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'A', kind: 'bar' as const, startPeriod: 3, periodCount: 4, displayOrder: 0, wbsItemIds: [] }, // W3-6
      { id: 11, laneId: 1, name: 'MS', kind: 'milestone' as const, startPeriod: 14, periodCount: 0, displayOrder: 1, wbsItemIds: [] },
    ];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    const lane = rows.find((r) => r.kind === 'lane')!;
    expect(lane.startPeriod).toBe(3);
    expect(lane.periodCount).toBe(12); // W3..W14
  });

  it('a milestone-only lane spans one period', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [{ id: 10, laneId: 1, name: 'MS', kind: 'milestone' as const, startPeriod: 7, periodCount: 0, displayOrder: 0, wbsItemIds: [] }];
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20);
    const lane = rows.find((r) => r.kind === 'lane')!;
    expect(lane.startPeriod).toBe(7);
    expect(lane.periodCount).toBe(1);
  });

  it('a spread item never widens the span, but is reported via spreadItemCount/spreadItemNames', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'A', kind: 'bar' as const, startPeriod: 3, periodCount: 4, displayOrder: 0, wbsItemIds: [] }, // W3-6
      { id: 11, laneId: 1, name: 'B', kind: 'bar' as const, startPeriod: 9, periodCount: 4, displayOrder: 1, wbsItemIds: [] }, // W9-12
      { id: 12, laneId: 1, name: 'PM', kind: 'spread' as const, startPeriod: 1, periodCount: 0, displayOrder: 2, wbsItemIds: [] },
    ];
    const withSpread = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20).find((r) => r.kind === 'lane')!;
    const withoutSpread = toRoadmapRows(lanes, items.slice(0, 2), new Map(), new Set(), 40, 20).find(
      (r) => r.kind === 'lane'
    )!;
    expect(withSpread.startPeriod).toBe(withoutSpread.startPeriod);
    expect(withSpread.periodCount).toBe(withoutSpread.periodCount);
    expect(withSpread.spreadItemCount).toBe(1);
    expect(withSpread.spreadItemNames).toEqual(['PM']);
  });

  it('a lane with only spread items has no span (periodCount 0), chip alone marks it', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [{ id: 12, laneId: 1, name: 'PM', kind: 'spread' as const, startPeriod: 1, periodCount: 0, displayOrder: 0, wbsItemIds: [] }];
    const lane = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20).find((r) => r.kind === 'lane')!;
    expect(lane.periodCount).toBe(0);
    expect(lane.spreadItemCount).toBe(1);
  });

  it('an empty lane has no span and no items', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const lane = toRoadmapRows(lanes, [], new Map(), new Set(), 40, 20).find((r) => r.kind === 'lane')!;
    expect(lane.periodCount).toBe(0);
    expect(lane.itemCount).toBe(0);
    expect(lane.spreadItemCount).toBe(0);
  });

  it('rolls up milestone periods and the union of over-demand periods onto the lane row', () => {
    const lanes = [{ id: 1, name: 'Lane', displayOrder: 0 }];
    const items = [
      { id: 10, laneId: 1, name: 'A', kind: 'bar' as const, startPeriod: 3, periodCount: 4, displayOrder: 0, wbsItemIds: [] }, // W3-6
      { id: 11, laneId: 1, name: 'MS', kind: 'milestone' as const, startPeriod: 5, periodCount: 0, displayOrder: 1, wbsItemIds: [] },
      { id: 12, laneId: 1, name: 'B', kind: 'bar' as const, startPeriod: 8, periodCount: 3, displayOrder: 2, wbsItemIds: [] }, // W8-10
    ];
    const overDemandByItemId = new Map<number, number[]>([
      [10, [4]],
      [12, [9, 10]],
    ]);
    const rows = toRoadmapRows(lanes, items, new Map(), new Set(), 40, 20, overDemandByItemId);
    const lane = rows.find((r) => r.kind === 'lane')!;
    expect(lane.milestonePeriods).toEqual([5]);
    expect(lane.overDemandPeriods).toEqual([4, 9, 10]);
  });
});

describe('laneSpan', () => {
  function item(overrides: Partial<RoadmapRowItem> & Pick<RoadmapRowItem, 'kind' | 'startPeriod' | 'periodCount'>): RoadmapRowItem {
    return { id: 0, laneId: 1, name: '', displayOrder: 0, wbsItemIds: [], ...overrides };
  }

  it('returns null for an empty item list', () => {
    expect(laneSpan([])).toBeNull();
  });

  it('returns null when every item is a spread item', () => {
    const items = [item({ kind: 'spread', startPeriod: 1, periodCount: 0 })];
    expect(laneSpan(items)).toBeNull();
  });

  it('excludes a spread item from the min/max even alongside window-bearing items', () => {
    const items = [
      item({ kind: 'bar', startPeriod: 3, periodCount: 4 }),
      item({ kind: 'spread', startPeriod: 1, periodCount: 0 }),
    ];
    expect(laneSpan(items)).toEqual({ startPeriod: 3, periodCount: 4 });
  });

  it('a milestone contributes its own single period to the span', () => {
    const items = [item({ kind: 'milestone', startPeriod: 7, periodCount: 0 })];
    expect(laneSpan(items)).toEqual({ startPeriod: 7, periodCount: 1 });
  });
});

describe('recomputeLaneSpans', () => {
  function laneRow(overrides: Partial<RoadmapRow> & { id: number }): RoadmapRow {
    return {
      kind: 'lane',
      laneId: null,
      name: 'Lane',
      startPeriod: 1,
      periodCount: 0,
      hours: 0,
      fte: 0,
      emptyScope: false,
      overDemandPeriods: [],
      collapsed: false,
      milestonePeriods: [],
      spreadItemCount: 0,
      spreadItemNames: [],
      itemCount: 0,
      color: '#8f4f8f',
      ...overrides,
    };
  }
  function itemRow(overrides: Partial<RoadmapRow> & { id: number; laneId: number }): RoadmapRow {
    return {
      kind: 'bar',
      name: 'Item',
      startPeriod: 1,
      periodCount: 1,
      hours: 0,
      fte: 0,
      emptyScope: false,
      overDemandPeriods: [],
      collapsed: false,
      milestonePeriods: [],
      spreadItemCount: 0,
      spreadItemNames: [],
      itemCount: 0,
      color: '#8f4f8f',
      ...overrides,
    };
  }

  it('a null ghost returns the rows unchanged', () => {
    const rows = [laneRow({ id: 1, startPeriod: 3, periodCount: 4 })];
    expect(recomputeLaneSpans(rows, null)).toEqual(rows);
  });

  it('previews the ghosted window on the item’s own lane', () => {
    const rows = [
      laneRow({ id: 1, startPeriod: 3, periodCount: 4 }),
      itemRow({ id: 10, laneId: 1, kind: 'bar', startPeriod: 3, periodCount: 4 }),
    ];
    const next = recomputeLaneSpans(rows, { itemId: 10, laneId: 1, startPeriod: 6, periodCount: 4 });
    const lane = next.find((r) => r.kind === 'lane')!;
    expect(lane.startPeriod).toBe(6);
    expect(lane.periodCount).toBe(4);
  });

  it('a cross-lane drag recomputes both the source and destination lane', () => {
    const rows = [
      laneRow({ id: 1, startPeriod: 3, periodCount: 4 }),
      itemRow({ id: 10, laneId: 1, kind: 'bar', startPeriod: 3, periodCount: 4 }),
      laneRow({ id: 2, startPeriod: 10, periodCount: 2 }),
      itemRow({ id: 20, laneId: 2, kind: 'bar', startPeriod: 10, periodCount: 2 }),
    ];
    const next = recomputeLaneSpans(rows, { itemId: 10, laneId: 2, startPeriod: 15, periodCount: 4 });
    const laneA = next.find((r) => r.id === 1 && r.kind === 'lane')!;
    const laneB = next.find((r) => r.id === 2 && r.kind === 'lane')!;
    // Source lane is now empty of window-bearing items -> no span.
    expect(laneA.periodCount).toBe(0);
    // Destination lane covers both its own item and the ghosted one.
    expect(laneB.startPeriod).toBe(10);
    expect(laneB.periodCount).toBe(9); // W10..W18
  });

  it('rolls up the ghosted item into milestonePeriods when it is a milestone', () => {
    const rows = [
      laneRow({ id: 1, startPeriod: 3, periodCount: 4 }),
      itemRow({ id: 10, laneId: 1, kind: 'milestone', startPeriod: 5, periodCount: 0 }),
    ];
    const next = recomputeLaneSpans(rows, { itemId: 10, laneId: 1, startPeriod: 8, periodCount: 0 });
    const lane = next.find((r) => r.kind === 'lane')!;
    expect(lane.milestonePeriods).toEqual([8]);
    expect(lane.periodCount).toBe(1);
  });

  it('leaves unaffected lanes untouched', () => {
    const rows = [
      laneRow({ id: 1, startPeriod: 3, periodCount: 4 }),
      itemRow({ id: 10, laneId: 1, kind: 'bar', startPeriod: 3, periodCount: 4 }),
      laneRow({ id: 2, startPeriod: 10, periodCount: 2 }),
      itemRow({ id: 20, laneId: 2, kind: 'bar', startPeriod: 10, periodCount: 2 }),
    ];
    const next = recomputeLaneSpans(rows, { itemId: 10, laneId: 1, startPeriod: 6, periodCount: 4 });
    const laneB = next.find((r) => r.id === 2 && r.kind === 'lane')!;
    expect(laneB).toEqual(rows[2]);
  });
});

describe('weekly <-> monthly conversion', () => {
  const weeksPerMonth = 4;

  it('coarsens weekly bars to monthly with ceil, clamped', () => {
    const items = [{ startPeriod: 1, periodCount: 4 }]; // weeks 1-4 -> month 1
    const converted = convertRoadmapItemsToMonthly(items, weeksPerMonth, 3);
    expect(converted[0]).toEqual({ startPeriod: 1, periodCount: 1 });
  });

  it('a multi-month-spanning weekly bar converts to a multi-period monthly bar', () => {
    const items = [{ startPeriod: 1, periodCount: 9 }]; // weeks 1-9 -> months 1-3
    const converted = convertRoadmapItemsToMonthly(items, weeksPerMonth, 3);
    expect(converted[0]).toEqual({ startPeriod: 1, periodCount: 3 });
  });

  it('a milestone keeps periodCount 0 and maps startPeriod by boundary', () => {
    const items = [{ startPeriod: 5, periodCount: 0 }]; // week 5 -> month 2
    const converted = convertRoadmapItemsToMonthly(items, weeksPerMonth, 3);
    expect(converted[0]).toEqual({ startPeriod: 2, periodCount: 0 });
  });

  it('splits monthly bars to weekly with round, clamped', () => {
    const items = [{ startPeriod: 1, periodCount: 1 }]; // month 1 -> weeks 1-4
    const converted = convertRoadmapItemsToWeekly(items, weeksPerMonth, 16);
    expect(converted[0]).toEqual({ startPeriod: 1, periodCount: 4 });
  });

  it('clamps into [1, projectPeriodCount] on both directions', () => {
    const monthly = convertRoadmapItemsToMonthly([{ startPeriod: 100, periodCount: 4 }], weeksPerMonth, 3);
    expect(monthly[0].startPeriod).toBeLessThanOrEqual(3);
    const weekly = convertRoadmapItemsToWeekly([{ startPeriod: 100, periodCount: 4 }], weeksPerMonth, 16);
    expect(weekly[0].startPeriod).toBeLessThanOrEqual(16);
  });
});

describe('remapRoadmapItemsForPhaseChange', () => {
  it('remaps startPeriod only via the periodMap, preserving periodCount', () => {
    const periodMap = new Map([[1, 5], [2, 6]]);
    const items = [{ startPeriod: 1, periodCount: 3 }];
    const remapped = remapRoadmapItemsForPhaseChange(items, periodMap);
    expect(remapped[0]).toEqual({ startPeriod: 5, periodCount: 3 });
  });

  it('an unmapped startPeriod is left untouched (kept, not clamped/dropped)', () => {
    const periodMap = new Map<number, number>();
    const items = [{ startPeriod: 9, periodCount: 2 }];
    const remapped = remapRoadmapItemsForPhaseChange(items, periodMap);
    expect(remapped[0]).toEqual({ startPeriod: 9, periodCount: 2 });
  });
});
