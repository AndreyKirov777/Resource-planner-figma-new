/**
 * CAP-13: turns the roadmap's per-period demand (`roadmapLoad.ts`) into a
 * `GeneratePlanDraft` — the exact shape `GeneratePlanSheet`'s existing
 * draft → preview → apply flow already knows how to preview and, on accept,
 * write. Pure; nothing is written from here. `resourceLists` is left empty —
 * `App.tsx`'s `handleApplyGeneratedPlan` already synthesizes one entry per
 * unique role from `resourcePlans` when `resourceLists` is empty, so this
 * doesn't need to duplicate that.
 */
import { GeneratePlanDraft, GeneratePlanRegion, GeneratePlanResourcePlan, RateCard as RateCardType } from '../services/api';
import { clientHourlyRate } from './calculations';
import { RoadmapLoad, demandFte, roadmapLoadKeys } from './roadmapLoad';

function internalRateForRole(rateCards: RateCardType[], role: string, region: GeneratePlanRegion): number {
  const row = rateCards.find((rc) => rc.role === role);
  if (!row) return 0;
  const value = row[region];
  return typeof value === 'number' ? value : 0;
}

/**
 * A single `Allocation.allocation` is capped at 100 (`server-validation.ts`)
 * — one row is at most 1.0 FTE. A role whose demand peaks above that splits
 * into multiple rows, bin-packed greedily to 100% each before spilling into
 * the next — the same thing a planner does by hand when a role needs a
 * second person, just computed instead of guessed.
 */
export function buildDraftFromRoadmapLoad(
  load: RoadmapLoad,
  rateCards: RateCardType[],
  region: GeneratePlanRegion,
  marginPct: number,
  exchangeRate: number
): GeneratePlanDraft {
  const periods = Array.from({ length: load.np }, (_, i) => i + 1);
  const marginDecimal = marginPct / 100;
  const resourcePlans: GeneratePlanResourcePlan[] = [];
  let displayOrder = 0;

  roadmapLoadKeys(load, 'role').forEach((role) => {
    if (!role) return;
    const fteByPeriod = periods.map((p) => demandFte(load, 'role', role, p));
    const peakFte = Math.max(0, ...fteByPeriod);
    if (peakFte <= 1e-9) return;

    const internalRate = internalRateForRole(rateCards, role, region);
    const clientRate = clientHourlyRate(internalRate, marginDecimal, exchangeRate);
    const safeInternal = Number.isFinite(internalRate) ? internalRate : 0;
    const safeClient = Number.isFinite(clientRate) ? clientRate : 0;
    const rowCount = Math.max(1, Math.ceil(peakFte - 1e-9));

    for (let row = 0; row < rowCount; row++) {
      const allocations = periods
        .map((p, i) => ({ periodNumber: p, allocation: Math.round(Math.min(1, Math.max(0, fteByPeriod[i] - row)) * 100) }))
        .filter((a) => Number.isFinite(a.allocation) && a.allocation > 0);
      if (allocations.length === 0) continue;
      resourcePlans.push({
        role,
        clientRole: null,
        name: null,
        intHourlyRate: safeInternal,
        clientHourlyRate: safeClient,
        displayOrder: displayOrder++,
        rationale: 'Drafted from the roadmap',
        allocations,
      });
    }
  });

  return { resourcePlans, resourceLists: [], region };
}
