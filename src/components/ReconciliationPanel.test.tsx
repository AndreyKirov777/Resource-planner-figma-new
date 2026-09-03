import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconciliationPanel, pivotPhaseDiscipline, varianceTint, bulletBarWidths } from './ReconciliationPanel';
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

  it('renders a per-discipline row with a merged WBS/plan bar and a colored variance figure', () => {
    const r = report({
      byDiscipline: [{ discipline: 'Engineering', wbsHours: 40, planHours: 30, varianceHours: 10 }],
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByRole('cell', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'WBS / Plan' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Variance' })).toBeInTheDocument();
    expect(screen.getByText('40 / 30')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
    // Bullet-bar geometry: an under-planned row's indigo fill is scaled by
    // plan (30) against the WBS track (40), not a raw percentage of 100.
    expect(screen.getByTitle('WBS 40 h · Plan 30 h')).toBeInTheDocument();
  });

  it('paints a red overhang beyond the WBS track when a discipline is over-planned', () => {
    const r = report({
      byDiscipline: [{ discipline: 'Engineering', wbsHours: 20, planHours: 30, varianceHours: -10 }],
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText('-10')).toBeInTheDocument();
  });

  it('shows the phase-level-unavailable state when phaseLevelAvailable is false, instead of an empty table', () => {
    const r = report({ phaseLevelAvailable: false, byPhaseDiscipline: [] });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText(/not enough phase-assigned data/i)).toBeInTheDocument();
    // No phase/discipline table should be rendered in this state.
    expect(screen.queryByRole('columnheader', { name: 'Phase' })).not.toBeInTheDocument();
  });

  it('renders the by-phase-x-discipline heatmap when phaseLevelAvailable is true', () => {
    const r = report({
      phaseLevelAvailable: true,
      // A discipline needs a byDiscipline entry to appear in the pivot at all
      // (pivotPhaseDiscipline rows come from byDiscipline); give it different
      // hours than the phase row so the two tables' text can't collide.
      byDiscipline: [{ discipline: 'Engineering', wbsHours: 15, planHours: 5, varianceHours: 10 }],
      byPhaseDiscipline: [
        { phaseName: 'Phase 1', discipline: 'Engineering', wbsHours: 15, planHours: 0, varianceHours: 15 },
      ],
    });
    render(<ReconciliationPanel report={r} />);

    expect(screen.queryByText(/not enough phase-assigned data/i)).not.toBeInTheDocument();
    // Column headers are the phases themselves; the row header is the discipline
    // (also present as the By-discipline table's own row header).
    expect(screen.getByRole('columnheader', { name: 'Phase 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Engineering' }).length).toBeGreaterThan(0);
    // Delta-only cell (+15) plus the sr-only WBS/plan pair for assistive tech.
    expect(screen.getByText('+15')).toBeInTheDocument();
    expect(screen.getByText('15/0')).toBeInTheDocument();
  });

  it('renders both gap-bucket callouts when populated', () => {
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

  it('renders each chip with its own bucket total, not a neighboring bucket (guards cross-wiring)', () => {
    const r = report({
      unassignedWbs: { totalHours: 11, byDiscipline: [{ discipline: 'Engineering', hours: 11 }] },
      unmappedPlan: { totalHours: 22, rows: [{ resourcePlanId: 1, role: 'Mystery Role', hours: 22 }] },
    });
    render(
      <ReconciliationPanel
        report={r}
        coverage={{
          unplaced: [{ wbsItemId: 1, name: 'Contingency', hours: 33 }],
          unplacedHours: 33,
          unplacedShare: 0.5,
          empty: [
            { roadmapItemId: 1, name: 'A' },
            { roadmapItemId: 2, name: 'B' },
          ],
          phaseMismatch: [
            { roadmapItemId: 1, itemName: 'C', wbsItemId: 1, leafName: 'D', phaseName: 'E' },
            { roadmapItemId: 2, itemName: 'F', wbsItemId: 2, leafName: 'G', phaseName: 'H' },
            { roadmapItemId: 3, itemName: 'I', wbsItemId: 3, leafName: 'J', phaseName: 'K' },
          ],
        }}
      />
    );

    // Distinct numbers per bucket (11/22/33/2/3) so a cross-wiring — e.g. Unmapped
    // reading Unassigned's total, Empty reading phaseMismatch's count, a hardcoded
    // detail string — shows up as a specific chip's title/text being wrong, not as
    // a coincidental match. `.textContent` (not just `title`) also catches the
    // detail span being deleted entirely, since `title` doesn't depend on it.
    expect(screen.getByTitle('Unassigned: 11 h').textContent).toContain('11 h');
    expect(screen.getByTitle('Unmapped: 22 h').textContent).toContain('22 h');
    expect(screen.getByTitle('Unplaced: 33 h').textContent).toContain('33 h');
    expect(screen.getByTitle('Empty: 2').textContent).toContain('2');
    expect(screen.getByTitle('Mismatch: 3').textContent).toContain('3');
  });

  it('shows the Unassigned/Unmapped chips in the muted clear style, and omits Open issues, when both totals are zero', () => {
    const r = report({});
    render(<ReconciliationPanel report={r} />);

    // A fully healthy report has nothing to report on beyond the chips —
    // no per-card zero-state prose, no "Open issues" block at all.
    expect(screen.queryByText('Open issues')).not.toBeInTheDocument();
    expect(screen.queryByText('Unassigned (WBS)')).not.toBeInTheDocument();
    expect(screen.queryByText(/no unassigned wbs hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no unmapped plan rows/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('Unassigned: none')).toBeInTheDocument();
    expect(screen.getByTitle('Unmapped: none')).toBeInTheDocument();
    // Zero WBS hours: the coverage bar guards the divide instead of showing NaN%/Infinity.
    expect(screen.getByText(/no wbs estimate yet to cover/i)).toBeInTheDocument();
  });

  it('captions the true coverage percentage even when the plan overshoots the estimate', () => {
    // The bar width is clamped to 100% so it can't overflow its track, but the
    // caption must report the real ratio — clamping both is what made an
    // over-planned project read as exactly fully covered.
    const r = report({ projectTotal: { wbsHours: 40, planHours: 85, varianceHours: -45 } });
    render(<ReconciliationPanel report={r} />);

    expect(screen.getByText(/Plan covers 213% of the WBS estimate/i)).toBeInTheDocument();
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

    it('shows the coverage chips in the muted clear style, and omits Open issues, when every list is empty', () => {
      const r = report({});
      render(
        <ReconciliationPanel
          report={r}
          coverage={{ unplaced: [], unplacedHours: 0, unplacedShare: 0, empty: [], phaseMismatch: [] }}
        />
      );

      expect(screen.queryByText('Open issues')).not.toBeInTheDocument();
      expect(screen.queryByText('Unplaced (WBS)')).not.toBeInTheDocument();
      expect(screen.queryByText(/no unplaced wbs hours/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/no bars without scope/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/every linked leaf's phase overlaps/i)).not.toBeInTheDocument();
      expect(screen.getByTitle('Unplaced: none')).toBeInTheDocument();
      expect(screen.getByTitle('Empty: none')).toBeInTheDocument();
      expect(screen.getByTitle('Mismatch: none')).toBeInTheDocument();
    });
  });

  it('Given a project whose plan exactly matches its WBS, renders no Open issues block and every chip in the clear style', () => {
    const r = report({
      projectTotal: { wbsHours: 40, planHours: 40, varianceHours: 0 },
      byDiscipline: [{ discipline: 'Engineering', wbsHours: 40, planHours: 40, varianceHours: 0 }],
    });
    render(
      <ReconciliationPanel
        report={r}
        coverage={{ unplaced: [], unplacedHours: 0, unplacedShare: 0, empty: [], phaseMismatch: [] }}
      />
    );

    expect(screen.queryByText('Open issues')).not.toBeInTheDocument();
    for (const label of ['Unassigned', 'Unmapped', 'Unplaced', 'Empty', 'Mismatch']) {
      expect(screen.getByTitle(`${label}: none`)).toBeInTheDocument();
    }
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
      // Discovery = periods 1-2, 100h/2 = 50h/period demand vs. 0 supply.
      expect(screen.getByRole('columnheader', { name: 'W1' })).toBeInTheDocument();
      // Delta-only cell shows the variance (+50)...
      expect(screen.getAllByText('+50').length).toBeGreaterThan(0);
      // ...while the sr-only pair still carries "50/0" for assistive tech
      // (and is what keeps Roadmap.test.tsx's cross-check green, unedited).
      expect(screen.getAllByText('50/0').length).toBeGreaterThan(0);
    });

    it('keeps a wide period matrix scrolling inside its own container, so the page never scrolls sideways', () => {
      const wbsItems = [leaf({ id: 1, phaseName: 'Build' }, [{ role: 'Backend Developer', hours: 240 }])];
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
      expect(matrix.periods.length).toBeGreaterThan(1); // guard: a one-column matrix wouldn't prove anything
      // All three tables present (not just by-period), so the assertion below can't
      // pass merely because the fixture suppressed the other two <table>s.
      const r = report({
        byDiscipline: [{ discipline: 'Engineering', wbsHours: 10, planHours: 5, varianceHours: 5 }],
        phaseLevelAvailable: true,
        byPhaseDiscipline: [{ phaseName: 'Build', discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 }],
      });
      render(<ReconciliationPanel report={r} byPeriodRoleMatrix={matrix} byPeriodPhaseBaselineOnly />);

      // Every period gets its own column, so the table is wider than its card...
      matrix.periods.forEach((p) => {
        expect(screen.getByRole('columnheader', { name: `W${p}` })).toBeInTheDocument();
      });
      // ...and the overflow is owned by an ancestor of the by-period table specifically
      // (found via its own column testid, not by assuming it's the only <table> on screen).
      const periodColumn = screen.getByTestId(`by-period-col-${matrix.periods[0]}`);
      expect(periodColumn.closest('table')?.closest('.overflow-x-auto')).not.toBeNull();
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
      // The VISIBLE delta is the variance (demand - supply = 20), not the raw demand
      // (40) — the two are equal in every other fixture in this file (supply 0), so
      // a `deltaText(cell.demand)` swap would still pass those and only show up here.
      expect(screen.getAllByText('+20').length).toBeGreaterThan(0);
    });
  });
});

describe('pivotPhaseDiscipline', () => {
  function reportWith(byDiscipline: ReconciliationReport['byDiscipline'], byPhaseDiscipline: ReconciliationReport['byPhaseDiscipline']): ReconciliationReport {
    return {
      projectTotal: { wbsHours: 0, planHours: 0, varianceHours: 0 },
      byDiscipline,
      byPhaseDiscipline,
      phaseLevelAvailable: true,
      unassignedWbs: { totalHours: 0, byDiscipline: [] },
      unmappedPlan: { totalHours: 0, rows: [] },
    };
  }

  it('orders phase columns by first appearance in byPhaseDiscipline (already project order upstream)', () => {
    const r = reportWith(
      [
        { discipline: 'Design', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 },
      ],
      [
        { phaseName: 'Discovery', discipline: 'Engineering', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { phaseName: 'Build', discipline: 'Engineering', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { phaseName: 'Discovery', discipline: 'Design', wbsHours: 5, planHours: 0, varianceHours: 5 },
      ]
    );

    const pivot = pivotPhaseDiscipline(r);
    expect(pivot.phases).toEqual(['Discovery', 'Build']);
  });

  it('rows follow byDiscipline order and carry sparse (possibly null) cells', () => {
    const r = reportWith(
      [
        { discipline: 'Design', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 },
      ],
      [
        // Design only has a cell in Discovery; Engineering has both.
        { phaseName: 'Discovery', discipline: 'Design', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { phaseName: 'Discovery', discipline: 'Engineering', wbsHours: 5, planHours: 0, varianceHours: 5 },
        { phaseName: 'Build', discipline: 'Engineering', wbsHours: 5, planHours: 0, varianceHours: 5 },
      ]
    );

    const pivot = pivotPhaseDiscipline(r);
    expect(pivot.rows.map((row) => row.discipline)).toEqual(['Design', 'Engineering']);
    const design = pivot.rows.find((row) => row.discipline === 'Design')!;
    expect(design.cells.map((c) => c?.wbsHours ?? null)).toEqual([5, null]); // sparse: no Build cell
    const engineering = pivot.rows.find((row) => row.discipline === 'Engineering')!;
    expect(engineering.cells.map((c) => c?.wbsHours)).toEqual([5, 5]);
  });

  it('does not confuse a phase/discipline pair with a different pair whose joined text is identical', () => {
    // "Detail design" x "MEP" and "Detail" x "design MEP" would collide under a
    // `${phase} ${discipline}` string key — both are free text with spaces.
    const r = reportWith(
      [
        { discipline: 'MEP', wbsHours: 1, planHours: 0, varianceHours: 1 },
        { discipline: 'design MEP', wbsHours: 2, planHours: 0, varianceHours: 2 },
      ],
      [
        { phaseName: 'Detail design', discipline: 'MEP', wbsHours: 1, planHours: 0, varianceHours: 1 },
        { phaseName: 'Detail', discipline: 'design MEP', wbsHours: 2, planHours: 0, varianceHours: 2 },
      ]
    );

    const pivot = pivotPhaseDiscipline(r);
    expect(pivot.phases).toEqual(['Detail design', 'Detail']);
    const mep = pivot.rows.find((row) => row.discipline === 'MEP')!;
    // MEP has an hours-1 cell under "Detail design" only, not under "Detail".
    expect(mep.cells).toEqual([expect.objectContaining({ wbsHours: 1 }), null]);
    const designMep = pivot.rows.find((row) => row.discipline === 'design MEP')!;
    // "design MEP" has an hours-2 cell under "Detail" only, not "Detail design".
    expect(designMep.cells).toEqual([null, expect.objectContaining({ wbsHours: 2 })]);
  });

  it('omits a discipline with no phase rows instead of an all-empty row', () => {
    const r = reportWith(
      [
        { discipline: 'Design', wbsHours: 5, planHours: 0, varianceHours: 5 }, // no byPhaseDiscipline entry
        { discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 },
      ],
      [{ phaseName: 'Discovery', discipline: 'Engineering', wbsHours: 10, planHours: 0, varianceHours: 10 }]
    );

    const pivot = pivotPhaseDiscipline(r);
    expect(pivot.rows.map((row) => row.discipline)).toEqual(['Engineering']);
  });
});

describe('bulletBarWidths', () => {
  it('scales the WBS track to 100% of rowMax and an under-planned fill to the plan/rowMax ratio, with no overhang', () => {
    const { track, fill, over } = bulletBarWidths({ wbsHours: 40, planHours: 30 }, 40);
    expect(track).toBe(100);
    expect(fill).toBe(75); // min(30, 40) / 40
    expect(over).toBe(0);
  });

  it('caps the fill at the WBS track and starts the overhang exactly there when over-planned', () => {
    const { track, fill, over } = bulletBarWidths({ wbsHours: 20, planHours: 30 }, 40);
    expect(track).toBe(50); // 20 / 40
    expect(fill).toBe(50); // min(30, 20) / 40 -- clamped to the track, not the raw plan
    expect(over).toBe(25); // (30 - 20) / 40, i.e. starting where the track ends
  });

  it('guards a zero or non-finite rowMax instead of dividing by it', () => {
    expect(() => bulletBarWidths({ wbsHours: 10, planHours: 5 }, 0)).not.toThrow();
    expect(() => bulletBarWidths({ wbsHours: 10, planHours: 5 }, NaN)).not.toThrow();
    expect(Number.isFinite(bulletBarWidths({ wbsHours: 10, planHours: 5 }, 0).track)).toBe(true);
  });
});

describe('varianceTint', () => {
  it('is transparent below the epsilon', () => {
    expect(varianceTint(4.5e-13, 100)).toEqual({});
    expect(varianceTint(0, 100)).toEqual({});
  });

  it('is amber for positive hours and red for negative hours', () => {
    expect(varianceTint(10, 100).backgroundColor).toMatch(/^rgba\(245, 158, 11,/);
    expect(varianceTint(-10, 100).backgroundColor).toMatch(/^rgba\(239, 68, 68,/);
  });

  it('ramps alpha from 0.08 up to 0.28 as the ratio grows, instead of clamping most of the range to one value', () => {
    const alphaOf = (rgba: string) => Number(rgba.match(/,\s*([\d.]+)\)$/)![1]);
    const tinyAlpha = alphaOf(varianceTint(1, 10_000).backgroundColor!); // ratio ~0
    const midAlpha = alphaOf(varianceTint(50, 100).backgroundColor!); // ratio 0.5
    const maxAlpha = alphaOf(varianceTint(100, 100).backgroundColor!); // ratio 1

    expect(tinyAlpha).toBeCloseTo(0.08);
    expect(midAlpha).toBeCloseTo(0.18);
    expect(maxAlpha).toBeCloseTo(0.28);
    // The mutation this guards against: clamping instead of ramping would make
    // any ratio >= 0.28 (mid included) render identically to the max.
    expect(midAlpha).not.toBe(maxAlpha);
  });

  it('clamps a ratio above 1 (hours exceeding maxAbs) to the same alpha as the max, rather than over-saturating', () => {
    const atMax = varianceTint(100, 100).backgroundColor!;
    const overMax = varianceTint(500, 100).backgroundColor!;
    expect(overMax).toBe(atMax);
  });

  it('guards a zero or non-finite maxAbs instead of dividing by it', () => {
    expect(() => varianceTint(10, 0)).not.toThrow();
    expect(() => varianceTint(10, NaN)).not.toThrow();
    expect(varianceTint(10, 0).backgroundColor).toBeTruthy();
  });
});
