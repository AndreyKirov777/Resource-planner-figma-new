import { Phase, ResourcePlan as ResourcePlanType } from '../services/api';

export const PHASE_COLORS = [
  '#E3F2FD', '#FCE4EC', '#E8F5E9', '#FFF3E0',
  '#F3E5F5', '#E0F7FA', '#FFF9C4', '#F1F8E9',
  '#FFEBEE', '#E8EAF6',
];

// Parse phases from project JSON; fallback to single phase covering existing weeks.
// Assigns default colors from palette for phases missing a color (backward compatibility).
export function parsePhases(
  phasesJson: string | undefined,
  resourcePlans: ResourcePlanType[]
): Phase[] {
  if (phasesJson) {
    try {
      const parsed = JSON.parse(phasesJson) as Phase[];
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p) => p.name && ((p.periodCount ?? p.weekCount ?? 0) > 0))) {
        return parsed.map((p, idx) => ({
          name: p.name,
          periodCount: p.periodCount ?? p.weekCount ?? 0,
          color: p.color ?? PHASE_COLORS[idx % PHASE_COLORS.length],
        }));
      }
    } catch {
      /* fall through */
    }
  }
  const allPeriods = new Set<number>();
  resourcePlans.forEach((plan) => {
    plan.allocations.forEach((a) => allPeriods.add(a.periodNumber));
  });
  const totalPeriods = allPeriods.size > 0 ? Math.max(...allPeriods) : 8;
  return [{ name: 'Phase 1', periodCount: totalPeriods, color: PHASE_COLORS[0] }];
}

export function getPhaseForPeriod(
  periodNum: number,
  phases: Phase[]
): { phaseIndex: number; localPeriod: number } {
  let cumulative = 0;
  for (let i = 0; i < phases.length; i++) {
    const count = phases[i].periodCount ?? 0;
    if (periodNum <= cumulative + count) {
      return { phaseIndex: i, localPeriod: periodNum - cumulative };
    }
    cumulative += count;
  }
  return { phaseIndex: Math.max(0, phases.length - 1), localPeriod: periodNum - cumulative };
}
