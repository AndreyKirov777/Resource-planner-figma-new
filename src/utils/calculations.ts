/**
 * Shared business logic for resource planning calculations.
 * Single source of truth for margin, cost, and effort formulas.
 */

import type { Phase, ResourcePlan } from '../services/api';

/**
 * Client hourly rate from internal rate, margin, and exchange rate.
 * Formula: (internalRate / (1 - margin)) * exchangeRate
 * @param internalRate - Internal hourly cost (e.g. USD)
 * @param margin - Margin as decimal 0..1 (e.g. 0.25 for 25%)
 * @param exchangeRate - Rate to client currency (e.g. USD to EUR)
 */
export function clientHourlyRate(
  internalRate: number,
  margin: number,
  exchangeRate: number
): number {
  if (margin >= 1 || !Number.isFinite(internalRate) || !Number.isFinite(exchangeRate)) {
    return 0;
  }
  return (internalRate / (1 - margin)) * exchangeRate;
}

/**
 * Total internal cost: hours * rate.
 */
export function totalInternalCost(hours: number, rate: number): number {
  return hours * rate;
}

/**
 * Total client cost: hours * client rate.
 */
export function totalClientCost(hours: number, clientRate: number): number {
  return hours * clientRate;
}

/**
 * Gross margin percentage: (clientTotal - internalInClientCurrency) / clientTotal * 100.
 * internalCost is in base currency (e.g. USD), clientCost is in client currency.
 * internalCost is converted to client currency via exchangeRate.
 */
export function grossMarginPct(
  internalCost: number,
  clientCost: number,
  exchangeRate: number
): number {
  if (clientCost <= 0 || !Number.isFinite(clientCost)) return 0;
  const internalInClientCurrency = internalCost * exchangeRate;
  return ((clientCost - internalInClientCurrency) / clientCost) * 100;
}

/**
 * Margin percentage for a single rate: (clientRate - internalInClientCurrency) / clientRate * 100.
 */
export function marginPct(
  clientRate: number,
  internalRate: number,
  exchangeRate: number
): number | null {
  if (!clientRate || clientRate <= 0 || !Number.isFinite(clientRate)) return null;
  const intRateInClientCurrency = internalRate * exchangeRate;
  return ((clientRate - intRateInClientCurrency) / clientRate) * 100;
}

/**
 * Hours per planning period based on mode.
 * Weekly: 5 days * 8h = 40h.
 * Monthly: daysInFTE * 8h (e.g. 20 * 8 = 160h).
 *
 * daysInFTE is cadence-only here: weekly deliberately ignores it and stays
 * fixed at 40h; only the monthly branch multiplies by it. Don't confuse this
 * with modeConversion.ts's getWeeksPerMonth(), which uses daysInFTE
 * unconditionally (weeksPerMonth = daysInFTE / 5) — a separate formula for a
 * separate purpose (SPEC.md Constraints, decided 2026-08-12).
 */
export function hoursPerPeriod(
  mode: 'weekly' | 'monthly',
  daysInFTE: number,
): number {
  return mode === 'monthly' ? daysInFTE * 8 : 40;
}

/**
 * Estimated effort in hours from total "periods" (sum of allocation percentages / 100).
 * @param totalPeriodsEquivalent - Sum over periods of (allocation/100)
 * @param hoursPerPeriodValue - Hours per period (40 for weekly, daysInFTE*8 for monthly)
 */
export function estimatedEffortHours(
  totalPeriodsEquivalent: number,
  hoursPerPeriodValue: number
): number {
  return totalPeriodsEquivalent * hoursPerPeriodValue;
}

export interface PlanFinancialsRow {
  plan: ResourcePlan;
  effortHours: number;
  intCost: number;
  price: number;
  margin: number | null;
}

export interface PlanFinancialsTotals {
  intCost: number;
  price: number;
  effortHours: number;
  margin: number;
  blendedHourlyRate: number;
  blendedDailyRate: number;
}

export interface PlanFinancialsPhaseTotal {
  name: string;
  cost: number;
  price: number;
  efforts: number;
  margin: number;
}

export interface PlanFinancials {
  rows: PlanFinancialsRow[];
  totals: PlanFinancialsTotals;
  phaseTotals: PlanFinancialsPhaseTotal[];
}

/** Periods occupied by a phase, tolerating the legacy `weekCount` field. */
function phaseLength(phase: Phase): number {
  return phase.periodCount ?? phase.weekCount ?? 0;
}

function effortHoursOverWindow(
  plan: ResourcePlan,
  startPeriod: number,
  endPeriod: number,
  hoursPerPeriodValue: number,
): number {
  let periodsEquivalent = 0;
  for (let p = startPeriod; p <= endPeriod; p++) {
    const allocation = plan.allocations.find((a) => a.periodNumber === p);
    periodsEquivalent += (allocation?.allocation || 0) / 100;
  }
  return estimatedEffortHours(periodsEquivalent, hoursPerPeriodValue);
}

/**
 * Per-plan effort/cost/price/margin, project totals (incl. blended rate), and
 * per-phase totals — the one computation shared by every export/summary view
 * (Excel, PNG, the plan grid, the client view). `margin` is `null` when the
 * underlying `marginPct` is undefined (e.g. a zero client rate); callers that
 * need a display fallback apply their own `?? 0` at render time.
 */
export function buildPlanFinancials(
  plans: ResourcePlan[],
  phases: Phase[],
  hoursPerPeriodValue: number,
  exchangeRate: number,
): PlanFinancials {
  const totalPeriods = phases.reduce((sum, p) => sum + phaseLength(p), 0);

  const rows: PlanFinancialsRow[] = plans.map((plan) => {
    const effortHours = effortHoursOverWindow(plan, 1, totalPeriods, hoursPerPeriodValue);
    return {
      plan,
      effortHours,
      intCost: totalInternalCost(effortHours, plan.intHourlyRate),
      price: totalClientCost(effortHours, plan.clientHourlyRate),
      margin: marginPct(plan.clientHourlyRate, plan.intHourlyRate, exchangeRate),
    };
  });

  const intCost = rows.reduce((sum, r) => sum + r.intCost, 0);
  const price = rows.reduce((sum, r) => sum + r.price, 0);
  const effortHours = rows.reduce((sum, r) => sum + r.effortHours, 0);
  const margin = grossMarginPct(intCost, price, exchangeRate);
  const blendedHourlyRate = effortHours > 0 ? price / effortHours : 0;
  const blendedDailyRate = blendedHourlyRate * 8;

  let startPeriod = 1;
  const phaseTotals: PlanFinancialsPhaseTotal[] = phases.map((phase) => {
    const endPeriod = startPeriod + phaseLength(phase) - 1;
    let phaseCost = 0;
    let phasePrice = 0;
    let phaseEfforts = 0;
    plans.forEach((plan) => {
      const hours = effortHoursOverWindow(plan, startPeriod, endPeriod, hoursPerPeriodValue);
      phaseCost += totalInternalCost(hours, plan.intHourlyRate);
      phasePrice += totalClientCost(hours, plan.clientHourlyRate);
      phaseEfforts += hours;
    });
    const result: PlanFinancialsPhaseTotal = {
      name: phase.name,
      cost: phaseCost,
      price: phasePrice,
      efforts: phaseEfforts,
      margin: grossMarginPct(phaseCost, phasePrice, exchangeRate),
    };
    startPeriod = endPeriod + 1;
    return result;
  });

  return { rows, totals: { intCost, price, effortHours, margin, blendedHourlyRate, blendedDailyRate }, phaseTotals };
}
