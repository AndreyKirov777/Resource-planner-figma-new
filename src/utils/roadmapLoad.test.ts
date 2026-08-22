import { describe, it, expect } from 'vitest';
import { WbsItem, WbsEstimate, Phase, ResourcePlan, Allocation, RateCard } from '../services/api';
import { buildReconciliationReport } from './wbs';
import { RoadmapLinkRecord } from './roadmap';
import {
  buildRoadmapLoad,
  demandHours,
  demandFte,
  supplyHours,
  variance,
  feasiblePeriods,
  totalDemandHours,
  spreadDistribution,
  contributorsForPeriod,
  buildByPeriodMatrix,
  feasiblePeriodsDetail,
  avgSupplyFteOverWindow,
  worstConflictInWindow,
  RoadmapLoadInput,
  RoadmapLoadItemInput,
} from './roadmapLoad';

let nextId = 1;
function estimate(overrides: Partial<WbsEstimate>): WbsEstimate {
  return { id: nextId++, discipline: 'Engineering', role: '', hours: 0, wbsItemId: 1, createdAt: '', updatedAt: '', ...overrides };
}
function wbsItem(overrides: Partial<WbsItem> & { id: number }): WbsItem {
  return {
    name: 'Item',
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
function allocation(overrides: Partial<Allocation>): Allocation {
  return { id: nextId++, periodNumber: 1, allocation: 100, resourcePlanId: 1, createdAt: '', updatedAt: '', ...overrides };
}
function resourcePlan(overrides: Partial<ResourcePlan>): ResourcePlan {
  return {
    id: nextId++,
    role: 'Backend Developer',
    intHourlyRate: 0,
    clientHourlyRate: 0,
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    allocations: [],
    ...overrides,
  };
}
function rateCard(overrides: Partial<RateCard>): RateCard {
  return {
    id: nextId++,
    role: 'Backend Developer',
    namingInPM: 'Backend Developer',
    discipline: 'Engineering',
    ukraine: 0,
    easternEurope: 0,
    asiaGE: 0,
    asiaARMKZ: 0,
    latam: 0,
    mexico: 0,
    india: 0,
    newYork: 0,
    london: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
function roadmapItem(overrides: Partial<RoadmapLoadItemInput> & { id: number }): RoadmapLoadItemInput {
  return { name: 'Item', kind: 'bar', startPeriod: 1, periodCount: 1, ...overrides };
}

const PHASES: Phase[] = [
  { name: 'Discovery', periodCount: 2, color: '#fff' },
  { name: 'Build', periodCount: 6, color: '#000' },
];
const NP = 8; // 2 + 6
const HRS_PER_PERIOD = 40; // weekly

function load(overrides: Partial<RoadmapLoadInput>): ReturnType<typeof buildRoadmapLoad> {
  const input: RoadmapLoadInput = {
    wbsItems: [],
    roadmapItems: [],
    links: [],
    resourcePlans: [],
    rateCards: [],
    phases: PHASES,
    planningMode: 'weekly',
    daysInFTE: 20,
    ...overrides,
  };
  return buildRoadmapLoad(input);
}

describe('buildRoadmapLoad — empty project', () => {
  it('produces zero demand and zero unplaceable hours everywhere', () => {
    const l = load({});
    expect(totalDemandHours(l)).toBe(0);
    expect(l.unplaceableHours).toBe(0);
    expect(demandHours(l, 'role', 'Backend Developer', 1)).toBe(0);
    expect(supplyHours(l, 'role', 'Backend Developer', 1)).toBe(0);
  });
});

describe('buildRoadmapLoad — phase baseline only (producer 2)', () => {
  it('spreads an unplaced leaf\'s own hours evenly over its effective phase', () => {
    const leaf = wbsItem({
      id: 1,
      phaseName: 'Discovery',
      estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 100 })],
    });
    const l = load({ wbsItems: [leaf] });
    // Discovery is periods 1-2: 100h / 2 periods = 50h/period.
    expect(demandHours(l, 'role', 'Backend Developer', 1)).toBe(50);
    expect(demandHours(l, 'role', 'Backend Developer', 2)).toBe(50);
    expect(demandHours(l, 'role', 'Backend Developer', 3)).toBe(0); // outside Discovery
    expect(l.unplaceableHours).toBe(0);
  });
});

describe('buildRoadmapLoad — two overlapping items in one period', () => {
  it('sums both items\' demand for a period they both cover', () => {
    const leafA = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 80 })] });
    const leafB = wbsItem({ id: 2, estimates: [estimate({ wbsItemId: 2, role: 'Backend Developer', hours: 40 })] });
    const items: RoadmapLoadItemInput[] = [
      roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 }),
      roadmapItem({ id: 101, startPeriod: 3, periodCount: 4 }),
    ];
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 1, roadmapItemId: 100 },
      { wbsItemId: 2, roadmapItemId: 101 },
    ];
    const l = load({ wbsItems: [leafA, leafB], roadmapItems: items, links });
    // Item 100: 80h/4 = 20h/period over periods 1-4. Item 101: 40h/4 = 10h/period over periods 3-6.
    expect(demandHours(l, 'role', 'Backend Developer', 1)).toBe(20);
    expect(demandHours(l, 'role', 'Backend Developer', 3)).toBe(30); // 20 + 10, both cover period 3
    expect(demandHours(l, 'role', 'Backend Developer', 5)).toBe(10);
  });
});

describe('buildRoadmapLoad — a carved-out subtree is counted once', () => {
  it('a grandchild linked to a different item contributes only to ITS item, not the ancestor\'s', () => {
    const parent = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 60 })] });
    const child = wbsItem({
      id: 2,
      parentId: 1,
      estimates: [estimate({ wbsItemId: 2, role: 'Backend Developer', hours: 20 })],
    });
    const items: RoadmapLoadItemInput[] = [
      roadmapItem({ id: 100, startPeriod: 1, periodCount: 1 }), // ancestor's item
      roadmapItem({ id: 101, startPeriod: 1, periodCount: 1 }), // carve-out item
    ];
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 1, roadmapItemId: 100 }, // parent links item 100 (child inherits it)
      { wbsItemId: 2, roadmapItemId: 101 }, // child carved out to item 101
    ];
    const l = load({ wbsItems: [parent, child], roadmapItems: items, links });
    // Item 100 gets only the parent's own 60h (child carved out) — item 101 gets the child's 20h.
    expect(l.itemEffortByRole.get(100)?.get('Backend Developer')).toBe(60);
    expect(l.itemEffortByRole.get(101)?.get('Backend Developer')).toBe(20);
    // Total demand in period 1 is 60 + 20 = 80, counted once each, not double-counted.
    expect(demandHours(l, 'role', 'Backend Developer', 1)).toBe(80);
  });
});

describe('buildRoadmapLoad — an unmapped role', () => {
  it('a demand role with no matching resource-plan row (directly or via discipline) has zero supply', () => {
    const leaf = wbsItem({
      id: 1,
      estimates: [estimate({ wbsItemId: 1, role: 'Quantum Whisperer', discipline: 'Exotic', hours: 40 })],
    });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 1 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({
      wbsItems: [leaf],
      roadmapItems: items,
      links,
      resourcePlans: [resourcePlan({ role: 'Backend Developer', allocations: [allocation({ periodNumber: 1, allocation: 100 })] })],
      rateCards: [rateCard({ role: 'Backend Developer', discipline: 'Engineering' })],
    });
    expect(demandHours(l, 'role', 'Quantum Whisperer', 1)).toBe(40);
    expect(supplyHours(l, 'role', 'Quantum Whisperer', 1)).toBe(0);
    expect(variance(l, 'role', 'Quantum Whisperer', 1)).toBe(40);
  });
});

describe('buildRoadmapLoad — unplaceable effort', () => {
  it('is excluded from per-period demand but present in unplaceableHours', () => {
    const leaf = wbsItem({
      id: 1,
      phaseName: null, // no effective phase, no roadmap link -> unplaceable
      estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 33 })],
    });
    const l = load({ wbsItems: [leaf] });
    for (let p = 1; p <= NP; p++) {
      expect(demandHours(l, 'role', 'Backend Developer', p)).toBe(0);
    }
    expect(l.unplaceableHours).toBe(33);
  });
});

describe('buildRoadmapLoad — WBS-3 total invariant', () => {
  it('sum of per-period demand plus unplaceable hours equals the WBS-3 project total', () => {
    const placedLeaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 90 })] });
    const baselineLeaf = wbsItem({
      id: 2,
      phaseName: 'Discovery',
      estimates: [estimate({ wbsItemId: 2, role: 'Frontend Developer', hours: 40 })],
    });
    const unplaceableLeaf = wbsItem({ id: 3, estimates: [estimate({ wbsItemId: 3, role: '', hours: 17 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 2, periodCount: 3 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const wbsItems = [placedLeaf, baselineLeaf, unplaceableLeaf];

    const l = load({ wbsItems, roadmapItems: items, links });
    const report = buildReconciliationReport(wbsItems, [], [], PHASES, HRS_PER_PERIOD);

    expect(totalDemandHours(l) + l.unplaceableHours).toBeCloseTo(report.projectTotal.wbsHours, 6);
  });
});

describe('buildRoadmapLoad — feasiblePeriods against zero supply', () => {
  it('returns Infinity when the role has no supply anywhere in the window', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 200 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links }); // no resourcePlans at all
    const effort = l.itemEffortByRole.get(100)!;
    const result = feasiblePeriods(l, 100, { startPeriod: 1, periodCount: 4 }, effort);
    expect(result).toBe(Infinity);
  });
});

describe('buildRoadmapLoad — feasiblePeriods uses RESIDUAL supply (decision 1)', () => {
  it('a competing item shortens the reported feasible-duration improvement vs. raw-supply math', () => {
    // Backend supply: 100h/period for periods 1-4.
    const supplyPlan = resourcePlan({
      role: 'Backend Developer',
      allocations: [1, 2, 3, 4].map((p) => allocation({ periodNumber: p, allocation: 250 })), // 250% = 100h/period
    });
    const rateCards = [rateCard({ role: 'Backend Developer', discipline: 'Engineering' })];

    // Item R: 700h of Backend effort over periods 1-4 (window avg demand 175h/period).
    const rLeaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 700 })] });
    const rItem = roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 });

    // Alone: raw supply is 100h/period, avg residual == raw supply (nothing else competing).
    const aloneLoad = load({
      wbsItems: [rLeaf],
      roadmapItems: [rItem],
      links: [{ wbsItemId: 1, roadmapItemId: 100 }],
      resourcePlans: [supplyPlan],
      rateCards,
    });
    const aloneFeasible = feasiblePeriods(
      aloneLoad,
      100,
      { startPeriod: 1, periodCount: 4 },
      aloneLoad.itemEffortByRole.get(100)!
    );
    expect(aloneFeasible).toBe(7); // ceil(700 / 100)

    // Contended: a second item Q claims 60h/period of the SAME Backend supply,
    // over the SAME periods -> R's residual supply drops to 40h/period.
    const qLeaf = wbsItem({ id: 2, estimates: [estimate({ wbsItemId: 2, role: 'Backend Developer', hours: 240 })] });
    const qItem = roadmapItem({ id: 101, startPeriod: 1, periodCount: 4 }); // 240/4 = 60h/period
    const contendedLoad = load({
      wbsItems: [rLeaf, qLeaf],
      roadmapItems: [rItem, qItem],
      links: [
        { wbsItemId: 1, roadmapItemId: 100 },
        { wbsItemId: 2, roadmapItemId: 101 },
      ],
      resourcePlans: [supplyPlan],
      rateCards,
    });
    const contendedFeasible = feasiblePeriods(
      contendedLoad,
      100,
      { startPeriod: 1, periodCount: 4 },
      contendedLoad.itemEffortByRole.get(100)!
    );
    expect(contendedFeasible).toBe(18); // ceil(700 / 40)
    expect(contendedFeasible).toBeGreaterThan(aloneFeasible);

    // The bug this fixes: raw-supply math (ignoring Q's demand entirely) would
    // still report 7 even in the contended case — a value achievable only in
    // the deleted "before" behavior we no longer compute.
    expect(contendedFeasible).not.toBe(7);
  });
});

describe('spreadDistribution (producer 3)', () => {
  it('spreads an item\'s effort evenly across the whole project, ignoring any stored window', () => {
    const effort = new Map([['Backend Developer', 800]]);
    const dist = spreadDistribution(effort, NP);
    expect(dist.size).toBe(NP);
    for (let p = 1; p <= NP; p++) {
      expect(dist.get(p)?.get('Backend Developer')).toBe(100); // 800 / 8
    }
  });

  it('a spread roadmap item demands evenly over [1, np] via buildRoadmapLoad, regardless of its (1,0) sentinel', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'PM', hours: 80 })] });
    const items: RoadmapLoadItemInput[] = [
      roadmapItem({ id: 100, kind: 'spread', startPeriod: 1, periodCount: 0 }),
    ];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links });
    for (let p = 1; p <= NP; p++) {
      expect(demandHours(l, 'role', 'PM', p)).toBe(10); // 80 / 8
    }
    expect(demandHours(l, 'role', 'PM', NP + 1)).toBe(0);
  });
});

describe('demandFte and discipline dimension', () => {
  it('demandFte divides demandHours by hoursPerPeriod', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 80 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 1 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links });
    expect(demandFte(l, 'role', 'Backend Developer', 1)).toBe(2); // 80h / 40h
  });

  it('discipline-dimension demand folds every role under that discipline together', () => {
    const leaf = wbsItem({
      id: 1,
      estimates: [
        estimate({ wbsItemId: 1, role: 'Senior Backend Developer', discipline: 'Engineering', hours: 40 }),
        estimate({ wbsItemId: 1, role: 'Junior Backend Developer', discipline: 'Engineering', hours: 40 }),
      ],
    });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 1 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links });
    expect(demandHours(l, 'discipline', 'Engineering', 1)).toBe(80);
  });
});

describe('contributorsForPeriod — load strip popover', () => {
  it('lists the item and the phase-baseline bucket, largest first, when both contribute to a period', () => {
    const placedLeaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 20 })] });
    const baselineLeaf = wbsItem({
      id: 2,
      phaseName: 'Discovery',
      estimates: [estimate({ wbsItemId: 2, role: 'Backend Developer', hours: 100 })],
    });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, name: 'API', startPeriod: 1, periodCount: 1 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [placedLeaf, baselineLeaf], roadmapItems: items, links });

    // Discovery = periods 1-2, so baselineLeaf's 100h/2 = 50h lands in period 1.
    const contributors = contributorsForPeriod(l, items, 'role', 'Backend Developer', 1);
    expect(contributors).toEqual([
      { source: 'phase-baseline', id: -1, name: 'Unplaced effort (phase baseline)', hours: 50 },
      { source: 'item', id: 100, name: 'API', hours: 20 },
    ]);
  });

  it('returns an empty list for a period with no demand', () => {
    const l = load({});
    expect(contributorsForPeriod(l, [], 'role', 'Backend Developer', 1)).toEqual([]);
  });

  it('discipline mode sums every role under that discipline from the same item', () => {
    const leaf = wbsItem({
      id: 1,
      estimates: [
        estimate({ wbsItemId: 1, role: 'Senior Backend Developer', discipline: 'Engineering', hours: 30 }),
        estimate({ wbsItemId: 1, role: 'Junior Backend Developer', discipline: 'Engineering', hours: 10 }),
      ],
    });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, name: 'API', startPeriod: 1, periodCount: 1 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links });
    const contributors = contributorsForPeriod(l, items, 'discipline', 'Engineering', 1);
    expect(contributors).toEqual([{ source: 'item', id: 100, name: 'API', hours: 40 }]);
  });
});

describe('buildByPeriodMatrix — CAP-10', () => {
  it('renders from the phase baseline alone when there are no roadmap items at all', () => {
    const leaf = wbsItem({
      id: 1,
      phaseName: 'Discovery',
      estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 100 })],
    });
    const l = load({ wbsItems: [leaf] }); // no roadmapItems, no links -> empty roadmap
    const matrix = buildByPeriodMatrix(l, 'role');
    expect(matrix.periods).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const row = matrix.rows.find((r) => r.key === 'Backend Developer')!;
    expect(row.cells[0].demand).toBe(50); // Discovery periods 1-2, 100h/2
    expect(row.cells[1].demand).toBe(50);
    expect(row.cells[2].demand).toBe(0);
    expect(row.total.demand).toBe(100);
  });

  it('the total row/column sum every displayed row cell-for-cell', () => {
    const leafA = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 80 })] });
    const leafB = wbsItem({ id: 2, estimates: [estimate({ wbsItemId: 2, role: 'Frontend Developer', hours: 40 })] });
    const items: RoadmapLoadItemInput[] = [
      roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 }),
      roadmapItem({ id: 101, startPeriod: 1, periodCount: 4 }),
    ];
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 1, roadmapItemId: 100 },
      { wbsItemId: 2, roadmapItemId: 101 },
    ];
    const l = load({ wbsItems: [leafA, leafB], roadmapItems: items, links });
    const matrix = buildByPeriodMatrix(l, 'role');

    const period1Sum = matrix.rows.reduce((sum, row) => sum + row.cells[0].demand, 0);
    expect(matrix.totalRow.cells[0].demand).toBe(period1Sum);
    expect(matrix.totalRow.cells[0].demand).toBe(30); // 20 (Backend) + 10 (Frontend)

    const grandTotal = matrix.rows.reduce((sum, row) => sum + row.total.demand, 0);
    expect(matrix.totalRow.total.demand).toBe(grandTotal);
    expect(matrix.totalRow.total.demand).toBe(120); // 80 + 40
  });

  it('numbers match direct demandHours/supplyHours calls for the same key and period', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 80 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({
      wbsItems: [leaf],
      roadmapItems: items,
      links,
      resourcePlans: [resourcePlan({ role: 'Backend Developer', allocations: [allocation({ periodNumber: 2, allocation: 100 })] })],
      rateCards: [rateCard({ role: 'Backend Developer', discipline: 'Engineering' })],
    });
    const matrix = buildByPeriodMatrix(l, 'role');
    const row = matrix.rows.find((r) => r.key === 'Backend Developer')!;
    expect(row.cells[1].demand).toBe(demandHours(l, 'role', 'Backend Developer', 2));
    expect(row.cells[1].supply).toBe(supplyHours(l, 'role', 'Backend Developer', 2));
    expect(row.cells[1].variance).toBe(variance(l, 'role', 'Backend Developer', 2));
  });
});

describe('feasiblePeriodsDetail — names the limiting role (CAP-11)', () => {
  it('names the one role that drove the max periods-needed figure', () => {
    const backendLeaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 700 })] });
    const frontendLeaf = wbsItem({ id: 2, estimates: [estimate({ wbsItemId: 2, role: 'Frontend Developer', hours: 40 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })];
    const links: RoadmapLinkRecord[] = [
      { wbsItemId: 1, roadmapItemId: 100 },
      { wbsItemId: 2, roadmapItemId: 100 },
    ];
    const l = load({
      wbsItems: [backendLeaf, frontendLeaf],
      roadmapItems: items,
      links,
      resourcePlans: [
        resourcePlan({ role: 'Backend Developer', allocations: [1, 2, 3, 4].map((p) => allocation({ periodNumber: p, allocation: 250 })) }),
        resourcePlan({ role: 'Frontend Developer', allocations: [1, 2, 3, 4].map((p) => allocation({ periodNumber: p, allocation: 250 })) }),
      ],
      rateCards: [rateCard({ role: 'Backend Developer', discipline: 'Engineering' }), rateCard({ role: 'Frontend Developer', discipline: 'Engineering' })],
    });
    const effort = l.itemEffortByRole.get(100)!;
    const result = feasiblePeriodsDetail(l, 100, { startPeriod: 1, periodCount: 4 }, effort);
    expect(result.periods).toBe(7); // ceil(700/100), Backend is the limit
    expect(result.limitingRole).toBe('Backend Developer');
  });
});

describe('avgSupplyFteOverWindow', () => {
  it('averages supply hours over the window and converts to FTE', () => {
    // supplyByRole is only populated for roles with SOME demand (see the module doc
    // comment) — realistic for every real caller, which always derives the role from
    // an item's own effort map, so give this leaf a trivial demand too.
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 1 })] });
    const l = load({
      wbsItems: [leaf],
      roadmapItems: [roadmapItem({ id: 100, startPeriod: 1, periodCount: 2 })],
      links: [{ wbsItemId: 1, roadmapItemId: 100 }],
      resourcePlans: [
        resourcePlan({ role: 'Backend Developer', allocations: [allocation({ periodNumber: 1, allocation: 100 }), allocation({ periodNumber: 2, allocation: 50 })] }),
      ],
    });
    // period 1: 40h, period 2: 20h -> avg 30h / 40h = 0.75 FTE
    expect(avgSupplyFteOverWindow(l, 'Backend Developer', { startPeriod: 1, periodCount: 2 }, 40)).toBe(0.75);
  });
});

describe('worstConflictInWindow — CAP-11 conflict statement', () => {
  it('reports the largest demand-over-supply period/role, and null when nothing conflicts', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 400 })] });
    const items: RoadmapLoadItemInput[] = [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })];
    const links: RoadmapLinkRecord[] = [{ wbsItemId: 1, roadmapItemId: 100 }];
    const l = load({ wbsItems: [leaf], roadmapItems: items, links }); // no supply at all
    const effort = l.itemEffortByRole.get(100)!;
    const conflict = worstConflictInWindow(l, effort, { startPeriod: 1, periodCount: 4 });
    expect(conflict).toEqual({ period: 1, role: 'Backend Developer', demandFte: 2.5, supplyFte: 0 }); // 100h/40h

    const noConflict = worstConflictInWindow(l, new Map(), { startPeriod: 1, periodCount: 4 });
    expect(noConflict).toBeNull();
  });
});
