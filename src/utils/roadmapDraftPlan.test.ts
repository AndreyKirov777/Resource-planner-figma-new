import { describe, it, expect } from 'vitest';
import { WbsItem, WbsEstimate, Phase, RateCard } from '../services/api';
import { RoadmapLinkRecord } from './roadmap';
import { buildRoadmapLoad, RoadmapLoadItemInput } from './roadmapLoad';
import { buildDraftFromRoadmapLoad } from './roadmapDraftPlan';

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
function roadmapItem(overrides: Partial<RoadmapLoadItemInput> & { id: number }): RoadmapLoadItemInput {
  return { name: 'Item', kind: 'bar', startPeriod: 1, periodCount: 1, ...overrides };
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

const PHASES: Phase[] = [{ name: 'Phase 1', periodCount: 4, color: '#fff' }];

describe('buildDraftFromRoadmapLoad — CAP-13', () => {
  it('produces one resourcePlan row per role with allocations from demandFte, at 0% margin/exchange this is a pass-through', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 80 })] });
    const load = buildRoadmapLoad({
      wbsItems: [leaf],
      roadmapItems: [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })],
      links: [{ wbsItemId: 1, roadmapItemId: 100 }],
      resourcePlans: [],
      rateCards: [rateCard({ role: 'Backend Developer', ukraine: 50 })],
      phases: PHASES,
      planningMode: 'weekly',
      daysInFTE: 20,
    });
    const draft = buildDraftFromRoadmapLoad(load, [rateCard({ role: 'Backend Developer', ukraine: 50 })], 'ukraine', 0, 1);

    expect(draft.resourcePlans).toHaveLength(1);
    const row = draft.resourcePlans[0];
    expect(row.role).toBe('Backend Developer');
    expect(row.intHourlyRate).toBe(50);
    // 80h / 4 periods = 20h/period = 0.5 FTE = 50%.
    expect(row.allocations).toEqual([1, 2, 3, 4].map((p) => ({ periodNumber: p, allocation: 50 })));
    expect(draft.resourceLists).toEqual([]);
    expect(draft.region).toBe('ukraine');
  });

  it('splits a role whose peak demand exceeds 1.0 FTE into multiple 100%-capped rows', () => {
    // 260h over 4 periods = 65h/period = 1.625 FTE (at 40h/period).
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 260 })] });
    const load = buildRoadmapLoad({
      wbsItems: [leaf],
      roadmapItems: [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })],
      links: [{ wbsItemId: 1, roadmapItemId: 100 }],
      resourcePlans: [],
      rateCards: [],
      phases: PHASES,
      planningMode: 'weekly',
      daysInFTE: 20,
    });
    const draft = buildDraftFromRoadmapLoad(load, [], 'ukraine', 0, 1);

    expect(draft.resourcePlans).toHaveLength(2); // ceil(1.625) = 2 rows
    const [row1, row2] = draft.resourcePlans;
    expect(row1.allocations.every((a) => a.allocation === 100)).toBe(true); // fully saturated first
    expect(row2.allocations.every((a) => a.allocation === 63)).toBe(true); // 0.625 * 100, rounded
    // No allocation ever exceeds the server's 100% cap.
    draft.resourcePlans.forEach((row) => row.allocations.forEach((a) => expect(a.allocation).toBeLessThanOrEqual(100)));
  });

  it('omits a role with no demand anywhere, and applies margin/exchange rate to the client rate', () => {
    const leaf = wbsItem({ id: 1, estimates: [estimate({ wbsItemId: 1, role: 'Backend Developer', hours: 40 })] });
    const load = buildRoadmapLoad({
      wbsItems: [leaf],
      roadmapItems: [roadmapItem({ id: 100, startPeriod: 1, periodCount: 4 })],
      links: [{ wbsItemId: 1, roadmapItemId: 100 }],
      resourcePlans: [],
      rateCards: [],
      phases: PHASES,
      planningMode: 'weekly',
      daysInFTE: 20,
    });
    const draft = buildDraftFromRoadmapLoad(load, [rateCard({ role: 'Backend Developer', ukraine: 50 })], 'ukraine', 25, 0.89);

    expect(draft.resourcePlans).toHaveLength(1);
    // clientHourlyRate(50, 0.25, 0.89) = (50 / 0.75) * 0.89
    expect(draft.resourcePlans[0].clientHourlyRate).toBeCloseTo((50 / 0.75) * 0.89, 6);
  });

  it('an empty roadmap load produces an empty draft', () => {
    const load = buildRoadmapLoad({
      wbsItems: [],
      roadmapItems: [],
      links: [],
      resourcePlans: [],
      rateCards: [],
      phases: PHASES,
      planningMode: 'weekly',
      daysInFTE: 20,
    });
    const draft = buildDraftFromRoadmapLoad(load, [], 'ukraine', 0, 1);
    expect(draft.resourcePlans).toEqual([]);
  });
});
