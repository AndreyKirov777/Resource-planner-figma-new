import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourcePlan } from './ResourcePlan';
import type { Project, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType } from '../services/api';
import { columnStorageKey } from './planningColumns';
import { __resetLiveExchangeRates, setLiveExchangeRates } from '../config/defaults';

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
    __resetLiveExchangeRates();
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

    await user.click(screen.getByRole('button', { name: /columns/i }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Daily cost' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Daily rate' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Name' }));

    expect(window.localStorage.getItem(columnStorageKey(1))).toBe(
      JSON.stringify(['intDaily', 'clientDaily', 'name'])
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: /columns/i, hidden: true })).toHaveTextContent('3');

    await user.click(screen.getByRole('menuitem', { name: 'Show all' }));
    expect(window.localStorage.getItem(columnStorageKey(1))).toBe(JSON.stringify([]));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Daily cost' })).toHaveAttribute('aria-checked', 'true');
  });

  function currencyTrigger(): HTMLElement {
    const field = screen.getByText('Client currency').closest('div');
    const trigger = field?.querySelector('[role="combobox"]');
    if (!trigger) throw new Error('Client currency select not found');
    return trigger as HTMLElement;
  }

  const allocatedPlan: ResourcePlanType = {
    id: 7,
    role: 'Engineer',
    intHourlyRate: 50,
    clientHourlyRate: 100,
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    allocations: [{
      id: 1,
      periodNumber: 1,
      allocation: 100,
      resourcePlanId: 7,
      createdAt: '',
      updatedAt: '',
    }],
  };

  it('pairs the default FX when Client currency changes and leaves plan rates alone', async () => {
    const user = userEvent.setup();
    const onProjectSettingsChange = vi.fn();
    const onResourcePlansChange = vi.fn();
    const { rerender } = render(
      <ResourcePlan
        {...defaultProps}
        onProjectSettingsChange={onProjectSettingsChange}
        onResourcePlansChange={onResourcePlansChange}
        resourcePlans={[allocatedPlan]}
      />
    );

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    expect(onProjectSettingsChange).toHaveBeenCalledWith({
      clientCurrency: 'EUR',
      exchangeRate: 0.89,
    });

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'GBP' }));
    expect(onProjectSettingsChange).toHaveBeenCalledWith({
      clientCurrency: 'GBP',
      exchangeRate: 0.79,
    });

    rerender(
      <ResourcePlan
        {...defaultProps}
        project={{ ...mockProject, clientCurrency: 'EUR', exchangeRate: 0.89 }}
        onProjectSettingsChange={onProjectSettingsChange}
        onResourcePlansChange={onResourcePlansChange}
        resourcePlans={[allocatedPlan]}
      />
    );
    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    expect(onProjectSettingsChange).toHaveBeenCalledWith({
      clientCurrency: 'USD',
      exchangeRate: 1,
    });
    expect(onResourcePlansChange).not.toHaveBeenCalled();
  });

  it('pairs the live overlay FX when Client currency changes after rates load', async () => {
    setLiveExchangeRates({ EUR: 0.85, USD: 1, GBP: 0.74 });
    const user = userEvent.setup();
    const onProjectSettingsChange = vi.fn();
    const onResourcePlansChange = vi.fn();
    render(
      <ResourcePlan
        {...defaultProps}
        onProjectSettingsChange={onProjectSettingsChange}
        onResourcePlansChange={onResourcePlansChange}
        resourcePlans={[allocatedPlan]}
      />
    );

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    expect(onProjectSettingsChange).toHaveBeenCalledWith({
      clientCurrency: 'EUR',
      exchangeRate: 0.85,
    });
    expect(onResourcePlansChange).not.toHaveBeenCalled();
  });

  it('does not write settings when the current currency is reselected', async () => {
    const user = userEvent.setup();
    const onProjectSettingsChange = vi.fn();
    render(
      <ResourcePlan
        {...defaultProps}
        onProjectSettingsChange={onProjectSettingsChange}
      />
    );

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    expect(onProjectSettingsChange).not.toHaveBeenCalled();
  });

  it('still persists currency and FX when there are no plan rows', async () => {
    const user = userEvent.setup();
    const onProjectSettingsChange = vi.fn();
    render(
      <ResourcePlan
        {...defaultProps}
        onProjectSettingsChange={onProjectSettingsChange}
      />
    );

    expect(screen.getByText('Calculated Project Margin').closest('div')).toHaveTextContent('0.0%');

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    expect(onProjectSettingsChange).toHaveBeenCalledWith({
      clientCurrency: 'EUR',
      exchangeRate: 0.89,
    });
    expect(screen.getByText('Calculated Project Margin').closest('div')).toHaveTextContent('0.0%');
  });

  it('displays the exchange rate rounded to two decimal places', () => {
    render(
      <ResourcePlan
        {...defaultProps}
        project={{ ...mockProject, clientCurrency: 'GBP', exchangeRate: 0.74022 }}
      />
    );

    expect(screen.getByLabelText('Exchange rate (to USD)')).toHaveValue(0.74);
  });

  it('persists only exchangeRate when the Exchange rate field is edited', () => {
    setLiveExchangeRates({ EUR: 0.85, USD: 1, GBP: 0.74 });
    const onProjectSettingsChange = vi.fn();
    render(
      <ResourcePlan
        {...defaultProps}
        project={{ ...mockProject, clientCurrency: 'EUR', exchangeRate: 0.85 }}
        onProjectSettingsChange={onProjectSettingsChange}
      />
    );

    const fxInput = screen.getByLabelText('Exchange rate (to USD)');
    fireEvent.change(fxInput, { target: { value: '0.95' } });

    expect(onProjectSettingsChange).toHaveBeenCalledTimes(1);
    expect(onProjectSettingsChange).toHaveBeenCalledWith({ exchangeRate: 0.95 });
    expect(onProjectSettingsChange.mock.calls.every(
      ([payload]) => payload.clientCurrency === undefined
    )).toBe(true);
  });

  it('recomputes Calculated Project Margin from a new exchangeRate without rewriting rates', () => {
    const onResourcePlansChange = vi.fn();
    const { rerender } = render(
      <ResourcePlan
        {...defaultProps}
        onResourcePlansChange={onResourcePlansChange}
        resourcePlans={[allocatedPlan]}
      />
    );

    const marginBlock = screen.getByText('Calculated Project Margin').closest('div');
    expect(marginBlock).toHaveTextContent('50.0%');

    rerender(
      <ResourcePlan
        {...defaultProps}
        project={{ ...mockProject, clientCurrency: 'EUR', exchangeRate: 0.89 }}
        onResourcePlansChange={onResourcePlansChange}
        resourcePlans={[allocatedPlan]}
      />
    );

    expect(screen.getByText('Calculated Project Margin').closest('div')).toHaveTextContent('55.5%');
    expect(onResourcePlansChange).not.toHaveBeenCalled();
  });
});
