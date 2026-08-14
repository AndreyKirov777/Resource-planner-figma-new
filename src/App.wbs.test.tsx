import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { WbsItem } from './services/api';

// Separate from App.test.tsx, which mocks `./components/Wbs` (like it mocks
// every other tab) purely to keep App.tsx's own render/tab-switching tests
// fast and focused. This file exists specifically to exercise App.tsx's real
// WBS handler wiring (handleAddWbsItem/handleUpdateWbsItem/
// handleDeleteWbsItem/handleReplaceWbsEstimates), which requires the real
// `Wbs` component so its toolbar and cell edits can actually invoke those
// handlers. The other four tabs stay mocked, same as App.test.tsx.

const renderApp = () => render(<App />, { wrapper: MemoryRouter });

/**
 * The same harness `Wbs.test.tsx` uses: Glide's canvas cells are unreachable
 * from Testing Library, so the grid is replaced by a component that routes
 * through the real `getCellContent` / `onCellEdited` / `onGridSelectionChange`
 * and exposes them as DOM. `Wbs.tsx` itself stays unmocked.
 */
vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@glideapps/glide-data-grid');
  const React = await import('react');

  const cellText = (cell: any): string =>
    cell.kind === actual.GridCellKind.Custom ? cell.copyData : (cell.displayData ?? '');

  const Harness = (props: any) => {
    const { rows, columns, getCellContent, onCellEdited, onGridSelectionChange } = props;
    const [draft, setDraft] = React.useState('');

    return (
      <div data-testid="glide-grid">
        <input aria-label="harness edit value" value={draft} onChange={(e) => setDraft(e.target.value)} />
        {Array.from({ length: rows }, (_unused, r) => {
          const cells = columns.map((_c: unknown, ci: number) => getCellContent([ci, r]));
          return (
            <div key={r} data-testid={`row-${r}`}>
              {cells.map((cell: any, ci: number) => (
                <span key={ci} data-testid={`cell-${ci}-${r}`}>
                  {cellText(cell)}
                </span>
              ))}
              <button
                onClick={() =>
                  onGridSelectionChange({
                    current: {
                      cell: [0, r],
                      range: { x: 0, y: r, width: 1, height: 1 },
                      rangeStack: [],
                    },
                    columns: actual.CompactSelection.empty(),
                    rows: actual.CompactSelection.empty(),
                  })
                }
              >
                {`select row ${r}`}
              </button>
              <button onClick={() => cells[1].data.onOpenMenu(cells[1].data.itemId, 0, 0)}>
                {`open menu row ${r}`}
              </button>
              <button
                onClick={() =>
                  onCellEdited([1, r], {
                    ...cells[1],
                    copyData: draft,
                    data: { ...cells[1].data, name: draft },
                  })
                }
              >
                {`rename row ${r}`}
              </button>
              <button
                onClick={() =>
                  // The Roles cell persists through the committer it is handed,
                  // not through onCellEdited — drive it the same way the
                  // overlay editor does.
                  cells[3].data.committer.commit(cells[3].data.itemId, [
                    { role: 'BA', discipline: 'Analysis', hours: Number(draft) },
                  ])
                }
              >
                {`set roles row ${r}`}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return { ...actual, default: Harness };
});

vi.mock('./components/ResourcePlan', () => ({
  ResourcePlan: () => <div data-testid="resource-plan">Resource Plan</div>,
}));
vi.mock('./components/ResourceList', () => ({
  ResourceList: () => <div data-testid="resource-list">Resource List</div>,
}));
vi.mock('./components/RateCard', () => ({
  RateCard: () => <div data-testid="rate-card">Rate Card</div>,
}));
vi.mock('./components/ProjectList', () => ({
  ProjectList: () => <div data-testid="project-list">Project list</div>,
}));
// `./components/Wbs` is intentionally NOT mocked here.

const mockProject = {
  id: 1,
  name: 'Test Project',
  description: 'Desc',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  phases: JSON.stringify([{ name: 'Phase 1', periodCount: 4, color: '#E3F2FD' }]),
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

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

vi.mock('./services/api', () => ({
  api: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getResourceLists: vi.fn(),
    getRateCards: vi.fn(),
    getRateCardMeta: vi.fn(),
    getResourcePlans: vi.fn(),
    getWbsItems: vi.fn(),
    createWbsItem: vi.fn(),
    updateWbsItem: vi.fn(),
    deleteWbsItem: vi.fn(),
    replaceWbsEstimates: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
  },
}));

const getApi = () => import('./services/api').then((m) => m.api);

beforeEach(async () => {
  const api = await getApi();
  vi.mocked(api.getProjects).mockResolvedValue([mockProject]);
  vi.mocked(api.getResourceLists).mockResolvedValue([]);
  vi.mocked(api.getRateCards).mockResolvedValue([]);
  vi.mocked(api.getRateCardMeta).mockResolvedValue({ fileName: null, importedAt: null });
  vi.mocked(api.getResourcePlans).mockResolvedValue([]);
});

async function openWbsTab() {
  const user = userEvent.setup();
  renderApp();
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /^wbs$/i })).toBeInTheDocument();
  });
  await user.click(screen.getByRole('tab', { name: /^wbs$/i }));
  return user;
}

describe('App WBS handler wiring', () => {
  it('handleDeleteWbsItem removes the deleted item and all its descendants from wbsItems state', async () => {
    const api = await getApi();
    const items = [
      wbsItem({ id: 1, name: 'Root' }),
      wbsItem({ id: 2, name: 'Child A', parentId: 1 }),
      wbsItem({ id: 3, name: 'Child B', parentId: 1 }),
      wbsItem({ id: 4, name: 'Grandchild', parentId: 2 }),
    ];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.deleteWbsItem).mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));

    const user = await openWbsTab();

    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Root'));

    await user.click(screen.getByRole('button', { name: 'open menu row 0' }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    // Confirm names the descendant count (3), matching the component contract.
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3'));
    await waitFor(() => expect(api.deleteWbsItem).toHaveBeenCalledWith(1));

    // Root + all descendants (2, 3, 4) must be gone from wbsItems state —
    // the cascade this test exists to cover.
    await waitFor(() => expect(screen.getByText(/no wbs items yet/i)).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it('handleDeleteWbsItem leaves an unrelated sibling subtree untouched', async () => {
    const api = await getApi();
    const items = [
      wbsItem({ id: 1, name: 'Root A' }),
      wbsItem({ id: 2, name: 'Root A Child', parentId: 1 }),
      wbsItem({ id: 3, name: 'Root B', displayOrder: 1 }),
    ];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.deleteWbsItem).mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));

    const user = await openWbsTab();

    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Root A'));

    await user.click(screen.getByRole('button', { name: 'open menu row 0' }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => expect(api.deleteWbsItem).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Root B'));
    expect(screen.queryByTestId('row-1')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('handleAddWbsItem calls api.createWbsItem and adds the created item to the grid', async () => {
    const api = await getApi();
    vi.mocked(api.getWbsItems).mockResolvedValue([]);
    vi.mocked(api.createWbsItem).mockResolvedValue(wbsItem({ id: 42, name: 'New item' }));

    const user = await openWbsTab();

    await waitFor(() => expect(screen.getByRole('button', { name: /add root item/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add root item/i }));

    await waitFor(() =>
      expect(api.createWbsItem).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'New item', parentId: null })
      )
    );
    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('New item'));
  });

  it('handleUpdateWbsItem calls api.updateWbsItem and reflects the rename in the grid', async () => {
    const api = await getApi();
    const items = [wbsItem({ id: 1, name: 'Root' })];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.updateWbsItem).mockResolvedValue({ ...items[0], name: 'Renamed' });

    const user = await openWbsTab();

    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Root'));
    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'rename row 0' }));

    await waitFor(() => expect(api.updateWbsItem).toHaveBeenCalledWith(1, { name: 'Renamed' }));
    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Renamed'));
  });

  it('handleReplaceWbsEstimates calls api.replaceWbsEstimates and reflects the new hours in the grid', async () => {
    const api = await getApi();
    const items = [
      wbsItem({
        id: 1,
        name: 'Root',
        estimates: [
          { id: 1, discipline: 'Analysis', role: 'BA', hours: 5, wbsItemId: 1, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.replaceWbsEstimates).mockResolvedValue([
      { id: 2, discipline: 'Analysis', role: 'BA', hours: 12, wbsItemId: 1, createdAt: '', updatedAt: '' },
    ]);

    const user = await openWbsTab();

    await waitFor(() => expect(screen.getByTestId('cell-3-0')).toHaveTextContent('BA ×5'));
    await user.type(screen.getByLabelText('harness edit value'), '12');
    await user.click(screen.getByRole('button', { name: 'set roles row 0' }));

    await waitFor(() =>
      expect(api.replaceWbsEstimates).toHaveBeenCalledWith(1, [
        { discipline: 'Analysis', role: 'BA', hours: 12 },
      ])
    );
    // The Hours rollup reflects the server confirmed value after the state update.
    await waitFor(() => expect(screen.getByTestId('cell-4-0')).toHaveTextContent('12'));
  });
});
