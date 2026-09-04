import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_DEFAULTS,
  __resetLiveExchangeRates,
  exchangeRateForCurrency,
  setLiveExchangeRates,
} from './defaults';

afterEach(() => {
  __resetLiveExchangeRates();
});

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

  it('prefers the live overlay when it is set', () => {
    setLiveExchangeRates({ EUR: 0.85, USD: 1, GBP: 0.74 });
    expect(exchangeRateForCurrency('EUR')).toBe(0.85);
    expect(exchangeRateForCurrency('USD')).toBe(1);
    expect(exchangeRateForCurrency('GBP')).toBe(0.74);
    expect(exchangeRateForCurrency('CHF')).toBe(APP_DEFAULTS.exchangeRate);
  });

  it('rounds a live overlay rate to two decimal places', () => {
    setLiveExchangeRates({ EUR: 0.86105, USD: 1, GBP: 0.74022 });
    expect(exchangeRateForCurrency('EUR')).toBe(0.86);
    expect(exchangeRateForCurrency('GBP')).toBe(0.74);
  });

  it('restores the static table after the overlay is reset', () => {
    setLiveExchangeRates({ EUR: 0.85, USD: 1, GBP: 0.74 });
    __resetLiveExchangeRates();
    expect(exchangeRateForCurrency('EUR')).toBe(0.89);
    expect(exchangeRateForCurrency('USD')).toBe(1);
    expect(exchangeRateForCurrency('GBP')).toBe(0.79);
    expect(exchangeRateForCurrency('CHF')).toBe(0.89);
  });
});
