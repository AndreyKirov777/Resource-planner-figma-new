import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResourcePlan } from './ResourcePlan';
import type { Project, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType } from '../services/api';

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

describe('ResourcePlan', () => {
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
});
