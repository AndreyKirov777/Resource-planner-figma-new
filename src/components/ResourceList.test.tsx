import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceList } from './ResourceList';

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => (
    <div data-testid="ag-grid">
      {props.columnDefs?.map((c: any, i: number) => (
        <div key={c.colId ?? c.field ?? i} data-testid={`col-${c.colId ?? c.field}`}>
          {c.headerName}
        </div>
      ))}
    </div>
  ),
}));

const defaultProps = {
  resourceLists: [],
  onResourceListsChange: vi.fn(),
  onResourceListUpdate: vi.fn(),
  onAddResourceList: vi.fn(),
  onDeleteResourceList: vi.fn(),
  group: 'ADMIN' as const,
};

describe('ResourceList', () => {
  it('renders Add custom resource title', () => {
    render(<ResourceList {...defaultProps} />);
    expect(screen.getByText('Add custom resource')).toBeInTheDocument();
  });

  it('renders Resource List card', () => {
    render(<ResourceList {...defaultProps} />);
    expect(screen.getByText('Resource List')).toBeInTheDocument();
  });

  it('Add button is disabled when role or rate is empty', () => {
    render(<ResourceList {...defaultProps} />);
    const addButton = screen.getByRole('button', { name: /add/i });
    expect(addButton).toBeDisabled();
  });

  it('calls onAddResourceList when role and rate are filled and Add is clicked', async () => {
    const user = userEvent.setup();
    const onAddResourceList = vi.fn();
    render(<ResourceList {...defaultProps} onAddResourceList={onAddResourceList} />);
    await user.type(screen.getByLabelText(/rate card role/i), 'Developer');
    await user.type(screen.getByLabelText(/rate \(\$\/h\)/i), '50');
    const addButton = screen.getByRole('button', { name: /add/i });
    expect(addButton).not.toBeDisabled();
    await user.click(addButton);
    expect(onAddResourceList).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'Developer', intRate: 50 })
    );
    expect(onAddResourceList.mock.calls[0][0].hourlyRate).toBeUndefined();
  });

  describe('USER visibility ceiling', () => {
    const userProps = { ...defaultProps, group: 'USER' as const };

    it('hides the Hourly cost and Margin columns, keeps Hourly rate', () => {
      render(<ResourceList {...userProps} />);
      expect(screen.queryByTestId('col-intRate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('col-margin')).not.toBeInTheDocument();
      expect(screen.getByTestId('col-hourlyRate')).toBeInTheDocument();
    });

    it('hides the Rate ($/h) input in the add-custom-resource form', () => {
      render(<ResourceList {...userProps} />);
      expect(screen.queryByLabelText(/rate \(\$\/h\)/i)).not.toBeInTheDocument();
    });

    it('hides the average-rate summary card', () => {
      render(<ResourceList {...userProps} />);
      expect(screen.queryByText('Average Rate')).not.toBeInTheDocument();
      expect(screen.queryByText('Total Resources')).not.toBeInTheDocument();
    });

    it('allows adding a custom resource with only role filled (no Hourly cost input to require)', async () => {
      const user = userEvent.setup();
      const onAddResourceList = vi.fn();
      render(<ResourceList {...userProps} onAddResourceList={onAddResourceList} />);
      await user.type(screen.getByLabelText(/rate card role/i), 'Developer');
      const addButton = screen.getByRole('button', { name: /add/i });
      expect(addButton).not.toBeDisabled();
      await user.click(addButton);
      expect(onAddResourceList).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'Developer' })
      );
    });
  });
});
