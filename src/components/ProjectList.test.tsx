import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectList } from './ProjectList';
import { api } from '../services/api';
import { __resetLiveExchangeRates, exchangeRateForCurrency } from '../config/defaults';

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

vi.mock('../services/api', () => ({
  api: {
    getProjects: vi.fn(),
    createProject: vi.fn(),
    getExchangeRates: vi.fn(),
    deleteProject: vi.fn(),
    copyProject: vi.fn(),
    updateProject: vi.fn(),
  },
}));

function currencyTrigger(): HTMLElement {
  const field = screen.getByText('Client currency').closest('div');
  const trigger = field?.querySelector('[role="combobox"]');
  if (!trigger) throw new Error('Client currency select not found');
  return trigger as HTMLElement;
}

beforeEach(() => {
  __resetLiveExchangeRates();
  vi.mocked(api.getProjects).mockResolvedValue([]);
  vi.mocked(api.getExchangeRates).mockResolvedValue({
    rates: { USD: 1, EUR: 0.85, GBP: 0.74 },
    date: '2026-09-04',
    source: 'frankfurter',
  });
  vi.mocked(api.createProject).mockImplementation(async (data) => ({
    id: 2,
    name: 'New project',
    description: '',
    daysInFTE: 21,
    clientCurrency: 'EUR',
    exchangeRate: 0.89,
    planningMode: 'weekly',
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
    ...data,
  }));
});

afterEach(() => {
  __resetLiveExchangeRates();
});

async function openCreateDialog() {
  const user = userEvent.setup();
  render(<ProjectList onOpenProject={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: /new project/i }));
  await screen.findByRole('button', { name: /^create$/i });
  return user;
}

describe('ProjectList create-project FX', () => {
  it('pairs create currency with the live overlay rate', async () => {
    const user = await openCreateDialog();
    await waitFor(() => expect(api.getExchangeRates).toHaveBeenCalled());
    await waitFor(() => {
      expect(exchangeRateForCurrency('GBP')).toBe(0.74);
    });

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'GBP' }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clientCurrency: 'GBP',
          exchangeRate: 0.74,
        })
      );
    });
  });

  it('uses the static USD rate when the overlay is unset', async () => {
    vi.mocked(api.getExchangeRates).mockRejectedValue(new Error('rates down'));
    const user = await openCreateDialog();

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clientCurrency: 'USD',
          exchangeRate: 1,
        })
      );
    });
  });

  it('uses APP_DEFAULTS.exchangeRate for an unknown create currency', async () => {
    vi.mocked(api.getExchangeRates).mockRejectedValue(new Error('rates down'));
    const user = await openCreateDialog();

    await user.click(currencyTrigger());
    await user.click(await screen.findByRole('option', { name: 'CHF' }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clientCurrency: 'CHF',
          exchangeRate: 0.89,
        })
      );
    });
  });

  it('does not disable Create when getExchangeRates rejects', async () => {
    vi.mocked(api.getExchangeRates).mockRejectedValue(new Error('rates down'));
    await openCreateDialog();

    expect(screen.getByRole('button', { name: /^create$/i })).not.toBeDisabled();
  });
});
