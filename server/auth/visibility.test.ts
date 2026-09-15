import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { INTERNAL_KEYS, omitDeep, userFilterMiddleware } from './visibility';

describe('INTERNAL_KEYS', () => {
  it('pins the exact set of internal fields', () => {
    expect([...INTERNAL_KEYS].sort()).toEqual(
      [
        'intRate',
        'intHourlyRate',
        'defaultMargin',
        'exchangeRate',
        'ukraine',
        'easternEurope',
        'asiaGE',
        'asiaARMKZ',
        'latam',
        'mexico',
        'india',
        'newYork',
        'london',
      ].sort()
    );
  });
});

describe('omitDeep', () => {
  it('strips internal keys from a nested project payload', () => {
    const project = {
      id: 1,
      name: 'Acme',
      defaultMargin: 45,
      exchangeRate: 0.89,
      resourceLists: [
        { id: 1, role: 'Dev', intRate: 30, hourlyRate: 60, location: 'ukraine' },
      ],
      resourcePlans: [
        {
          id: 1,
          role: 'Dev',
          intHourlyRate: 30,
          clientHourlyRate: 60,
          allocations: [{ id: 1, periodNumber: 1, allocation: 100 }],
        },
      ],
    };

    expect(omitDeep(project)).toEqual({
      id: 1,
      name: 'Acme',
      resourceLists: [{ id: 1, role: 'Dev', hourlyRate: 60, location: 'ukraine' }],
      resourcePlans: [
        {
          id: 1,
          role: 'Dev',
          clientHourlyRate: 60,
          allocations: [{ id: 1, periodNumber: 1, allocation: 100 }],
        },
      ],
    });
  });

  it('strips internal keys inside a top-level array', () => {
    const rateCards = [
      { id: 1, role: 'Dev', ukraine: 30, newYork: 80 },
      { id: 2, role: 'QA', ukraine: 20, newYork: 60 },
    ];
    expect(omitDeep(rateCards)).toEqual([
      { id: 1, role: 'Dev' },
      { id: 2, role: 'QA' },
    ]);
  });

  it('leaves every non-internal key untouched, including falsy values', () => {
    const value = { id: 0, name: '', active: false, note: null, tags: [] };
    expect(omitDeep(value)).toEqual(value);
  });

  it('passes primitives and null through unchanged', () => {
    expect(omitDeep(null)).toBeNull();
    expect(omitDeep(42)).toBe(42);
    expect(omitDeep('x')).toBe('x');
    expect(omitDeep(undefined)).toBeUndefined();
  });
});

function mockRes() {
  const json = vi.fn();
  return { json } as unknown as Response;
}

describe('userFilterMiddleware', () => {
  it('strips internal keys from a USER response body', () => {
    const req = { user: { group: 'USER' }, body: {} } as unknown as Request;
    const res = mockRes();
    const originalJsonMock = res.json as unknown as ReturnType<typeof vi.fn>;
    const next = vi.fn();

    userFilterMiddleware(req, res, next);
    res.json({ id: 1, intRate: 30, role: 'Dev' });

    expect(originalJsonMock).toHaveBeenCalledWith({ id: 1, role: 'Dev' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('strips internal keys from a USER request body before the handler sees it', () => {
    const req = {
      user: { group: 'USER' },
      body: { intHourlyRate: 80, role: 'Dev' },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    userFilterMiddleware(req, res, next);

    expect(req.body).toEqual({ role: 'Dev' });
  });

  it('passes MANAGER and ADMIN through untouched', () => {
    for (const group of ['MANAGER', 'ADMIN']) {
      const req = { user: { group }, body: { intRate: 30 } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn();
      const originalJson = res.json;

      userFilterMiddleware(req, res, next);

      expect(res.json).toBe(originalJson);
      expect(req.body).toEqual({ intRate: 30 });
      expect(next).toHaveBeenCalledOnce();
    }
  });
});
