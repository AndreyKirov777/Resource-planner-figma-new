import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconciliationPanel } from './ReconciliationPanel';
import type { ReconciliationReport } from '../utils/wbs';

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
});
