/** Application-wide default parameters for new projects */
export const APP_DEFAULTS: {
  daysInFTE: number;
  clientCurrency: string;
  exchangeRate: number;
  defaultMargin: number;
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
