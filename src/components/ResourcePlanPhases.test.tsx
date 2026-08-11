import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ResourcePlan } from './ResourcePlan';
import type { Project, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType, Phase } from '../services/api';

vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    default: () => <div data-testid="glide-grid">Grid</div>,
  };
});

// Discovery owns weeks 1-2, Build 3-8, UAT 9-10.
const PHASES: Phase[] = [
  { name: 'Discovery', periodCount: 2, color: '#E3F2FD' },
  { name: 'Build', periodCount: 6, color: '#FCE4EC' },
  { name: 'UAT', periodCount: 2, color: '#E8F5E9' },
];

const mockProject: Project = {
  id: 1,
  name: 'Test',
  description: '',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  phases: JSON.stringify(PHASES),
  createdAt: '',
  updatedAt: '',
};

// One allocation per week, valued 10..100, so each phase carries a distinct signature.
const mockPlan = {
  id: 7,
  role: 'Engineer',
  intHourlyRate: 50,
  clientHourlyRate: 100,
  projectId: 1,
  createdAt: '',
  updatedAt: '',
  allocations: Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    periodNumber: i + 1,
    allocation: (i + 1) * 10,
    resourcePlanId: 7,
    createdAt: '',
    updatedAt: '',
  })),
} as unknown as ResourcePlanType;

type SettingsChange = (settings: Partial<Project>) => void;
type PlansChange = (plans: ResourcePlanType[]) => void;

let onProjectSettingsChange: Mock<SettingsChange>;
let onResourcePlansChange: Mock<PlansChange>;

function renderPlan() {
  onProjectSettingsChange = vi.fn<SettingsChange>();
  onResourcePlansChange = vi.fn<PlansChange>();
  return render(
    <ResourcePlan
      project={mockProject}
      resourceLists={[] as ResourceListType[]}
      resourcePlans={[mockPlan]}
      onResourcePlansChange={onResourcePlansChange}
      onAddResourcePlan={vi.fn()}
      onDeleteResourcePlan={vi.fn()}
      onReorderResourcePlans={vi.fn()}
      onProjectSettingsChange={onProjectSettingsChange}
      onConvertPlanningMode={vi.fn()}
      projectName="Test"
      projectDescription=""
      onProjectNameChange={vi.fn()}
      onProjectDescriptionChange={vi.fn()}
    />
  );
}

/** The draggable phase chips, in render order. */
function phaseChips(): HTMLElement[] {
  const bar = screen.getByText('Phases:').parentElement as HTMLElement;
  return Array.from(bar.querySelectorAll<HTMLElement>('[draggable="true"]'));
}

function dataTransfer() {
  return { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() };
}

/** Persisted phases from the most recent onProjectSettingsChange call. */
function persistedPhases(): Phase[] {
  const calls = onProjectSettingsChange.mock.calls;
  return JSON.parse(calls[calls.length - 1][0].phases as string);
}

/** periodNumber -> allocation from the most recent onResourcePlansChange call. */
function persistedAllocations(): Record<number, number> {
  const calls = onResourcePlansChange.mock.calls;
  const plans = calls[calls.length - 1][0];
  return Object.fromEntries(plans[0].allocations.map((a) => [a.periodNumber, a.allocation]));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phase chip bar', () => {
  it('renders one draggable chip per phase', () => {
    renderPlan();
    const chips = phaseChips();
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Discovery'),
      expect.stringContaining('Build'),
      expect.stringContaining('UAT'),
    ]);
  });
});

describe('phase drag-and-drop reordering', () => {
  it('reorders the phases and carries their allocations along', () => {
    renderPlan();
    const chips = phaseChips();
    const dt = dataTransfer();

    // Drag "Build" onto "Discovery".
    fireEvent.dragStart(chips[1], { dataTransfer: dt });
    fireEvent.dragOver(chips[0], { dataTransfer: dt });
    fireEvent.drop(chips[0], { dataTransfer: dt });

    expect(persistedPhases().map((p) => p.name)).toEqual(['Build', 'Discovery', 'UAT']);

    // Build's 30..80 lead the timeline; Discovery's 10,20 follow; UAT is untouched.
    expect(persistedAllocations()).toEqual({
      1: 30, 2: 40, 3: 50, 4: 60, 5: 70, 6: 80,
      7: 10, 8: 20,
      9: 90, 10: 100,
    });
  });

  it('keeps phase period counts intact when reordering', () => {
    renderPlan();
    const chips = phaseChips();
    const dt = dataTransfer();

    fireEvent.dragStart(chips[2], { dataTransfer: dt });
    fireEvent.drop(chips[0], { dataTransfer: dt });

    expect(persistedPhases().map((p) => [p.name, p.periodCount])).toEqual([
      ['UAT', 2],
      ['Discovery', 2],
      ['Build', 6],
    ]);
  });

  it('does nothing when a phase is dropped on itself', () => {
    renderPlan();
    const chips = phaseChips();
    const dt = dataTransfer();

    fireEvent.dragStart(chips[1], { dataTransfer: dt });
    fireEvent.drop(chips[1], { dataTransfer: dt });

    expect(onProjectSettingsChange).not.toHaveBeenCalled();
    expect(onResourcePlansChange).not.toHaveBeenCalled();
  });

  it('does not start a drag from the chip kebab menu', () => {
    renderPlan();
    const chips = phaseChips();
    const menuButton = within(chips[1]).getByRole('button');

    fireEvent.dragStart(menuButton, { dataTransfer: dataTransfer() });
    fireEvent.drop(chips[0], { dataTransfer: dataTransfer() });

    expect(onProjectSettingsChange).not.toHaveBeenCalled();
  });
});

describe('phase split', () => {
  it('splits a phase at the chosen period without moving allocations', async () => {
    renderPlan();
    const chips = phaseChips();

    // Open the "Build" chip menu and choose Split.
    fireEvent.pointerDown(
      within(chips[1]).getByRole('button'),
      { ctrlKey: false, button: 0 }
    );
    const splitItem = await screen.findByText('Split');
    fireEvent.click(splitItem);

    // Dialog defaults to the phase midpoint: Build spans 3-8, so week 5.
    expect(await screen.findByText(/covers weeks 3–8/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    expect(persistedPhases().map((p) => [p.name, p.periodCount])).toEqual([
      ['Discovery', 2],
      ['Build', 3],
      ['Build 2', 3],
      ['UAT', 2],
    ]);
    // Splitting is metadata-only — no allocation writes.
    expect(onResourcePlansChange).not.toHaveBeenCalled();
  });

  it('preserves the total timeline length', async () => {
    renderPlan();
    const chips = phaseChips();

    fireEvent.pointerDown(within(chips[1]).getByRole('button'), { ctrlKey: false, button: 0 });
    fireEvent.click(await screen.findByText('Split'));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    const before = PHASES.reduce((s, p) => s + (p.periodCount ?? 0), 0);
    const after = persistedPhases().reduce((s, p) => s + (p.periodCount ?? 0), 0);
    expect(after).toBe(before);
  });

  it('enables Split on a phase of two or more periods', async () => {
    renderPlan();
    const chips = phaseChips();

    fireEvent.pointerDown(within(chips[2]).getByRole('button'), { ctrlKey: false, button: 0 });
    const splitItem = await screen.findByText('Split');
    expect(splitItem.closest('[role="menuitem"]')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('disables Split on a single-period phase', async () => {
    onProjectSettingsChange = vi.fn();
    onResourcePlansChange = vi.fn();
    render(
      <ResourcePlan
        project={{
          ...mockProject,
          phases: JSON.stringify([
            { name: 'Kickoff', periodCount: 1, color: '#E3F2FD' },
            { name: 'Build', periodCount: 4, color: '#FCE4EC' },
          ]),
        }}
        resourceLists={[] as ResourceListType[]}
        resourcePlans={[]}
        onResourcePlansChange={onResourcePlansChange}
        onAddResourcePlan={vi.fn()}
        onDeleteResourcePlan={vi.fn()}
        onReorderResourcePlans={vi.fn()}
        onProjectSettingsChange={onProjectSettingsChange}
        onConvertPlanningMode={vi.fn()}
        projectName="Test"
        projectDescription=""
        onProjectNameChange={vi.fn()}
        onProjectDescriptionChange={vi.fn()}
      />
    );

    const chips = phaseChips();
    fireEvent.pointerDown(within(chips[0]).getByRole('button'), { ctrlKey: false, button: 0 });
    const splitItem = await screen.findByText('Split');
    expect(splitItem.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true');
  });
});
