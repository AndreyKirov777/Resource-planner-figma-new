import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceList } from './ResourceList';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid">Grid</div>,
}));

const defaultProps = {
  resourceLists: [],
  onResourceListsChange: vi.fn(),
  onResourceListUpdate: vi.fn(),
  onAddResourceList: vi.fn(),
  onDeleteResourceList: vi.fn(),
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
  });
});
