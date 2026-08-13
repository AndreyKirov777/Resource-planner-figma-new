import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// App uses react-router hooks (useSearchParams); provide a Router context in tests.
const renderApp = () => render(<App />, { wrapper: MemoryRouter });

// Mock heavy grid components so App renders without canvas/ResizeObserver issues
vi.mock('./components/ResourcePlan', () => ({
  ResourcePlan: (props: {
    projectName: string;
    onProjectNameChange: (name: string) => void;
    onExportProject?: () => void;
  }) => (
    <div data-testid="resource-plan">
      <input
        aria-label="Project name"
        placeholder="Enter project name"
        value={props.projectName}
        onChange={e => props.onProjectNameChange(e.target.value)}
      />
      {props.onExportProject && (
        <button type="button" onClick={props.onExportProject}>
          Save file
        </button>
      )}
    </div>
  ),
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
vi.mock('./components/Wbs', () => ({
  Wbs: () => <div data-testid="wbs">WBS</div>,
}));

const mockProject = {
  id: 1,
  name: 'Test Project',
  description: 'Desc',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

vi.mock('./services/api', () => ({
  api: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getResourceLists: vi.fn(),
    getRateCards: vi.fn(),
    getRateCardMeta: vi.fn(),
    getResourcePlans: vi.fn(),
    getWbsItems: vi.fn(),
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
  vi.mocked(api.getWbsItems).mockResolvedValue([]);
});

describe('App', () => {
  it('renders five tabs including Project list and WBS', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /project list/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /resource plan/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /resource list/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /rate card/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^wbs$/i })).toBeInTheDocument();
  });

  it('shows Resource Plan by default', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resource plan/i })).toBeInTheDocument();
    });
    const resourcePlanTab = screen.getByRole('tab', { name: /resource plan/i });
    expect(resourcePlanTab).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('resource-plan')).toBeInTheDocument();
  });

  it('switches to Resource List tab when clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resource list/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /resource list/i }));
    await waitFor(() => {
      const listTab = screen.getByRole('tab', { name: /resource list/i });
      expect(listTab).toHaveAttribute('data-state', 'active');
    });
  });

  it('switches to Rate Card tab when clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /rate card/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /rate card/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /rate card/i })).toHaveAttribute('data-state', 'active');
    });
  });

  it('calls createProject and loads new project when no projects exist', async () => {
    const api = await getApi();
    vi.mocked(api.getProjects).mockResolvedValue([]);
    const newProject = { ...mockProject, id: 2, name: 'Default Project' };
    vi.mocked(api.createProject).mockResolvedValue(newProject);
    renderApp();
    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Default Project' })
      );
    });
    await waitFor(() => {
      expect(api.getResourceLists).toHaveBeenCalledWith(2);
      expect(api.getResourcePlans).toHaveBeenCalledWith(2);
    });
    // Rate cards are global and loaded once, with no project id
    expect(api.getRateCards).toHaveBeenCalledWith();
  });

  it('Export JSON triggers download via createObjectURL', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    const api = await getApi();
    vi.mocked(api.exportProject).mockResolvedValue({ project: mockProject, resourceLists: [], resourcePlans: [] });

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resource plan/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /resource plan/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/project name/i)).toBeInTheDocument();
    });
    const saveButton = screen.getByRole('button', { name: /save file/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(api.exportProject).toHaveBeenCalledWith(1);
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it('project name change calls updateProject', async () => {
    const user = userEvent.setup();
    const api = await getApi();
    vi.mocked(api.updateProject).mockResolvedValue({ ...mockProject, name: 'Changed' });

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /resource plan/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /resource plan/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/project name/i)).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText(/project name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed');
    await user.tab();

    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalled();
      expect(api.updateProject).toHaveBeenCalledWith(1, expect.any(Object));
      const calls = vi.mocked(api.updateProject).mock.calls;
      const names = calls.map(c => c[1]?.name).filter(Boolean);
      expect(names.some(n => typeof n === 'string' && n.length > 0)).toBe(true);
    });
  });
});
