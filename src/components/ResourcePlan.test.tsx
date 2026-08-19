import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourcePlan } from './ResourcePlan';
import type { Project, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType } from '../services/api';
import { columnStorageKey } from './planningColumns';

vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    default: () => <div data-testid="glide-grid">Grid</div>,
  };
});

const mockProject: Project = {
  id: 1,
  name: 'Test',
  description: '',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  createdAt: '',
  updatedAt: '',
};

const defaultProps = {
  project: mockProject,
  resourceLists: [] as ResourceListType[],
  resourcePlans: [] as ResourcePlanType[],
  onResourcePlansChange: vi.fn(),
  onAddResourcePlan: vi.fn(),
  onDeleteResourcePlan: vi.fn(),
  onReorderResourcePlans: vi.fn(),
  onProjectSettingsChange: vi.fn(),
  onExportProject: vi.fn(),
  onImportProject: vi.fn(),
  onExportToExcel: vi.fn(),
  onExportToPNG: vi.fn(),
  onClearAllResourcePlans: vi.fn(),
  onConvertPlanningMode: vi.fn(),
  projectName: 'Test',
  projectDescription: '',
  onProjectNameChange: vi.fn(),
  onProjectDescriptionChange: vi.fn(),
};

function installMemoryLocalStorage() {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
}

describe('ResourcePlan', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });
  it('renders project name input', () => {
    render(<ResourcePlan {...defaultProps} />);
    expect(screen.getByPlaceholderText(/enter project name/i)).toBeInTheDocument();
  });

  it('renders Total Internal Cost, Total Price, and Total Estimated Efforts in summary', () => {
    render(<ResourcePlan {...defaultProps} />);
    expect(screen.getByText('Total Internal Cost')).toBeInTheDocument();
    expect(screen.getByText('Total Price')).toBeInTheDocument();
    expect(screen.getByText('Total Estimated Efforts')).toBeInTheDocument();
  });

  it('displays zero totals when resourcePlans is empty', () => {
    render(<ResourcePlan {...defaultProps} />);
    expect(screen.getByText('Total Internal Cost')).toBeInTheDocument();
    const internalCostDiv = screen.getByText('Total Internal Cost').closest('div')?.parentElement;
    expect(internalCostDiv?.textContent).toMatch(/\$0|0/);
  });

  it('renders the Columns toggle in the Planning Table toolbar', () => {
    render(<ResourcePlan {...defaultProps} />);
    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument();
  });

  it('hides a column from the menu, shows a badge, and persists per project', async () => {
    const user = userEvent.setup();
    render(<ResourcePlan {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /^columns$/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Name' }));

    expect(window.localStorage.getItem(columnStorageKey(1))).toBe(JSON.stringify(['name']));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /columns/i, hidden: true })).toHaveTextContent('1');

    await user.click(screen.getByRole('menuitem', { name: 'Show all' }));
    expect(window.localStorage.getItem(columnStorageKey(1))).toBe(JSON.stringify([]));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveAttribute('aria-checked', 'true');
  });
});
