import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconciliationPanel } from './ReconciliationPanel';
import type { ReconciliationReport } from '../utils/wbs';
import { WbsItem, WbsEstimate, Phase } from '../services/api';
import { buildRoadmapLoad, buildByPeriodMatrix, demandHours, supplyHours } from '../utils/roadmapLoad';

function report(overrides: Partial<ReconciliationReport>): ReconciliationReport {
  return {
    projectTotal: { wbsHours: 0, planHours: 0, varianceHours: 0 },
    byDiscipline: [],
    byPhaseDiscipline: [],
    phaseLevelAvailable: false,
    unassignedWbs: { totalHours: 0, byDiscipline: [] },
    unmappedPlan: { totalHours: 0, rows: [] },
    ...overrides,
  };
}

describe('ReconciliationPanel', () => {
  it('renders project-total WBS, plan, and variance hours', () => {
    const r = report({ projectTotal: { wbsHours: 120, planHours: 100, varianceHours: 20 } });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
  });

  it('renders a per-discipline row with WBS/plan/variance columns', () => {
    const r = report({
      byDiscipline: [{ discipline: 'Engineering', wbsHours: 40, planHours: 30, varianceHours: 10 }],
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByRole('cell', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'WBS hours' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Plan hours' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Variance' })).toBeInTheDocument();
  });

  it('shows the phase-level-unavailable state when phaseLevelAvailable is false, instead of an empty table', () => {
    const r = report({ phaseLevelAvailable: false, byPhaseDiscipline: [] });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText(/not enough phase-assigned data/i)).toBeInTheDocument();
    // No phase/discipline table should be rendered in this state.
    expect(screen.queryByRole('columnheader', { name: 'Phase' })).not.toBeInTheDocument();
  });

  it('renders the by-phase-x-discipline table when phaseLevelAvailable is true', () => {
    const r = report({
      phaseLevelAvailable: true,
      byPhaseDiscipline: [
        { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 15, planHours: 0, varianceHours: 15 },
      ],
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.queryByText(/not enough phase-assigned data/i)).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Phase' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Phase 1' })).toBeInTheDocument();
  });

  it('always renders both gap-bucket callouts, non-empty when populated', () => {
    const r = report({
      unassignedWbs: { totalHours: 10, byDiscipline: [{ discipline: 'Engineering', hours: 10 }] },
      unmappedPlan: { totalHours: 40, rows: [{ resourcePlanId: 5, role: 'Mystery Role', hours: 40 }] },
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText('Unassigned (WBS)')).toBeInTheDocument();
    expect(screen.getByText('Unmapped (plan)')).toBeInTheDocument();
    // Populated content, not the "no gap" fallback text.
    expect(screen.queryByText(/no unassigned wbs hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no unmapped plan rows/i)).not.toBeInTheDocument();
    expect(screen.getByText('Mystery Role')).toBeInTheDocument();
  });

  it('still renders both gap-bucket callouts (as zero-state) when their totals are zero', () => {
    const r = report({});
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText('Unassigned (WBS)')).toBeInTheDocument();
    expect(screen.getByText('Unmapped (plan)')).toBeInTheDocument();
    expect(screen.getByText(/no unassigned wbs hours/i)).toBeInTheDocument();
    expect(screen.getByText(/no unmapped plan rows/i)).toBeInTheDocument();
  });

  it('treats a floating-point-noise variance as zero instead of a colored +/- figure', () => {
    const r = report({ projectTotal: { wbsHours: 40, planHours: 40 - 4.5e-13, varianceHours: 4.5e-13 } });
    render(<ReconciliationPanel report={r} />);

    // Displayed as plain "0", not "+0" (which would misleadingly imply a real positive variance).
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText(/^[+-]/)).not.toBeInTheDocument();
  });

  describe('coverage prop (CAP-7 roadmap cards)', () => {
    it('renders exactly as before when the coverage prop is absent (no roadmap cards)', () => {
      const r = report({});
      render(<ReconciliationPanel report={r} />);

      expect(screen.queryByText('Unplaced (WBS)')).not.toBeInTheDocument();
      expect(screen.queryByText('Empty (roadmap)')).not.toBeInTheDocument();
      expect(screen.queryByText('Phase mismatch')).not.toBeInTheDocument();
    });

    it('renders the three coverage cards when coverage is provided', () => {
      const r = report({});
      render(
        <ReconciliationPanel
          report={r}
          coverage={{
            unplaced: [{ wbsItemId: 1, name: 'Contingency', hours: 40 }],
            unplacedHours: 40,
            unplacedShare: 0.25,
            empty: [{ roadmapItemId: 10, name: 'Frontend' }],
            phaseMismatch: [
              { roadmapItemId: 10, itemName: 'Backend', wbsItemId: 2, leafName: 'Auth', phaseName: 'Launch' },
            ],
          }}
        />
      );

      expect(screen.getByText('Unplaced (WBS)')).toBeInTheDocument();
      expect(screen.getByText('Contingency')).toBeInTheDocument();
      expect(screen.getByText('25%', { exact: false })).toBeInTheDocument();

      expect(screen.getByText('Empty (roadmap)')).toBeInTheDocument();
      expect(screen.getByText('Frontend', { exact: false })).toBeInTheDocument();

      expect(screen.getByText('Phase mismatch')).toBeInTheDocument();
      expect(screen.getByText(/Auth/)).toBeInTheDocument();
      expect(screen.getByText(/Launch/)).toBeInTheDocument();
    });

    it('shows the zero-state text in each card when its list is empty', () => {
      const r = report({});
      render(
        <ReconciliationPanel
          report={r}
          coverage={{ unplaced: [], unplacedHours: 0, unplacedShare: 0, empty: [], phaseMismatch: [] }}
        />
      );

      expect(screen.getByText(/no unplaced wbs hours/i)).toBeInTheDocument();
      expect(screen.getByText(/no bars without scope/i)).toBeInTheDocument();
      expect(screen.getByText(/every linked leaf's phase overlaps/i)).toBeInTheDocument();
    });
  });

  describe('by-period matrix (CAP-10)', () => {
    const PHASES: Phase[] = [{ name: 'Discovery', periodCount: 2, color: '#fff' }, { name: 'Build', periodCount: 6, color: '#000' }];

    function leaf(overrides: Partial<WbsItem> & { id: number }, estimates: Partial<WbsEstimate>[]): WbsItem {
      return {
        name: 'Leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: estimates.map((e, i) => ({
          id: i + 1,
          discipline: 'Engineering',
          role: '',
          hours: 0,
          wbsItemId: overrides.id,
          createdAt: '',
          updatedAt: '',
          ...e,
        })),
        ...overrides,
      };
    }

    it('is absent when byPeriodRoleMatrix is not provided', () => {
      const r = report({});
      render(<ReconciliationPanel report={r} />);
      expect(screen.queryByText('By period')).not.toBeInTheDocument();
    });

    it('renders from the phase baseline with a caption when the roadmap is empty', () => {
      const wbsItems = [leaf({ id: 1, phaseName: 'Discovery' }, [{ role: 'Backend Developer', hours: 100 }])];
      const load = buildRoadmapLoad({
        wbsItems,
        roadmapItems: [],
        links: [],
        resourcePlans: [],
        rateCards: [],
        phases: PHASES,
        planningMode: 'weekly',
        daysInFTE: 20,
      });
      const matrix = buildByPeriodMatrix(load, 'role');
      const r = report({});
      render(
        <ReconciliationPanel
          report={r}
          byPeriodRoleMatrix={matrix}
          byPeriodDisciplineMatrix={buildByPeriodMatrix(load, 'discipline')}
          byPeriodPhaseBaselineOnly
        />
      );

      expect(screen.getByText('By period')).toBeInTheDocument();
      expect(screen.getByText(/no roadmap yet/i)).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Backend Developer' })).toBeInTheDocument();
      // Discovery = periods 1-2, 100h/2 = 50h/period, demand/supply "50/0".
      expect(screen.getByRole('columnheader', { name: 'W1' })).toBeInTheDocument();
      expect(screen.getAllByText('50/0').length).toBeGreaterThan(0);
    });

    it("numbers match a direct roadmapLoad.ts call for the same role and period", () => {
      const wbsItems = [leaf({ id: 1 }, [{ role: 'Backend Developer', hours: 160 }])];
      const load = buildRoadmapLoad({
        wbsItems,
        roadmapItems: [{ id: 100, name: 'API', kind: 'bar', startPeriod: 1, periodCount: 4 }],
        links: [{ wbsItemId: 1, roadmapItemId: 100 }],
        resourcePlans: [
          {
            id: 1,
            role: 'Backend Developer',
            intHourlyRate: 0,
            clientHourlyRate: 0,
            displayOrder: 0,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            allocations: [{ id: 1, periodNumber: 2, allocation: 50, resourcePlanId: 1, createdAt: '', updatedAt: '' }],
          },
        ],
        rateCards: [],
        phases: PHASES,
        planningMode: 'weekly',
        daysInFTE: 20,
      });
      const matrix = buildByPeriodMatrix(load, 'role');
      const expectedDemand = demandHours(load, 'role', 'Backend Developer', 2);
      const expectedSupply = supplyHours(load, 'role', 'Backend Developer', 2);
      expect(expectedDemand).toBe(40); // 160h / 4 periods
      expect(expectedSupply).toBe(20); // 50% * 40h

      const r = report({});
      render(
        <ReconciliationPanel
          report={r}
          byPeriodRoleMatrix={matrix}
          byPeriodDisciplineMatrix={buildByPeriodMatrix(load, 'discipline')}
        />
      );
      expect(screen.getAllByText(`${expectedDemand}/${expectedSupply}`).length).toBeGreaterThan(0);
    });
  });
});
