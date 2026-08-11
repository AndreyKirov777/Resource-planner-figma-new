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

/** Periods occupied by a phase, tolerating the legacy `weekCount` field. */
function phaseLength(phase: Phase): number {
  return phase.periodCount ?? phase.weekCount ?? 0;
}

/** Number of periods preceding a phase, i.e. its 0-based start offset. */
export function phaseStartOffset(phases: Phase[], phaseIndex: number): number {
  return phases.slice(0, phaseIndex).reduce((sum, p) => sum + phaseLength(p), 0);
}

/**
 * Move a phase to a new position. Because a phase owns no explicit period range —
 * its span is derived from array order plus the cumulative period counts — moving one
 * re-labels every period after it. The returned `periodMap` carries the old -> new
 * period numbers so callers can carry allocations along with their phase; periods
 * absent from the map (orphans past the timeline end) should be left untouched.
 */
export function reorderPhases(
  phases: Phase[],
  from: number,
  to: number
): { phases: Phase[]; periodMap: Map<number, number> } {
  const inRange = (i: number) => i >= 0 && i < phases.length;
  if (from === to || !inRange(from) || !inRange(to)) {
    return { phases, periodMap: new Map() };
  }

  const oldStart = phases.map((_, i) => phaseStartOffset(phases, i));

  const order = phases.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);

  const periodMap = new Map<number, number>();
  let newStart = 0;
  for (const oldIndex of order) {
    for (let k = 0; k < phaseLength(phases[oldIndex]); k++) {
      periodMap.set(oldStart[oldIndex] + k + 1, newStart + k + 1);
    }
    newStart += phaseLength(phases[oldIndex]);
  }

  return { phases: order.map((i) => phases[i]), periodMap };
}

/** Apply a `reorderPhases` period map, leaving unmapped periods where they are. */
export function remapPeriodNumber(periodMap: Map<number, number>, periodNumber: number): number {
  return periodMap.get(periodNumber) ?? periodNumber;
}

/**
 * Phase names are the Glide column-group key, so they must stay unique.
 * Derives "Discovery 2", "Discovery 3", ... until one is free.
 */
export function uniquePhaseName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) suffix++;
  return `${base} ${suffix}`;
}

/**
 * Split a phase in two at a period boundary: the new phase begins immediately after
 * global period `splitAfterPeriod`. Total timeline length is unchanged, so allocations
 * keep their period numbers and need no remapping. Returns the input untouched when the
 * split point would leave either half empty.
 */
export function splitPhase(phases: Phase[], phaseIndex: number, splitAfterPeriod: number): Phase[] {
  const phase = phases[phaseIndex];
  if (!phase) return phases;

  const total = phaseLength(phase);
  const firstCount = splitAfterPeriod - phaseStartOffset(phases, phaseIndex);
  if (firstCount < 1 || firstCount >= total) return phases;

  const usedColors = new Set(phases.map((p) => p.color));
  const color =
    PHASE_COLORS.find((c) => !usedColors.has(c)) ?? PHASE_COLORS[phases.length % PHASE_COLORS.length];

  const next = [...phases];
  next.splice(
    phaseIndex,
    1,
    { ...phase, periodCount: firstCount, weekCount: undefined },
    {
      name: uniquePhaseName(phase.name, phases.map((p) => p.name)),
      periodCount: total - firstCount,
      color,
    }
  );
  return next;
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
