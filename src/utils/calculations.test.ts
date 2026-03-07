import { describe, it, expect } from 'vitest';
import {
  clientHourlyRate,
  totalInternalCost,
  totalClientCost,
  grossMarginPct,
  marginPct,
  estimatedEffortHours,
  fteEffort,
} from './calculations';

describe('calculations', () => {
  describe('clientHourlyRate', () => {
    it('computes client rate from internal rate, margin, and exchange rate', () => {
      // 50 / (1 - 0.25) * 1 = 66.67
      expect(clientHourlyRate(50, 0.25, 1)).toBeCloseTo(66.67, 2);
    });

    it('applies exchange rate for client currency', () => {
      const inUSD = 50 / (1 - 0.25);
      expect(clientHourlyRate(50, 0.25, 0.89)).toBeCloseTo(inUSD * 0.89, 2);
    });

    it('returns 0 when margin >= 1', () => {
      expect(clientHourlyRate(50, 1, 1)).toBe(0);
      expect(clientHourlyRate(50, 1.5, 1)).toBe(0);
    });

    it('returns 0 when exchange rate is non-finite', () => {
      expect(clientHourlyRate(50, 0.25, NaN)).toBe(0);
      expect(clientHourlyRate(50, 0.25, Infinity)).toBe(0);
    });

    it('returns 0 when internal rate is non-finite', () => {
      expect(clientHourlyRate(NaN, 0.25, 1)).toBe(0);
    });
  });

  describe('totalInternalCost', () => {
    it('returns hours * rate', () => {
      expect(totalInternalCost(40, 50)).toBe(2000);
      expect(totalInternalCost(100, 25)).toBe(2500);
    });
  });

  describe('totalClientCost', () => {
    it('returns hours * client rate', () => {
      expect(totalClientCost(40, 66.67)).toBeCloseTo(2666.8, 2);
    });
  });

  describe('grossMarginPct', () => {
    it('computes margin from totals and exchange rate', () => {
      // totalIntCost=2000 USD, totalClient=2666.8, exchange 1 -> margin (2666.8-2000)/2666.8*100
      const pct = grossMarginPct(2000, 2666.8, 1);
      expect(pct).toBeCloseTo(25, 1);
    });

    it('returns 0 when client cost is 0', () => {
      expect(grossMarginPct(100, 0, 1)).toBe(0);
    });

    it('returns 0 when client cost is negative or non-finite', () => {
      expect(grossMarginPct(100, -1, 1)).toBe(0);
      expect(grossMarginPct(100, NaN, 1)).toBe(0);
    });
  });

  describe('marginPct', () => {
    it('computes margin from rates and exchange rate', () => {
      const pct = marginPct(66.67, 50, 1);
      expect(pct).toBeCloseTo(25, 1);
    });

    it('returns null when client rate is 0 or invalid', () => {
      expect(marginPct(0, 50, 1)).toBeNull();
      expect(marginPct(-1, 50, 1)).toBeNull();
    });
  });

  describe('estimatedEffortHours', () => {
    it('returns totalWeeksEquivalent * hoursPerWeek', () => {
      expect(estimatedEffortHours(1, 40)).toBe(40);
      expect(estimatedEffortHours(2.5, 40)).toBe(100);
    });

    it('defaults to 40 hours per week', () => {
      expect(estimatedEffortHours(1)).toBe(40);
    });
  });

  describe('fteEffort', () => {
    it('returns totalHours / hoursPerDay', () => {
      expect(fteEffort(40, 8)).toBe(5);
      expect(fteEffort(80, 8)).toBe(10);
    });

    it('defaults to 8 hours per day', () => {
      expect(fteEffort(40)).toBe(5);
    });

    it('returns 0 when hoursPerDay is 0', () => {
      expect(fteEffort(40, 0)).toBe(0);
    });
  });
});
