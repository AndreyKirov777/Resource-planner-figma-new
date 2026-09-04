import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_DEFAULTS } from '../src/config/defaults';
import { __resetExchangeRatesCache, getDailyExchangeRates } from './exchangeRates';

const LIVE_ROWS = [
  { date: '2026-09-04', base: 'USD', quote: 'EUR', rate: 0.85 },
  { date: '2026-09-04', base: 'USD', quote: 'GBP', rate: 0.74 },
];

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  __resetExchangeRatesCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getDailyExchangeRates', () => {
  it('fetches Frankfurter once on a cache miss and returns live EUR/GBP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(LIVE_ROWS));

    const result = await getDailyExchangeRates(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('api.frankfurter.dev/v2/rates');
    expect(result).toEqual({
      rates: { USD: 1, EUR: 0.85, GBP: 0.74 },
      date: '2026-09-04',
      source: 'frankfurter',
    });
  });

  it('returns the in-memory cache on a same-UTC-day repeat without calling Frankfurter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(LIVE_ROWS));

    const first = await getDailyExchangeRates(fetchImpl);
    const second = await getDailyExchangeRates(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cache');
    expect(second.rates).toEqual(first.rates);
    expect(second.date).toBe(first.date);
  });

  it('refetches when the UTC calendar day changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'));

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(LIVE_ROWS))
      .mockResolvedValueOnce(jsonResponse([
        { date: '2026-09-05', base: 'USD', quote: 'EUR', rate: 0.86 },
        { date: '2026-09-05', base: 'USD', quote: 'GBP', rate: 0.75 },
      ]));

    const first = await getDailyExchangeRates(fetchImpl);
    expect(first.rates).toEqual({ USD: 1, EUR: 0.85, GBP: 0.74 });

    vi.setSystemTime(new Date('2026-09-05T00:00:01.000Z'));
    const second = await getDailyExchangeRates(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual({
      rates: { USD: 1, EUR: 0.86, GBP: 0.75 },
      date: '2026-09-05',
      source: 'frankfurter',
    });
  });

  it('serves the static table with source fallback when Frankfurter is down', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await getDailyExchangeRates(fetchImpl);

    expect(result).toEqual({
      rates: { USD: 1, EUR: APP_DEFAULTS.exchangeRate, GBP: 0.79 },
      source: 'fallback',
    });
  });

  it('serves the static table when Frankfurter returns a non-OK status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'unavailable' }, false, 503));

    const result = await getDailyExchangeRates(fetchImpl);

    expect(result).toEqual({
      rates: { USD: 1, EUR: 0.89, GBP: 0.79 },
      source: 'fallback',
    });
  });

  it('does not cache a partial live map when EUR or GBP is missing', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        { date: '2026-09-04', base: 'USD', quote: 'EUR', rate: 0.85 },
      ]))
      .mockResolvedValueOnce(jsonResponse(LIVE_ROWS));

    const first = await getDailyExchangeRates(fetchImpl);
    expect(first).toEqual({
      rates: { USD: 1, EUR: 0.89, GBP: 0.79 },
      source: 'fallback',
    });

    const second = await getDailyExchangeRates(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second.source).toBe('frankfurter');
    expect(second.rates).toEqual({ USD: 1, EUR: 0.85, GBP: 0.74 });
  });

  it('ignores pairs whose base is not USD', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([
      { date: '2026-09-04', base: 'EUR', quote: 'EUR', rate: 1 },
      { date: '2026-09-04', base: 'EUR', quote: 'GBP', rate: 0.86 },
    ]));

    const result = await getDailyExchangeRates(fetchImpl);
    expect(result).toEqual({
      rates: { USD: 1, EUR: 0.89, GBP: 0.79 },
      source: 'fallback',
    });
  });

  it('does not cache a non-finite or non-positive rate', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        { date: '2026-09-04', base: 'USD', quote: 'EUR', rate: 0.85 },
        { date: '2026-09-04', base: 'USD', quote: 'GBP', rate: 0 },
      ]))
      .mockResolvedValueOnce(jsonResponse(LIVE_ROWS));

    const first = await getDailyExchangeRates(fetchImpl);
    expect(first.source).toBe('fallback');

    const second = await getDailyExchangeRates(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second.source).toBe('frankfurter');
  });
});
