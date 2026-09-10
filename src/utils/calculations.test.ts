import { describe, it, expect } from 'vitest';
import {
  clientHourlyRate,
  totalInternalCost,
  totalClientCost,
  grossMarginPct,
  marginPct,
  hoursPerPeriod,
  estimatedEffortHours,
  buildPlanFinancials,
} from './calculations';
import type { ResourcePlan } from '../services/api';

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

  describe('hoursPerPeriod', () => {
    it('stays fixed at 40h for weekly regardless of daysInFTE', () => {
      expect(hoursPerPeriod('weekly', 20)).toBe(40);
      expect(hoursPerPeriod('weekly', 21)).toBe(40);
      expect(hoursPerPeriod('weekly', 5)).toBe(40);
    });

    it('scales with daysInFTE for monthly', () => {
      expect(hoursPerPeriod('monthly', 20)).toBe(160);
      expect(hoursPerPeriod('monthly', 21)).toBe(168);
    });
  });

  describe('estimatedEffortHours', () => {
    it('returns totalWeeksEquivalent * hoursPerWeek', () => {
      expect(estimatedEffortHours(1, 40)).toBe(40);
      expect(estimatedEffortHours(2.5, 40)).toBe(100);
    });
  });

  describe('buildPlanFinancials', () => {
    // Fixture: real allocations from a live project (11 resource plans across a
    // 4-phase, 12-week timeline), captured before the App.tsx/ResourcePlan.tsx/
    // ClientView.tsx duplicate calculation loops were consolidated into this
    // function. Expected values below are independently computed from the
    // pre-refactor formulas against this exact data — a regression anchor, not
    // a hand-picked toy example.
    function plan(id: number, intHourlyRate: number, clientHourlyRate: number, allocations: number[]): ResourcePlan {
      return {
        id,
        role: `role-${id}`,
        intHourlyRate,
        clientHourlyRate,
        displayOrder: 0,
        projectId: 9,
        createdAt: '',
        updatedAt: '',
        allocations: allocations.map((allocation, i) => ({
          id: id * 100 + i,
          periodNumber: i + 1,
          allocation,
          resourcePlanId: id,
          createdAt: '',
          updatedAt: '',
        })),
      };
    }

    const phases = [
      { name: 'Discovery', periodCount: 2 },
      { name: 'Implementation', periodCount: 8 },
      { name: 'UAT', periodCount: 1 },
      { name: 'Launch & Stabilization', periodCount: 1 },
    ];

    const plans = [
      plan(142, 23, 40.94, [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 60, 60]),
      plan(143, 31, 55.18, [100, 100, 40, 40, 40, 40, 40, 40, 40, 40, 40, 20]),
      plan(144, 65, 115.70, [60, 60, 25, 25, 25, 25, 25, 25, 25, 25, 10, 10]),
      plan(145, 62, 110.36, [50, 50, 35, 35, 35, 35, 35, 35, 35, 35, 10, 10]),
      plan(146, 38, 67.64, [40, 40, 90, 90, 90, 90, 90, 90, 90, 90, 40, 25]),
      plan(147, 31, 55.18, [10, 10, 100, 100, 100, 100, 100, 100, 100, 100, 50, 20]),
      plan(148, 30, 53.40, [25, 25, 100, 100, 100, 100, 100, 100, 100, 100, 60, 30]),
      plan(149, 22, 39.16, [0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 60, 25]),
      plan(150, 22, 39.16, [0, 0, 100, 100, 100, 100, 100, 100, 100, 100, 60, 25]),
      plan(151, 27, 48.06, [15, 15, 35, 35, 35, 35, 35, 35, 35, 35, 50, 70]),
      plan(152, 14, 24.92, [10, 10, 60, 60, 60, 60, 60, 60, 60, 60, 100, 50]),
    ];

    const exchangeRate = 0.89;
    const hrsPerPeriod = 40; // weekly

    it('matches the pre-refactor totals on real project data', () => {
      const { totals } = buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate);
      expect(totals.intCost).toBeCloseTo(90980, 6);
      expect(totals.price).toBeCloseTo(161944.4, 6);
      expect(totals.discountedCost).toBeCloseTo(161944.4, 6);
      expect(totals.investmentPct).toBe(0);
      expect(totals.effortHours).toBeCloseTo(2994, 6);
      expect(totals.margin).toBeCloseTo(50, 6);
      expect(totals.blendedHourlyRate).toBeCloseTo(54.089645958583844, 6);
      expect(totals.blendedDailyRate).toBeCloseTo(432.71716766867075, 6);
    });

    it('applies investment as a discount against Total cost for project margin', () => {
      // 10 × 100% × 40h = 400h; int = 80000; price = 100000; investment 8000
      // margin = (92000 - 71200) / 92000 * 100
      const bigPlan = plan(1, 200, 250, Array(10).fill(100));
      const { totals } = buildPlanFinancials(
        [bigPlan],
        [{ name: 'Phase 1', periodCount: 10 }],
        hrsPerPeriod,
        exchangeRate,
        8000,
      );
      expect(totals.intCost).toBeCloseTo(80000, 6);
      expect(totals.price).toBeCloseTo(100000, 6);
      expect(totals.discountedCost).toBeCloseTo(92000, 6);
      expect(totals.investmentPct).toBeCloseTo(8, 6);
      expect(totals.margin).toBeCloseTo(22.608695652173914, 6);
      expect(totals.blendedHourlyRate).toBeCloseTo(250, 6);
    });

    it('clamps Discounted cost to 0 when investment exceeds Total cost', () => {
      const p = plan(1, 50, 100, [100]);
      const { totals } = buildPlanFinancials(
        [p],
        [{ name: 'Phase 1', periodCount: 1 }],
        hrsPerPeriod,
        1,
        99999,
      );
      expect(totals.discountedCost).toBe(0);
      expect(totals.margin).toBe(0);
    });

    it('returns null investmentPct and margin 0 when Total cost is 0', () => {
      const p = plan(1, 50, 0, [100]);
      const { totals } = buildPlanFinancials(
        [p],
        [{ name: 'Phase 1', periodCount: 1 }],
        hrsPerPeriod,
        1,
        100,
      );
      expect(totals.investmentPct).toBeNull();
      expect(totals.margin).toBe(0);
    });

    it('treats non-finite or negative investment as 0', () => {
      const { totals } = buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate, NaN);
      expect(totals.discountedCost).toBeCloseTo(totals.price, 6);
      expect(totals.margin).toBeCloseTo(50, 6);
    });

    it('matches the pre-refactor per-phase totals on real project data', () => {
      const { phaseTotals } = buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate);
      const expected = [
        { name: 'Discovery', cost: 11500, price: 20470, efforts: 288 },
        { name: 'Implementation', cost: 70048, price: 124685.44, efforts: 2352 },
        { name: 'UAT', cost: 5660, price: 10074.8, efforts: 216 },
        { name: 'Launch & Stabilization', cost: 3772, price: 6714.16, efforts: 138 },
      ];
      expect(phaseTotals.map((pt) => pt.name)).toEqual(expected.map((e) => e.name));
      phaseTotals.forEach((pt, i) => {
        expect(pt.cost).toBeCloseTo(expected[i].cost, 6);
        expect(pt.price).toBeCloseTo(expected[i].price, 6);
        expect(pt.efforts).toBeCloseTo(expected[i].efforts, 6);
        expect(pt.margin).toBeCloseTo(50, 6);
      });
    });

    it('matches the pre-refactor first row on real project data', () => {
      const { rows } = buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate);
      expect(rows[0].effortHours).toBeCloseTo(247.99999999999997, 6);
      expect(rows[0].intCost).toBeCloseTo(5703.999999999999, 6);
      expect(rows[0].price).toBeCloseTo(10153.119999999999, 6);
      expect(rows[0].margin).toBeCloseTo(50, 6);
    });

    it('returns a null margin (not 0) when a row has zero client rate — callers apply their own display fallback', () => {
      const zeroClientPlan = plan(999, 20, 0, [100]);
      const { rows } = buildPlanFinancials([zeroClientPlan], [{ name: 'Phase 1', periodCount: 1 }], hrsPerPeriod, exchangeRate);
      expect(rows[0].margin).toBeNull();
    });

    it('falls back to the legacy weekCount field when periodCount is absent', () => {
      const legacyPhases = [{ name: 'Phase 1', weekCount: 2 }];
      const twoWeekPlan = plan(1, 10, 20, [100, 100]);
      const { totals } = buildPlanFinancials([twoWeekPlan], legacyPhases, hrsPerPeriod, exchangeRate);
      expect(totals.effortHours).toBe(80); // 2 periods * 100% * 40h
    });
  });
});
