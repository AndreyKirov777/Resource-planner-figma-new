import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectList } from './ProjectList';
import { api, Project } from '../services/api';
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
    status: 'active' as const,
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

function listProject(overrides: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    description: '',
    daysInFTE: 21,
    clientCurrency: 'EUR',
    exchangeRate: 0.89,
    planningMode: 'weekly',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const alpha = listProject({
  id: 1,
  name: 'Alpha',
  description: 'First proposal',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
});
const bravo = listProject({
  id: 2,
  name: 'Bravo',
  description: 'Live staffing plan',
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
});
const archivedOmega = listProject({
  id: 3,
  name: 'Omega',
  description: 'Closed Alpha work',
  status: 'archived',
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
});

function rowNames(): string[] {
  return screen.getAllByRole('row').slice(1).map((row) => {
    const firstCell = row.querySelector('td');
    return firstCell?.textContent?.replace(/Archived/g, '').trim() ?? '';
  });
}

async function chooseStatus(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('combobox', { name: /status/i }));
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('ProjectList sort, search, and status', () => {
  beforeEach(() => {
    vi.mocked(api.getProjects).mockResolvedValue([alpha, bravo, archivedOmega]);
    vi.mocked(api.updateProject).mockImplementation(async (id, data) => {
      const current = [alpha, bravo, archivedOmega].find((p) => p.id === id) ?? alpha;
      return { ...current, ...data };
    });
    vi.mocked(api.copyProject).mockResolvedValue(
      listProject({ id: 4, name: 'Omega (Copy)', status: 'active', updatedAt: '2026-06-01T00:00:00Z' })
    );
  });

  it('defaults to last-updated newest first and hides archived rows', async () => {
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');
    expect(rowNames()).toEqual(['Bravo', 'Alpha']);
    expect(screen.queryByText('Omega')).not.toBeInTheDocument();
  });

  it('toggles sort on Project name, then Created, then Last updated', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await user.click(screen.getByRole('button', { name: /project name/i }));
    expect(rowNames()).toEqual(['Alpha', 'Bravo']);
    await user.click(screen.getByRole('button', { name: /project name/i }));
    expect(rowNames()).toEqual(['Bravo', 'Alpha']);

    await user.click(screen.getByRole('button', { name: /^created$/i }));
    expect(rowNames()).toEqual(['Bravo', 'Alpha']);
    await user.click(screen.getByRole('button', { name: /^created$/i }));
    expect(rowNames()).toEqual(['Alpha', 'Bravo']);

    await user.click(screen.getByRole('button', { name: /last updated/i }));
    expect(rowNames()).toEqual(['Bravo', 'Alpha']);
  });

  it('searches name or description within the current status filter', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await user.type(screen.getByRole('textbox', { name: /search projects/i }), 'alpha');
    expect(rowNames()).toEqual(['Alpha']);
    expect(screen.queryByText('Omega')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: /search projects/i }));
    await user.type(screen.getByRole('textbox', { name: /search projects/i }), 'staffing');
    expect(rowNames()).toEqual(['Bravo']);
  });

  it('shows only archived rows without a name badge in the Archived filter', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await chooseStatus(user, 'Archived');
    expect(rowNames()).toEqual(['Omega']);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    const nameCell = screen.getByText('Omega').closest('td');
    expect(nameCell?.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it('marks archived rows with a badge only in the All view', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await chooseStatus(user, 'All');
    expect(rowNames()).toEqual(['Omega', 'Bravo', 'Alpha']);
    const omegaCell = screen.getByText('Omega').closest('td');
    expect(omegaCell?.querySelector('[data-slot="badge"]')?.textContent).toBe('Archived');
    const bravoCell = screen.getByText('Bravo').closest('td');
    expect(bravoCell?.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it('archives and restores via updateProject', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await user.click(screen.getAllByRole('button', { name: /^archive$/i })[0]);
    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalledWith(2, { status: 'archived' });
    });
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();

    await chooseStatus(user, 'Archived');
    const omegaRow = screen.getByText('Omega').closest('tr');
    if (!omegaRow) throw new Error('omega row not found');
    await user.click(within(omegaRow).getByRole('button', { name: /^restore$/i }));
    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalledWith(3, { status: 'active' });
    });
  });

  it('keeps a copy of an archived project out of the default Active view until it is the new active row', async () => {
    const user = userEvent.setup();
    render(<ProjectList onOpenProject={vi.fn()} />);
    await screen.findByText('Bravo');

    await chooseStatus(user, 'Archived');
    const archivedRow = screen.getByText('Omega').closest('tr');
    if (!archivedRow) throw new Error('archived row not found');
    await user.click(within(archivedRow).getByRole('button', { name: /^copy$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^copy$/i }));
    await waitFor(() => {
      expect(api.copyProject).toHaveBeenCalled();
    });

    await chooseStatus(user, 'Active');
    expect(rowNames()).toEqual(['Omega (Copy)', 'Bravo', 'Alpha']);
    expect(screen.queryByText('Omega')).not.toBeInTheDocument();
  });
});
