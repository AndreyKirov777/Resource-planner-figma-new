import { describe, it, expect } from 'vitest';
import { APP_DEFAULTS, exchangeRateForCurrency } from './defaults';

describe('exchangeRateForCurrency', () => {
  it('returns 0.89 for EUR, matching APP_DEFAULTS.exchangeRate', () => {
    expect(exchangeRateForCurrency('EUR')).toBe(0.89);
    expect(exchangeRateForCurrency('EUR')).toBe(APP_DEFAULTS.exchangeRate);
  });

  it('returns 1 for USD', () => {
    expect(exchangeRateForCurrency('USD')).toBe(1);
  });

  it('returns 0.79 for GBP', () => {
    expect(exchangeRateForCurrency('GBP')).toBe(0.79);
  });

  it('returns APP_DEFAULTS.exchangeRate for an unknown code', () => {
    expect(exchangeRateForCurrency('CHF')).toBe(APP_DEFAULTS.exchangeRate);
    expect(exchangeRateForCurrency('CHF')).toBe(0.89);
  });

  it('returns APP_DEFAULTS.exchangeRate for an empty code', () => {
    expect(exchangeRateForCurrency('')).toBe(APP_DEFAULTS.exchangeRate);
  });
});
