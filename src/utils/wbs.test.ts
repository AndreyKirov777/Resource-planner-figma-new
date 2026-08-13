import { describe, it, expect } from 'vitest';
import { resolveDiscipline, buildReconciliationReport } from './wbs';
import { WbsItem, WbsEstimate, ResourcePlan, Allocation, RateCard, Phase } from '../services/api';

function estimate(overrides: Partial<WbsEstimate>): WbsEstimate {
  return {
    id: 1,
    discipline: 'Engineering',
    role: '',
    hours: 0,
    wbsItemId: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function wbsItem(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: 1,
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
  return {
    id: 1,
    periodNumber: 1,
    allocation: 100,
    resourcePlanId: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function resourcePlan(overrides: Partial<ResourcePlan>): ResourcePlan {
  return {
    id: 1,
    role: 'Engineer',
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
    id: 1,
    role: 'Engineer',
    namingInPM: 'Engineer',
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

function phase(overrides: Partial<Phase>): Phase {
  return { name: 'Phase 1', periodCount: 4, ...overrides };
}

const HRS_PER_PERIOD = 40; // weekly

describe('resolveDiscipline', () => {
  it('returns the discipline for a matching role', () => {
    const rateCards = [rateCard({ role: 'Engineer', discipline: 'Engineering' })];
    expect(resolveDiscipline('Engineer', rateCards)).toBe('Engineering');
  });

  it('returns undefined when no rate card matches the role', () => {
    expect(resolveDiscipline('Ghost Role', [rateCard({ role: 'Engineer' })])).toBeUndefined();
  });

  it('returns the first match when duplicate role strings exist', () => {
    const rateCards = [
      rateCard({ id: 1, role: 'Engineer', discipline: 'Engineering' }),
      rateCard({ id: 2, role: 'Engineer', discipline: 'QA' }),
    ];
    expect(resolveDiscipline('Engineer', rateCards)).toBe('Engineering');
  });
});

describe('buildReconciliationReport', () => {
  // I/O matrix: Empty project
  it('empty project: all totals 0, empty arrays, phaseLevelAvailable false', () => {
    const report = buildReconciliationReport([], [], [], [phase({})], HRS_PER_PERIOD);

    expect(report.projectTotal).toEqual({ wbsHours: 0, planHours: 0, varianceHours: 0 });
    expect(report.byDiscipline).toEqual([]);
    expect(report.byPhaseDiscipline).toEqual([]);
    expect(report.phaseLevelAvailable).toBe(false);
    expect(report.unassignedWbs).toEqual({ totalHours: 0, byDiscipline: [] });
    expect(report.unmappedPlan).toEqual({ totalHours: 0, rows: [] });
  });

  // I/O matrix: Unmapped plan role
  it('unmapped plan role: excluded from byDiscipline plan side, lands in unmappedPlan, still counted in projectTotal.planHours', () => {
    const plans = [
      resourcePlan({
        id: 5,
        role: 'Mystery Role',
        allocations: [allocation({ periodNumber: 1, allocation: 100, resourcePlanId: 5 })],
      }),
    ];
    const rateCards = [rateCard({ role: 'Engineer', discipline: 'Engineering' })]; // does not match 'Mystery Role'
    const report = buildReconciliationReport([], plans, rateCards, [phase({ periodCount: 4 })], HRS_PER_PERIOD);

    expect(report.byDiscipline).toEqual([]);
    expect(report.unmappedPlan.totalHours).toBe(40);
    expect(report.unmappedPlan.rows).toEqual([{ resourcePlanId: 5, role: 'Mystery Role', hours: 40 }]);
    expect(report.projectTotal.planHours).toBe(40);
  });

  // I/O matrix: WBS item, no phase
  it('WBS item with no phase: excluded from byPhaseDiscipline, lands in unassignedWbs, still counted in projectTotal.wbsHours and byDiscipline', () => {
    const items = [
      wbsItem({
        id: 1,
        phaseName: null,
        estimates: [estimate({ discipline: 'Engineering', hours: 10, wbsItemId: 1 })],
      }),
    ];
    const report = buildReconciliationReport(items, [], [], [phase({ name: 'Phase 1', periodCount: 4 })], HRS_PER_PERIOD);

    expect(report.byPhaseDiscipline).toEqual([]);
    expect(report.phaseLevelAvailable).toBe(false);
    expect(report.unassignedWbs.totalHours).toBe(10);
    expect(report.unassignedWbs.byDiscipline).toEqual([{ discipline: 'Engineering', hours: 10 }]);
    expect(report.projectTotal.wbsHours).toBe(10);
    expect(report.byDiscipline).toEqual([
      { discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 },
    ]);
  });

  // I/O matrix: WBS item, stale phase
  it('WBS item with a stale phase name (absent from project.phases) folds into unassignedWbs just like no phase', () => {
    const items = [
      wbsItem({
        id: 1,
        phaseName: 'Ghost Phase',
        estimates: [estimate({ discipline: 'Design', hours: 6, wbsItemId: 1 })],
      }),
    ];
    const report = buildReconciliationReport(items, [], [], [phase({ name: 'Phase 1', periodCount: 4 })], HRS_PER_PERIOD);

    expect(report.byPhaseDiscipline).toEqual([]);
    expect(report.phaseLevelAvailable).toBe(false);
    expect(report.unassignedWbs.totalHours).toBe(6);
    expect(report.projectTotal.wbsHours).toBe(6);
  });

  // I/O matrix: One-sided phase gap (WBS side)
  it('one-sided phase gap: WBS hours with zero plan hours in that phase still appears in byPhaseDiscipline with full variance', () => {
    const items = [
      wbsItem({
        id: 1,
        phaseName: 'Phase 1',
        estimates: [estimate({ discipline: 'Engineering', hours: 15, wbsItemId: 1 })],
      }),
    ];
    const report = buildReconciliationReport(items, [], [], [phase({ name: 'Phase 1', periodCount: 4 })], HRS_PER_PERIOD);

    expect(report.phaseLevelAvailable).toBe(true);
    expect(report.byPhaseDiscipline).toEqual([
      { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 15, planHours: 0, varianceHours: 15 },
    ]);
  });

  // I/O matrix: One-sided phase gap (plan side / vice versa)
  it('one-sided phase gap: plan hours with zero WBS hours in that phase still appears in byPhaseDiscipline with full (negative) variance', () => {
    const plans = [
      resourcePlan({
        id: 1,
        role: 'Engineer',
        allocations: [allocation({ periodNumber: 1, allocation: 100, resourcePlanId: 1 })],
      }),
    ];
    const rateCards = [rateCard({ role: 'Engineer', discipline: 'Engineering' })];
    // A WBS item exists and is phase-assigned (so phaseLevelAvailable is true) but has no estimates.
    const items = [wbsItem({ id: 1, phaseName: 'Phase 1', estimates: [] })];
    const report = buildReconciliationReport(
      items,
      plans,
      rateCards,
      [phase({ name: 'Phase 1', periodCount: 4 })],
      HRS_PER_PERIOD
    );

    expect(report.phaseLevelAvailable).toBe(true);
    expect(report.byPhaseDiscipline).toEqual([
      { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 0, planHours: 40, varianceHours: -40 },
    ]);
  });

  // I/O matrix: Multi-role, one discipline
  it('multi-role, one discipline: two WBS estimates on the same discipline with different roles sum into one discipline total, not two rows', () => {
    const items = [
      wbsItem({
        id: 1,
        phaseName: null,
        estimates: [
          estimate({ discipline: 'Engineering', role: 'frontend', hours: 4, wbsItemId: 1 }),
          estimate({ discipline: 'Engineering', role: 'backend', hours: 6, wbsItemId: 1 }),
        ],
      }),
    ];
    const report = buildReconciliationReport(items, [], [], [phase({})], HRS_PER_PERIOD);

    expect(report.byDiscipline).toEqual([
      { discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 },
    ]);
    expect(report.unassignedWbs.byDiscipline).toEqual([{ discipline: 'Engineering', hours: 10 }]);
  });

  // Bonus: plan-side multi-role, one discipline — two different roles mapping to the same
  // discipline sum into one byDiscipline row, not two.
  it('multi-role, one discipline: two plan rows with different roles resolving to the same discipline sum into one discipline total', () => {
    const plans = [
      resourcePlan({
        id: 1,
        role: 'Frontend Engineer',
        allocations: [allocation({ periodNumber: 1, allocation: 100, resourcePlanId: 1 })],
      }),
      resourcePlan({
        id: 2,
        role: 'Backend Engineer',
        allocations: [allocation({ periodNumber: 1, allocation: 50, resourcePlanId: 2 })],
      }),
    ];
    const rateCards = [
      rateCard({ id: 1, role: 'Frontend Engineer', discipline: 'Engineering' }),
      rateCard({ id: 2, role: 'Backend Engineer', discipline: 'Engineering' }),
    ];
    const report = buildReconciliationReport([], plans, rateCards, [phase({})], HRS_PER_PERIOD);

    expect(report.byDiscipline).toEqual([
      { discipline: 'Engineering', wbsHours: 0, planHours: 60, varianceHours: -60 },
    ]);
  });

  it('sums project totals across multiple periods and rounds up phase attribution via getPhaseForPeriod', () => {
    const plans = [
      resourcePlan({
        id: 1,
        role: 'Engineer',
        allocations: [
          allocation({ id: 1, periodNumber: 1, allocation: 100, resourcePlanId: 1 }),
          allocation({ id: 2, periodNumber: 5, allocation: 100, resourcePlanId: 1 }), // falls into Phase 2
        ],
      }),
    ];
    const rateCards = [rateCard({ role: 'Engineer', discipline: 'Engineering' })];
    const phases = [phase({ name: 'Phase 1', periodCount: 4 }), phase({ name: 'Phase 2', periodCount: 4 })];
    const report = buildReconciliationReport([], plans, rateCards, phases, HRS_PER_PERIOD);

    expect(report.projectTotal.planHours).toBe(80);
    expect(report.byPhaseDiscipline).toEqual([
      { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 0, planHours: 40, varianceHours: -40 },
      { phaseName: 'Phase 2', discipline: 'Engineering', wbsHours: 0, planHours: 40, varianceHours: -40 },
    ]);
  });

  // AC1: "a project with WBS estimates and resource-plan allocations sharing a phase and
  // discipline" — both sides non-zero for the same (phase, discipline) pair.
  it('AC1: reports a two-sided variance when both WBS and plan have hours for the same phase and discipline', () => {
    const items = [
      wbsItem({
        id: 1,
        phaseName: 'Phase 1',
        estimates: [estimate({ discipline: 'Engineering', hours: 25, wbsItemId: 1 })],
      }),
    ];
    const plans = [
      resourcePlan({
        id: 1,
        role: 'Engineer',
        allocations: [allocation({ periodNumber: 1, allocation: 100, resourcePlanId: 1 })],
      }),
    ];
    const rateCards = [rateCard({ role: 'Engineer', discipline: 'Engineering' })];
    const phases = [phase({ name: 'Phase 1', periodCount: 4 })];
    const report = buildReconciliationReport(items, plans, rateCards, phases, HRS_PER_PERIOD);

    expect(report.byDiscipline).toEqual([
      { discipline: 'Engineering', wbsHours: 25, planHours: 40, varianceHours: -15 },
    ]);
    expect(report.byPhaseDiscipline).toEqual([
      { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 25, planHours: 40, varianceHours: -15 },
    ]);
  });
});
