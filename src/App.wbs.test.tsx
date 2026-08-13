import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import type { WbsItem } from './services/api';

// Separate from App.test.tsx, which mocks `./components/Wbs` (like it mocks
// every other tab) purely to keep App.tsx's own render/tab-switching tests
// fast and focused. This file exists specifically to exercise App.tsx's real
// WBS handler wiring (handleAddWbsItem/handleUpdateWbsItem/
// handleDeleteWbsItem/handleReplaceWbsEstimates), which requires the real
// `Wbs` component so its buttons/inputs can actually invoke those handlers.
// The other four tabs stay mocked, same as App.test.tsx, since they're not
// what's under test here.

const renderApp = () => render(<App />, { wrapper: MemoryRouter });

// Radix Select (used by the real Wbs component's Phase picker) relies on
// pointer-capture / scrollIntoView APIs jsdom doesn't implement.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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

const getApi = () => import('./services/api').then(m => m.api);

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

    await waitFor(() => {
      expect(screen.getByDisplayValue('Root')).toBeInTheDocument();
    });

    const rootRow = screen.getByDisplayValue('Root').closest('tr')!;
    const deleteButton = within(rootRow).getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    // Confirm names the descendant count (3), matching the component-level contract.
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3'));
    await waitFor(() => {
      expect(api.deleteWbsItem).toHaveBeenCalledWith(1);
    });

    // Root + all descendants (2, 3, 4) must be gone from wbsItems state —
    // the cascade this test exists to cover.
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Root')).not.toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('Child A')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Child B')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Grandchild')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('handleDeleteWbsItem leaves an unrelated sibling subtree untouched', async () => {
    const api = await getApi();
    const items = [
      wbsItem({ id: 1, name: 'Root A' }),
      wbsItem({ id: 2, name: 'Root A Child', parentId: 1 }),
      wbsItem({ id: 3, name: 'Root B' }),
    ];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.deleteWbsItem).mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));

    const user = await openWbsTab();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Root A')).toBeInTheDocument();
    });

    const rootARow = screen.getByDisplayValue('Root A').closest('tr')!;
    await user.click(within(rootARow).getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(api.deleteWbsItem).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Root A')).not.toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('Root A Child')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Root B')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('handleAddWbsItem calls api.createWbsItem and adds the created item to the table', async () => {
    const api = await getApi();
    vi.mocked(api.getWbsItems).mockResolvedValue([]);
    const created = wbsItem({ id: 42, name: 'New item' });
    vi.mocked(api.createWbsItem).mockResolvedValue(created);

    const user = await openWbsTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add root item/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /add root item/i }));

    await waitFor(() => {
      expect(api.createWbsItem).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'New item', parentId: null })
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Name for item 42')).toBeInTheDocument();
    });
  });

  it('handleUpdateWbsItem calls api.updateWbsItem and reflects the rename in the table', async () => {
    const api = await getApi();
    const items = [wbsItem({ id: 1, name: 'Root' })];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.updateWbsItem).mockResolvedValue({ ...items[0], name: 'Renamed' });

    const user = await openWbsTab();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Root')).toBeInTheDocument();
    });
    const nameInput = screen.getByLabelText('Name for item 1');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    await user.tab();

    await waitFor(() => {
      expect(api.updateWbsItem).toHaveBeenCalledWith(1, { name: 'Renamed' });
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('Renamed')).toBeInTheDocument();
    });
  });

  it('handleReplaceWbsEstimates calls api.replaceWbsEstimates and reflects the new hours in the table', async () => {
    const api = await getApi();
    const items = [
      wbsItem({
        id: 1,
        name: 'Root',
        estimates: [
          { id: 1, discipline: 'Engineering', role: '', hours: 5, wbsItemId: 1, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    vi.mocked(api.getWbsItems).mockResolvedValue(items);
    vi.mocked(api.replaceWbsEstimates).mockResolvedValue([
      { id: 1, discipline: 'Engineering', role: '', hours: 12, wbsItemId: 1, createdAt: '', updatedAt: '' },
    ]);

    const user = await openWbsTab();

    await waitFor(() => {
      expect(screen.getByLabelText('Engineering hours for item 1')).toBeInTheDocument();
    });
    const hoursInput = screen.getByLabelText('Engineering hours for item 1');
    await user.clear(hoursInput);
    await user.type(hoursInput, '12');
    await user.tab();

    await waitFor(() => {
      expect(api.replaceWbsEstimates).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([expect.objectContaining({ discipline: 'Engineering', hours: 12 })])
      );
    });
    // "Total hours" cell reflects the server's confirmed value after the state update.
    await waitFor(() => {
      const row = screen.getByLabelText('Engineering hours for item 1').closest('tr')!;
      expect(within(row).getByText('12')).toBeInTheDocument();
    });
  });
});
