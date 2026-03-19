/** Application-wide default parameters for new projects */
export const APP_DEFAULTS: {
  daysInFTE: number;
  clientCurrency: string;
  exchangeRate: number;
  defaultMargin: number;
  planningMode: 'weekly' | 'monthly';
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
};

/** Supported client currencies */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'UAH'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
