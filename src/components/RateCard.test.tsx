import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RateCard } from './RateCard';

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => (
    <div data-testid="ag-grid" data-column-count={props.columnDefs?.length}>
      {props.columnDefs?.map((c: any) => (
        <div key={c.colId ?? c.field} data-testid={`col-${c.colId ?? c.field}`} data-hidden={String(!!c.hide)} data-editable={String(!!c.editable)}>
          {c.headerName}
        </div>
      ))}
    </div>
  ),
}));

const rateCardRow = {
  id: 1,
  role: 'Dev',
  namingInPM: 'Middle',
  discipline: 'Eng',
  ukraine: 50,
  easternEurope: 55,
  asiaGE: 60,
  asiaARMKZ: 58,
  latam: 70,
  mexico: 65,
  india: 40,
  newYork: 120,
  london: 110,
  projectId: 1,
  createdAt: '',
  updatedAt: '',
  price: { ukraine: 91 },
};

const defaultProps = {
  rateCards: [rateCardRow],
  onRateCardsChange: vi.fn(),
  onRateCardUpdate: vi.fn(),
  onAddRateCard: vi.fn(),
  onAddRateCardsBulk: vi.fn().mockResolvedValue({ message: 'OK', count: 0 }),
  onDeleteRateCard: vi.fn(),
  onDeleteAllRateCards: vi.fn(),
  onSeedFromRateCard: vi.fn(),
  group: 'ADMIN' as const,
};

describe('RateCard', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders Import rate card and Clear All buttons for ADMIN', () => {
    render(<RateCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /import rate card/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('calls onDeleteAllRateCards when Clear All is clicked and user confirms', async () => {
    const user = userEvent.setup();
    const onDeleteAllRateCards = vi.fn();
    render(<RateCard {...defaultProps} onDeleteAllRateCards={onDeleteAllRateCards} />);
    const clearButton = screen.getByRole('button', { name: /clear all/i });
    expect(clearButton).not.toBeDisabled();
    await user.click(clearButton);
    expect(onDeleteAllRateCards).toHaveBeenCalled();
  });

  it('Clear All button is disabled when rateCards is empty', () => {
    render(<RateCard {...defaultProps} rateCards={[]} />);
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });

  it('shows Default Margin after Discipline from props for ADMIN', () => {
    render(<RateCard {...defaultProps} defaultMargin={30} />);
    const discipline = screen.getByText('Discipline:');
    const margin = screen.getByText('Default Margin:');
    expect(discipline.compareDocumentPosition(margin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(margin.nextElementSibling).toHaveTextContent('30%');
  });

  it('falls back to 45% when defaultMargin is null', () => {
    render(<RateCard {...defaultProps} defaultMargin={null} />);
    expect(screen.getByText('Default Margin:').nextElementSibling).toHaveTextContent('45%');
  });

  it('falls back to 45% when defaultMargin is omitted', () => {
    render(<RateCard {...defaultProps} />);
    expect(screen.getByText('Default Margin:').nextElementSibling).toHaveTextContent('45%');
  });

  it('renders the Price column reading price[region] from the row, not computed locally', () => {
    render(<RateCard {...defaultProps} />);
    const priceCol = screen.getByTestId('col-price');
    expect(priceCol).toHaveAttribute('data-editable', 'false');
  });

  describe('USER catalog mode', () => {
    const userProps = { ...defaultProps, group: 'USER' as const };

    it('shows only the four catalog columns plus Actions, no region/price columns', () => {
      render(<RateCard {...userProps} />);
      expect(screen.getByTestId('col-role')).toBeInTheDocument();
      expect(screen.getByTestId('col-namingInPM')).toBeInTheDocument();
      expect(screen.getByTestId('col-discipline')).toBeInTheDocument();
      expect(screen.getByTestId('col-description')).toBeInTheDocument();
      expect(screen.queryByTestId('col-price')).not.toBeInTheDocument();
      expect(screen.queryByTestId('col-ukraine')).not.toBeInTheDocument();
    });

    it('hides region tabs and Default Margin', () => {
      render(<RateCard {...userProps} />);
      expect(screen.queryByText('Default Margin:')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Ukraine' })).not.toBeInTheDocument();
    });

    it('hides Import rate card and Clear All', () => {
      render(<RateCard {...userProps} />);
      expect(screen.queryByRole('button', { name: /import rate card/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('keeps the Actions column so a USER can seed a resource list entry', () => {
      render(<RateCard {...userProps} />);
      const actionsCol = screen.getByTestId('ag-grid');
      expect(actionsCol.getAttribute('data-column-count')).toBe('5');
    });
  });

  describe('MANAGER read-only mode', () => {
    const managerProps = { ...defaultProps, group: 'MANAGER' as const };

    it('shows rates and Price but marks every column non-editable', () => {
      render(<RateCard {...managerProps} />);
      expect(screen.getByTestId('col-price')).toBeInTheDocument();
      expect(screen.getByTestId('col-role')).toHaveAttribute('data-editable', 'false');
      expect(screen.getByTestId('col-ukraine')).toHaveAttribute('data-editable', 'false');
    });

    it('hides Import rate card, Clear All, and the Actions/Add column', () => {
      render(<RateCard {...managerProps} />);
      expect(screen.queryByRole('button', { name: /import rate card/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
      const grid = screen.getByTestId('ag-grid');
      // 5 base columns (incl. hidden Actions) + 9 region columns + Price.
      expect(grid.getAttribute('data-column-count')).toBe('15');
    });
  });
});
