/** Application-wide default parameters for new projects */
export const APP_DEFAULTS: {
  daysInFTE: number;
  clientCurrency: string;
  exchangeRate: number;
  defaultMargin: number;
  investment: number;
  planningMode: 'weekly' | 'monthly';
  defaultLocation: string;
  durationPeriods: number;
} = {
  /** Number of working days in one FTE per month */
  daysInFTE: 21,
  /** Default client billing currency */
  clientCurrency: 'EUR',
  /** EUR to USD exchange rate */
  exchangeRate: 0.89,
  /** Default margin percentage applied to client rates */
  defaultMargin: 45,
  /** Deal investment / discount amount in client currency */
  investment: 0,
  /** Default planning granularity */
  planningMode: 'weekly',
  /** Default rate card region tab slug */
  defaultLocation: 'ukraine',
  /** Default number of planning periods (weeks or months) */
  durationPeriods: 8,
};

/** Rate card region locations (slug matches RateCard tab keys) */
export const LOCATIONS = [
  { slug: 'ukraine', label: 'Ukraine' },
  { slug: 'eastern-europe', label: 'Eastern Europe' },
  { slug: 'asia-ge', label: 'Asia (GE)' },
  { slug: 'asia-arm-kz', label: 'Asia (ARM,KZ)' },
  { slug: 'latam', label: 'LATAM' },
  { slug: 'mexico', label: 'Mexico' },
  { slug: 'india', label: 'India' },
  { slug: 'new-york', label: 'New York' },
  { slug: 'london', label: 'London' },
] as const;

export type LocationSlug = (typeof LOCATIONS)[number]['slug'];

/** Supported client currencies */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'UAH'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Default client-currency-per-USD rates. EUR must stay equal to APP_DEFAULTS.exchangeRate. */
const EXCHANGE_RATE_BY_CURRENCY: Record<string, number> = {
  EUR: APP_DEFAULTS.exchangeRate,
  USD: 1,
  GBP: 0.79,
};

let liveExchangeRates: Record<string, number> | undefined;

/** Overlay today's live FX onto `exchangeRateForCurrency`. */
export function setLiveExchangeRates(rates: Record<string, number>): void {
  liveExchangeRates = rates;
}

/** Test-only: clear the live overlay so lookups use the static table again. */
export function __resetLiveExchangeRates(): void {
  liveExchangeRates = undefined;
}

function roundExchangeRate(rate: number): number {
  return Number(rate.toFixed(2));
}

/** Default FX for a client currency; unknown or empty codes use APP_DEFAULTS.exchangeRate. */
export function exchangeRateForCurrency(code: string): number {
  if (liveExchangeRates && Object.prototype.hasOwnProperty.call(liveExchangeRates, code)) {
    return roundExchangeRate(liveExchangeRates[code]);
  }
  return EXCHANGE_RATE_BY_CURRENCY[code] ?? APP_DEFAULTS.exchangeRate;
}
