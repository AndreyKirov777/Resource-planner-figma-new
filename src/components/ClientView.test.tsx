import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  buildClientPngExport,
  downloadClientViewPng,
} from '../utils/clientViewPng';
import { api } from '../services/api';
import ClientView from './ClientView';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return { ...actual, api: { getShare: vi.fn() } };
});

vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    default: () => <div data-testid="glide-grid">Grid</div>,
  };
});

/** Labels/fragments that must never appear in a client-safe PNG. */
const CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS = ['int.', 'internal', 'margin', 'rate card'] as const;

const baseInput = {
  projectName: 'Acme',
  clientCurrency: 'USD',
  planningMode: 'weekly' as const,
  daysInFTE: 20,
  now: new Date('2026-08-11T12:00:00.000Z'),
  phases: [{ name: 'Discovery', periodCount: 2 }],
  resourcePlans: [
    {
      clientRole: 'Engineer',
      name: 'Alex',
      clientHourlyRate: 100,
      allocations: [
        { periodNumber: 1, allocation: 50 },
        { periodNumber: 2, allocation: 100 },
      ],
    },
  ],
};

describe('Client View PNG export', () => {
  it('returns empty error when there are no resource plans', () => {
    const result = buildClientPngExport({ ...baseInput, resourcePlans: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty');
  });

  it('builds a .png filename and client-safe column labels on happy path', () => {
    const result = buildClientPngExport(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.model.filename).toBe('resource-plan-Acme-2026-08-11.png');
    const labels = result.model.columns.map((c) => c.label);
    expect(labels).toContain('Role');
    expect(labels).toContain('Name');
    expect(labels.some((l) => l.includes('Hourly Rate'))).toBe(true);
    expect(labels.some((l) => l.includes('Daily Rate'))).toBe(true);
    expect(labels).toContain('Week 1 (%)');
    expect(labels).toContain('Week 2 (%)');
    expect(labels.some((l) => l.includes('Total Price'))).toBe(true);
    expect(labels.some((l) => l.includes('Estimated Efforts'))).toBe(true);

    const joined = labels.join(' ').toLowerCase();
    for (const frag of CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS) {
      expect(joined).not.toContain(frag);
    }

    const summaryBits = [
      'Total Price',
      'Total Estimated Efforts',
      result.model.totals.durationLabel,
      'Blended Hourly Rate',
      'Blended Daily Rate',
      ...result.model.phaseBreakdown.map((p) => p.name),
    ]
      .join(' ')
      .toLowerCase();
    for (const frag of CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS) {
      expect(summaryBits).not.toContain(frag);
    }
  });

  it('omits period columns when phases total zero periods', () => {
    const result = buildClientPngExport({
      ...baseInput,
      phases: [{ name: 'Empty', periodCount: 0 }],
      resourcePlans: [
        {
          clientRole: 'PM',
          name: 'Sam',
          clientHourlyRate: 120,
          allocations: [],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const labels = result.model.columns.map((c) => c.label);
    expect(labels.some((l) => /Week|Month/.test(l))).toBe(false);
    expect(labels[0]).toBe('Role');
    expect(labels.some((l) => l.includes('Total Price'))).toBe(true);
  });

  it('uses € for EUR and £ for GBP on money labels', () => {
    const eur = buildClientPngExport({ ...baseInput, clientCurrency: 'EUR' });
    expect(eur.ok).toBe(true);
    if (eur.ok) {
      expect(eur.model.currencySymbol).toBe('€');
      expect(eur.model.columns.some((c) => c.label.includes('€'))).toBe(true);
    }

    const gbp = buildClientPngExport({ ...baseInput, clientCurrency: 'GBP' });
    expect(gbp.ok).toBe(true);
    if (gbp.ok) {
      expect(gbp.model.currencySymbol).toBe('£');
      expect(gbp.model.columns.some((c) => c.label.includes('£'))).toBe(true);
    }
  });

  describe('downloadClientViewPng', () => {
    const originalCreateElement = document.createElement.bind(document);
    let clickCount = 0;
    let capturedDownload: string | null;

    beforeEach(() => {
      clickCount = 0;
      capturedDownload = null;
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
          vi.spyOn(canvas, 'getContext').mockReturnValue({
            scale: vi.fn(),
            fillRect: vi.fn(),
            fillText: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
            arcTo: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn(),
          } as unknown as CanvasRenderingContext2D);
          vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');
          return canvas;
        }
        if (tag === 'a') {
          const a = originalCreateElement('a') as HTMLAnchorElement;
          Object.defineProperty(a, 'click', {
            value: () => {
              capturedDownload = a.download;
              clickCount += 1;
            },
          });
          return a;
        }
        return originalCreateElement(tag);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('triggers a download with the .png filename and does not run for empty build', () => {
      const empty = buildClientPngExport({ ...baseInput, resourcePlans: [] });
      expect(empty.ok).toBe(false);

      const built = buildClientPngExport(baseInput);
      expect(built.ok).toBe(true);
      if (!built.ok) return;

      downloadClientViewPng(built.model);
      expect(clickCount).toBe(1);
      expect(capturedDownload).toBe('resource-plan-Acme-2026-08-11.png');
    });

    it('sanitizes unsafe characters in the project name used for the filename', () => {
      const built = buildClientPngExport({
        ...baseInput,
        projectName: 'Acme/Q3:Plan*',
      });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.model.filename).toBe('resource-plan-Acme_Q3_Plan_-2026-08-11.png');
    });
  });
});

describe('ClientView component (route /client/:token)', () => {
  beforeEach(() => {
    vi.mocked(api.getShare).mockReset();
  });

  const sharedProject = {
    name: 'Acme Rollout',
    description: 'Q3 plan',
    daysInFTE: 20,
    clientCurrency: 'USD',
    planningMode: 'weekly',
    phases: JSON.stringify([{ name: 'Phase 1', periodCount: 2 }]),
    resourceLists: [],
    resourcePlans: [
      {
        id: 1,
        role: 'Dev',
        clientRole: 'Engineer',
        name: 'Alex',
        clientHourlyRate: 100,
        displayOrder: 0,
        allocations: [
          { periodNumber: 1, allocation: 50 },
          { periodNumber: 2, allocation: 100 },
        ],
      },
    ],
  };

  const renderAt = (token: string) =>
    render(
      <MemoryRouter initialEntries={[`/client/${token}`]}>
        <Routes>
          <Route path="/client/:token" element={<ClientView />} />
        </Routes>
      </MemoryRouter>
    );

  it('loads via api.getShare(token) and renders the shared project', async () => {
    vi.mocked(api.getShare).mockResolvedValue(sharedProject as never);

    renderAt('valid-token-abc');

    await waitFor(() => {
      expect(api.getShare).toHaveBeenCalledWith('valid-token-abc');
    });
    await waitFor(() => {
      expect(screen.getByText('Acme Rollout')).toBeInTheDocument();
    });
  });

  it('shows "This link is no longer valid" when the token 404s', async () => {
    vi.mocked(api.getShare).mockRejectedValue(new Error('This link is no longer valid'));

    renderAt('expired-or-unknown-token');

    await waitFor(() => {
      expect(screen.getByText('This link is no longer valid')).toBeInTheDocument();
    });
  });
});
