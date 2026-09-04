import { APP_DEFAULTS } from '../src/config/defaults';

const FRANKFURTER_RATES_URL =
  'https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,GBP';
const FRANKFURTER_TIMEOUT_MS = 8000;

export type ExchangeRatesSource = 'frankfurter' | 'cache' | 'fallback';

export interface DailyExchangeRates {
  rates: { USD: number; EUR: number; GBP: number };
  date?: string;
  source: ExchangeRatesSource;
}

const FALLBACK_RATES = {
  USD: 1,
  EUR: APP_DEFAULTS.exchangeRate,
  GBP: 0.79,
} as const;

type FetchImpl = typeof fetch;

interface RatePair {
  date?: unknown;
  base?: unknown;
  quote?: unknown;
  rate?: unknown;
}

interface CachedRates {
  utcDate: string;
  rates: DailyExchangeRates['rates'];
  quoteDate?: string;
}

let cache: CachedRates | undefined;
let inflight: Promise<DailyExchangeRates> | undefined;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function fallbackResult(): DailyExchangeRates {
  return { rates: { ...FALLBACK_RATES }, source: 'fallback' };
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function collectPairs(payload: unknown): RatePair[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is RatePair => row !== null && typeof row === 'object');
  }
  if (payload !== null && typeof payload === 'object' && 'quote' in payload && 'rate' in payload) {
    return [payload as RatePair];
  }
  return [];
}

function parseLiveRates(payload: unknown): { rates: DailyExchangeRates['rates']; date?: string } | null {
  let eur: number | undefined;
  let gbp: number | undefined;
  let date: string | undefined;

  for (const row of collectPairs(payload)) {
    if (row.base !== undefined && row.base !== 'USD') continue;
    if (!isFinitePositive(row.rate)) continue;
    if (row.quote === 'EUR') eur = row.rate;
    if (row.quote === 'GBP') gbp = row.rate;
    if (typeof row.date === 'string' && row.date.length > 0) date = row.date;
  }

  if (eur === undefined || gbp === undefined) return null;
  return { rates: { USD: 1, EUR: eur, GBP: gbp }, date };
}

export function __resetExchangeRatesCache(): void {
  cache = undefined;
  inflight = undefined;
}

async function fetchLiveRates(fetchImpl: FetchImpl): Promise<DailyExchangeRates> {
  try {
    const response = await fetchImpl(FRANKFURTER_RATES_URL, {
      signal: AbortSignal.timeout(FRANKFURTER_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('Frankfurter exchange rates request failed:', response.status);
      return fallbackResult();
    }

    const payload: unknown = await response.json();
    const parsed = parseLiveRates(payload);
    if (!parsed) {
      console.error('Frankfurter exchange rates payload missing EUR or GBP');
      return fallbackResult();
    }

    const today = utcToday();
    cache = { utcDate: today, rates: parsed.rates, quoteDate: parsed.date };
    return { rates: { ...parsed.rates }, date: parsed.date, source: 'frankfurter' };
  } catch (error) {
    console.error('Frankfurter exchange rates fetch failed:', error);
    return fallbackResult();
  }
}

export async function getDailyExchangeRates(fetchImpl: FetchImpl = fetch): Promise<DailyExchangeRates> {
  const today = utcToday();
  if (cache && cache.utcDate === today) {
    return {
      rates: { ...cache.rates },
      date: cache.quoteDate,
      source: 'cache',
    };
  }

  if (!inflight) {
    inflight = fetchLiveRates(fetchImpl).finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}
