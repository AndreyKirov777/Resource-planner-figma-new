import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __resetLiveExchangeRates, exchangeRateForCurrency } from './config/defaults';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import App from './App';

// App uses react-router hooks (useSearchParams); provide a Router context in tests.
const renderApp = () => render(<App />, { wrapper: MemoryRouter });

// Mock heavy grid components so App renders without canvas/ResizeObserver issues
vi.mock('./components/ResourcePlan', () => ({
  ResourcePlan: (props: {
    projectName: string;
    onProjectNameChange: (name: string) => void;
    onExportProject?: () => void;
    onExportToExcel?: () => void;
    onApplyGeneratedPlan?: (draft: {
      resourcePlans: Array<{
        role: string;
        clientRole: string | null;
        name: string | null;
        intHourlyRate: number;
        clientHourlyRate: number;
        displayOrder: number;
        allocations: Array<{ periodNumber: number; allocation: number }>;
      }>;
      resourceLists: [];
    }) => Promise<void>;
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
      {props.onExportToExcel && (
        <button type="button" onClick={props.onExportToExcel}>
          Export Excel
        </button>
      )}
      {props.onApplyGeneratedPlan && (
        <button
          type="button"
          onClick={() => {
            void props.onApplyGeneratedPlan!({
              resourcePlans: [
                {
                  role: 'Backend Developer',
                  clientRole: null,
                  name: null,
                  intHourlyRate: 50,
                  clientHourlyRate: 80,
                  displayOrder: 0,
                  allocations: [{ periodNumber: 1, allocation: 100 }],
                },
              ],
              resourceLists: [],
            }).catch(() => {
              /* GeneratePlanSheet swallows this and shows it in the sheet */
            });
          }}
        >
          Accept plan
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
    getExchangeRates: vi.fn(),
    getResourcePlans: vi.fn(),
    getWbsItems: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    exportProject: vi.fn(),
    importProject: vi.fn(),
    getRoadmap: vi.fn(),
    createResourceList: vi.fn(),
    deleteResourceList: vi.fn(),
    createResourcePlan: vi.fn(),
    deleteResourcePlan: vi.fn(),
  },
}));

const getApi = () => import('./services/api').then(m => m.api);

beforeEach(async () => {
  const api = await getApi();
  vi.mocked(api.getProjects).mockResolvedValue([mockProject]);
  vi.mocked(api.getResourceLists).mockResolvedValue([]);
  vi.mocked(api.getRateCards).mockResolvedValue([]);
  vi.mocked(api.getRateCardMeta).mockResolvedValue({ fileName: null, importedAt: null });
  vi.mocked(api.getExchangeRates).mockResolvedValue({
    rates: { USD: 1, EUR: 0.85, GBP: 0.74 },
    date: '2026-09-04',
    source: 'frankfurter',
  });
  vi.mocked(api.getResourcePlans).mockResolvedValue([]);
  vi.mocked(api.getWbsItems).mockResolvedValue([]);
  vi.mocked(api.getRoadmap).mockResolvedValue({ lanes: [] });
});

afterEach(() => {
  __resetLiveExchangeRates();
});

describe('App', () => {
  it('renders six tabs with Rate Card last', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /project list/i })).toBeInTheDocument();
    });
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual([
      'Project list',
      'Resource Plan',
      'Resource List',
      'WBS',
      'Roadmap',
      'Rate Card',
    ]);
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

  it('exports Location between Name and the cost columns, leaving the rest aligned', async () => {
    const user = userEvent.setup();
    let exported: Blob | undefined;
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:mock-url';
    }) as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = vi.fn();

    const api = await getApi();
    vi.mocked(api.getResourceLists).mockResolvedValue([
      { id: 1, projectId: 1, role: 'BA', clientRole: 'Analyst', name: 'Ann', intRate: 30,
        location: 'Asia (ARM, KZ)', description: '', createdAt: '', updatedAt: '' },
    ]);
    vi.mocked(api.getResourcePlans).mockResolvedValue([
      { id: 1, projectId: 1, role: 'BA', clientRole: 'Analyst', name: 'Ann', intHourlyRate: 30,
        clientHourlyRate: 60, displayOrder: 0, createdAt: '', updatedAt: '',
        allocations: [{ id: 1, resourcePlanId: 1, periodNumber: 1, allocation: 100, createdAt: '', updatedAt: '' }] },
    ]);

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export excel/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /export excel/i }));
    await waitFor(() => expect(exported).toBeDefined());

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exported!.arrayBuffer());
    const sheet = workbook.worksheets[0];

    // Row 1 is the phase band, row 2 the headers, row 3 the single plan row, row 4 the totals.
    const headers = sheet.getRow(2).values as string[];
    expect(headers[4]).toBe('Location');
    expect(headers[5]).toBe('Internal Hourly Cost ($)');
    expect(headers[9]).toBe('Margin (%)');
    expect(headers[10]).toBe('Week 1 (%)');

    const row = sheet.getRow(3).values as (string | number)[];
    expect(row[4]).toBe('Asia (ARM,KZ)');
    expect(row[5]).toBe(30);
    expect(row[10]).toBe(100);

    const totals = sheet.getRow(4).values as (string | number)[];
    expect(totals[1]).toBe('TOTALS');
    expect(totals[11]).toBeGreaterThan(0); // Total Internal Cost, right of the week columns
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

  it('shows a full-page error with Retry when the API is unreachable on load', async () => {
    const api = await getApi();
    vi.mocked(api.getProjects).mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/cannot reach the api/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /resource plan/i })).not.toBeInTheDocument();
  });

  it('keeps the project UI when applying a generated plan fails to reach the API', async () => {
    const user = userEvent.setup();
    const api = await getApi();
    vi.mocked(api.createResourceList).mockRejectedValue(new TypeError('Failed to fetch'));
    vi.mocked(api.createResourcePlan).mockResolvedValue({} as never);
    vi.mocked(api.deleteResourceList).mockResolvedValue(undefined);
    vi.mocked(api.deleteResourcePlan).mockResolvedValue(undefined);

    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept plan/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /accept plan/i }));

    await waitFor(() => {
      expect(api.createResourceList).toHaveBeenCalled();
    });
    expect(screen.getByRole('tab', { name: /resource plan/i })).toBeInTheDocument();
    expect(screen.getByTestId('resource-plan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('does not overwrite a stored project exchangeRate when live rates load', async () => {
    const api = await getApi();
    vi.mocked(api.updateProject).mockClear();
    vi.mocked(api.getProjects).mockResolvedValue([
      { ...mockProject, clientCurrency: 'GBP', exchangeRate: 0.79 },
    ]);

    renderApp();
    await waitFor(() => {
      expect(api.getExchangeRates).toHaveBeenCalled();
      expect(exchangeRateForCurrency('EUR')).toBe(0.85);
    });
    expect(api.updateProject).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exchangeRate: expect.anything() })
    );
  });
});
