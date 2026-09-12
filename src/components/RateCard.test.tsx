import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RateCard, resourceFromRateCard } from './RateCard';
import { clientHourlyRate } from '../utils/calculations';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid">Grid</div>,
}));

const defaultProps = {
  projectId: 1,
  rateCards: [{ id: 1, role: 'Dev', namingInPM: 'Middle', discipline: 'Eng', ukraine: 50, easternEurope: 55, asiaGE: 60, asiaARMKZ: 58, latam: 70, mexico: 65, india: 40, newYork: 120, london: 110, projectId: 1, createdAt: '', updatedAt: '' }],
  onRateCardsChange: vi.fn(),
  onRateCardUpdate: vi.fn(),
  onAddRateCard: vi.fn(),
  onAddRateCardsBulk: vi.fn().mockResolvedValue({ message: 'OK', count: 0 }),
  onDeleteRateCard: vi.fn(),
  onDeleteAllRateCards: vi.fn(),
};

describe('RateCard', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders Import rate card and Clear All buttons', () => {
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

  it('shows Default Margin after Discipline from props', () => {
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

  it('seeds hourlyRate from Price for Ukraine / 45 / FX 1', () => {
    const seeded = resourceFromRateCard(defaultProps.rateCards[0], 'ukraine', 45, 1);
    expect(seeded.intRate).toBe(50);
    expect(seeded.hourlyRate).toBe(clientHourlyRate(50, 0.45, 1));
  });
});
