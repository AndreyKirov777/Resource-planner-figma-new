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

/** True when the project still has the default single placeholder phase. */
export function isPlaceholderSinglePhase(phases: Phase[]): boolean {
  return phases.length === 1 && /^phase\s*1$/i.test(phases[0].name.trim());
}

/** Heuristic: description asks for a multi-phase timeline. */
export function descriptionSuggestsPhaseProposal(description: string): boolean {
  if (parsePhasesFromDescription(description).length >= 2) return true;
  return /\b(phases?|timeline|discovery|inception|stabilization|stabilisation|launch|milestones?|uat|implementation)\b/i.test(
    description,
  ) || /\d+\s*weeks?\s*[-–:]/i.test(description);
}

export interface DescriptionPhase {
  name: string;
  periodCount: number;
}

/** Parse explicit week-based phases, e.g. "2 weeks - discovery, 8 weeks - implementation". */
export function parsePhasesFromDescription(description: string): DescriptionPhase[] {
  const pattern = /(\d+)\s*weeks?\s*[-–:]\s*([^,;.]+)/gi;
  const phases: DescriptionPhase[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(description)) !== null) {
    const periodCount = Number.parseInt(match[1], 10);
    const rawName = match[2].trim().replace(/\s+/g, ' ');
    if (!Number.isFinite(periodCount) || periodCount < 1 || !rawName) continue;
    const name = normalizePhaseName(rawName);
    phases.push({ name, periodCount });
  }
  return phases;
}

function normalizePhaseName(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === 'uat') return 'UAT';
  return raw
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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
