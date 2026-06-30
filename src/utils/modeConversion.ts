/**
 * Conversion logic for switching between weekly and monthly planning modes.
 * weeksPerMonth = daysInFTE / 5 (5 working days per week).
 */

export interface PeriodAllocation {
  periodNumber: number;
  allocation: number;
}

export interface Phase {
  name: string;
  periodCount?: number;
  weekCount?: number; // backward compat
  color?: string;
}

/**
 * Derive weeks-per-month from project's daysInFTE.
 * Default: 20 days / 5 = 4 weeks.
 */
export function getWeeksPerMonth(daysInFTE: number = 20): number {
  return daysInFTE / 5;
}

/**
 * Convert weekly allocations to monthly.
 * Groups consecutive weeks into months (weeksPerMonth weeks each),
 * and averages the allocation percentages within each group.
 */
export function convertWeeklyToMonthly(
  allocations: PeriodAllocation[],
  totalWeeks: number,
  weeksPerMonth: number,
): PeriodAllocation[] {
  if (totalWeeks <= 0) return [];
  const totalMonths = Math.ceil(totalWeeks / weeksPerMonth);
  const result: PeriodAllocation[] = [];

  for (let m = 0; m < totalMonths; m++) {
    const startWeek = Math.floor(m * weeksPerMonth);
    const endWeek = Math.min(Math.floor((m + 1) * weeksPerMonth), totalWeeks);
    const weeksInThisMonth = endWeek - startWeek;

    if (weeksInThisMonth <= 0) continue;

    let sum = 0;
    for (let w = startWeek; w < endWeek; w++) {
      const weekNum = w + 1; // 1-indexed
      const alloc = allocations.find(a => a.periodNumber === weekNum);
      sum += alloc?.allocation ?? 0;
    }

    result.push({
      periodNumber: m + 1,
      allocation: Math.round(sum / weeksInThisMonth),
    });
  }

  return result;
}

/**
 * Convert monthly allocations to weekly.
 * Each month's allocation is distributed evenly to its constituent weeks.
 */
export function convertMonthlyToWeekly(
  allocations: PeriodAllocation[],
  totalMonths: number,
  weeksPerMonth: number,
): PeriodAllocation[] {
  if (totalMonths <= 0) return [];
  const totalWeeks = Math.round(totalMonths * weeksPerMonth);
  const result: PeriodAllocation[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const monthIndex = Math.floor(w / weeksPerMonth);
    const monthNum = monthIndex + 1; // 1-indexed
    const alloc = allocations.find(a => a.periodNumber === monthNum);
    result.push({
      periodNumber: w + 1,
      allocation: alloc?.allocation ?? 0,
    });
  }

  return result;
}

/**
 * Convert phases from weekly to monthly mode.
 */
export function convertPhasesToMonthly(phases: Phase[], weeksPerMonth: number): Phase[] {
  return phases.map(phase => {
    const weeks = phase.periodCount ?? phase.weekCount ?? 0;
    return {
      name: phase.name,
      periodCount: Math.max(1, Math.ceil(weeks / weeksPerMonth)),
      color: phase.color,
    };
  });
}

/**
 * Convert phases from monthly to weekly mode.
 */
export function convertPhasesToWeekly(phases: Phase[], weeksPerMonth: number): Phase[] {
  return phases.map(phase => {
    const months = phase.periodCount ?? phase.weekCount ?? 0;
    return {
      name: phase.name,
      periodCount: Math.round(months * weeksPerMonth),
      color: phase.color,
    };
  });
}
