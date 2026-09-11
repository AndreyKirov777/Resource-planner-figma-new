import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wbs } from './Wbs';
import type { Project, RateCard, ResourceList, WbsItem, RoadmapLaneWithItems } from '../services/api';

/**
 * The optional Roadmap column (CAP-5, gap 1 in the kickoff prompt) — kept in
 * its own file so `Wbs.test.tsx`'s existing 47 tests stay the untouched
 * proof of pixel parity (they assert a 5-column grid and all still pass
 * unmodified against the refactored `getCellContent`/`columns`).
 *
 * Trimmed copy of `Wbs.test.tsx`'s Glide mock harness — only what this file
 * needs: the joined column titles and each row's per-column cell text.
 */
vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@glideapps/glide-data-grid');
  const React = await import('react');

  const cellText = (cell: any): string =>
    cell.kind === actual.GridCellKind.Custom ? cell.copyData : (cell.displayData ?? '');

  const Harness = React.forwardRef((props: any) => {
    const { rows, columns, getCellContent, onCellEdited } = props;
    return (
      <div data-testid="glide-grid">
        <span data-testid="grid-columns">{columns.map((c: { title: string }) => c.title).join('|')}</span>
        {Array.from({ length: rows }, (_unused, r) => {
          const cells = columns.map((_c: unknown, ci: number) => getCellContent([ci, r]));
          const roadmapColIndex = columns.findIndex((c: { title: string }) => c.title === 'Roadmap');
          return (
            <div key={r} data-testid={`row-${r}`}>
              {cells.map((cell: any, ci: number) => (
                <span key={ci} data-testid={`cell-${ci}-${r}`}>
                  {cellText(cell)}
                </span>
              ))}
              {roadmapColIndex >= 0 && (
                <button
                  onClick={() =>
                    onCellEdited([roadmapColIndex, r], {
                      ...cells[roadmapColIndex],
                      data: { ...cells[roadmapColIndex].data, ownRoadmapItemId: null },
                    })
                  }
                >
                  {`unlink row ${r}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  });
  Harness.displayName = 'GlideHarness';

  return { ...actual, default: Harness };
});

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

function resourceList(id: number, role: string, clientRole = role): ResourceList {
  return {
    id,
    role,
    clientRole,
    intRate: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
  };
}

const mockProject: Project = {
  id: 1,
  name: 'Test Project',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  planningMode: 'weekly',
  status: 'active',
  phases: JSON.stringify([{ name: 'Phase 1', periodCount: 8, color: '#E3F2FD' }]),
  createdAt: '',
  updatedAt: '',
};

function defaultProps(wbsItems: WbsItem[], roadmapLanes: RoadmapLaneWithItems[] = []) {
  return {
    project: mockProject,
    resourcePlans: [],
    resourceLists: [resourceList(1, 'BA'), resourceList(2, 'Dev Sr')],
    rateCards: [] as RateCard[],
    wbsItems,
    onAddWbsItem: vi.fn().mockResolvedValue(wbsItem({ id: 999 })),
    onUpdateWbsItem: vi.fn().mockResolvedValue(undefined),
    onDeleteWbsItem: vi.fn().mockResolvedValue(undefined),
    onReplaceWbsEstimates: vi.fn().mockResolvedValue(undefined),
    roadmapLanes,
    onSetWbsRoadmapLink: vi.fn().mockResolvedValue(undefined),
  };
}

const tree: WbsItem[] = [
  wbsItem({ id: 1, name: 'Root' }),
  wbsItem({ id: 2, name: 'Child', parentId: 1 }),
];

const lanes: RoadmapLaneWithItems[] = [
  {
    id: 1,
    name: 'Backend',
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    items: [
      {
        id: 10,
        name: 'API',
        kind: 'bar',
        startPeriod: 1,
        periodCount: 4,
        displayOrder: 0,
        laneId: 1,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        color: '#8f4f8f',
        wbsItemIds: [1],
      },
    ],
  },
];

describe('Wbs — optional Roadmap column', () => {
  it('is hidden by default after TOTAL and Resource List role columns', () => {
    window.localStorage.clear();
    render(<Wbs {...defaultProps(tree, lanes)} />);
    expect(screen.getByTestId('grid-columns').textContent).toBe(
      'WBS|Task Description|Phase|TOTAL|BA|Sr\nDev'
    );
  });

  it('shows Roadmap last, with names resolved for own and inherited links', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(tree, lanes)} />);

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Roadmap' }));

    expect(screen.getByTestId('grid-columns').textContent).toBe(
      'WBS|Task Description|Phase|TOTAL|BA|Sr\nDev|Roadmap'
    );
    // Row 0 = Root (directly linked to "API"), row 1 = Child (inherits it).
    expect(screen.getByTestId('cell-6-0').textContent).toBe('API');
    expect(screen.getByTestId('cell-6-1').textContent).toBe('↑ API');
  });

  it('unlinking writes null through onSetWbsRoadmapLink', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const props = defaultProps(tree, lanes);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Roadmap' }));
    await user.click(screen.getByRole('button', { name: 'unlink row 0' }));

    expect(props.onSetWbsRoadmapLink).toHaveBeenCalledWith(1, null);
  });

  it('renders with no roadmapLanes prop at all — the optional prop degrades cleanly', () => {
    window.localStorage.clear();
    const { roadmapLanes: _omit, onSetWbsRoadmapLink: _omit2, ...propsWithoutRoadmap } = defaultProps(tree);
    render(<Wbs {...propsWithoutRoadmap} />);
    expect(screen.getByTestId('grid-columns').textContent).toBe(
      'WBS|Task Description|Phase|TOTAL|BA|Sr\nDev'
    );
  });
});
