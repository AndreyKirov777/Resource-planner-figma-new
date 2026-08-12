/**
 * Shared business logic for resource planning calculations.
 * Single source of truth for margin, cost, and effort formulas.
 */

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
  daysInFTE: number = 20,
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
  hoursPerPeriodValue: number = 40
): number {
  return totalPeriodsEquivalent * hoursPerPeriodValue;
}

/**
 * FTE (full-time equivalent) effort in days from total hours.
 * @param totalHours - Total effort in hours
 * @param hoursPerDay - Hours per FTE day (default 8)
 */
export function fteEffort(totalHours: number, hoursPerDay: number = 8): number {
  if (hoursPerDay <= 0) return 0;
  return totalHours / hoursPerDay;
}
