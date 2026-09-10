/**
 * Reconciliation engine: compares the WBS's bottom-up hour estimates against
 * the resource plan's top-down allocations, at project-total, per-discipline,
 * and per-phase-x-discipline granularity. Pure, no React/DOM — see
 * `docs/bmad-archive/implementation-artifacts/spec-wbs-3-reconciliation-engine.md`
 * for the frozen contract this implements.
 *
 * Deliberately reuses existing pure helpers rather than re-deriving their
 * math: `estimatedEffortHours`/`hoursPerPeriod` (calculations.ts) for
 * plan-side hours, `getPhaseForPeriod` (phases.ts) to map an allocation's
 * period to a phase, and `rollupHours` (wbsTree.ts) for a WBS item's own
 * per-discipline hours (all roles merged into one discipline total, matching
 * WBS-2's on-screen "Total hours" semantics).
 */
import { WbsItem, ResourcePlan as ResourcePlanType, RateCard as RateCardType, Phase } from '../services/api';
import { estimatedEffortHours } from './calculations';
import { getPhaseForPeriod } from './phases';
import { rollupHours, WbsTreeNode } from './wbsTree';

export interface DisciplineVariance {
  discipline: string;
  wbsHours: number;
  planHours: number;
  varianceHours: number; // wbsHours - planHours
}

export interface PhaseDisciplineVariance extends DisciplineVariance {
  phaseName: string;
}

export interface UnmappedPlanRow {
  resourcePlanId: number;
  role: string;
  hours: number;
}

export interface ReconciliationReport {
  projectTotal: { wbsHours: number; planHours: number; varianceHours: number };
  byDiscipline: DisciplineVariance[]; // union of disciplines seen on either side, sorted alphabetically
  byPhaseDiscipline: PhaseDisciplineVariance[]; // one row per (phase, discipline) pair where wbsHours>0 || planHours>0
  phaseLevelAvailable: boolean; // true iff >=1 WBS item has phaseName matching a name in `phases`
  unassignedWbs: { totalHours: number; byDiscipline: { discipline: string; hours: number }[] };
  unmappedPlan: { totalHours: number; rows: UnmappedPlanRow[] };
}

/**
 * Resolve a resource-plan role to a rate-card discipline. No match ->
 * `undefined` (the row is Unmapped). First match wins if duplicate `role`
 * strings exist in the rate card (the schema has no unique constraint on it).
 */
export function resolveDiscipline(role: string, rateCards: RateCardType[]): string | undefined {
  return rateCards.find((rc) => rc.role === role)?.discipline;
}

// Plain comparison, not `localeCompare` — keeps "sorted alphabetically" deterministic
// across environments/ICU builds instead of depending on the runtime's default locale.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedEntries<V>(map: Map<string, V>): [string, V][] {
  return Array.from(map.entries()).sort(([a], [b]) => compareStrings(a, b));
}

function addTo(map: Map<string, number>, key: string, hours: number) {
  map.set(key, (map.get(key) ?? 0) + hours);
}

/** A WBS item's own (not descendants') per-discipline hours, via `rollupHours` on a childless synthetic node. */
function ownHoursByDiscipline(item: WbsItem): Map<string, number> {
  const node: WbsTreeNode = { ...item, children: [] };
  return rollupHours(node);
}

export function buildReconciliationReport(
  wbsItems: WbsItem[],
  resourcePlans: ResourcePlanType[],
  rateCards: RateCardType[],
  phases: Phase[],
  hrsPerPeriod: number
): ReconciliationReport {
  const phaseNames = new Set(phases.map((p) => p.name));

  // ---- WBS side ----
  let wbsTotal = 0;
  const wbsByDiscipline = new Map<string, number>(); // phase-agnostic, ALL items
  const unassignedByDiscipline = new Map<string, number>();
  const wbsByPhaseDiscipline = new Map<string, Map<string, number>>(); // phaseName -> discipline -> hours
  let phaseLevelAvailable = false;

  wbsItems.forEach((item) => {
    const ownHours = ownHoursByDiscipline(item);

    ownHours.forEach((hours, discipline) => {
      wbsTotal += hours;
      addTo(wbsByDiscipline, discipline, hours);
    });

    const phaseName = item.phaseName;
    if (phaseName != null && phaseNames.has(phaseName)) {
      phaseLevelAvailable = true;
      const phaseMap = wbsByPhaseDiscipline.get(phaseName) ?? new Map<string, number>();
      ownHours.forEach((hours, discipline) => addTo(phaseMap, discipline, hours));
      wbsByPhaseDiscipline.set(phaseName, phaseMap);
    } else {
      // phaseName === null, or a stale name matching no current phase — both
      // fold into Unassigned (equally unplaceable on the live timeline).
      ownHours.forEach((hours, discipline) => addTo(unassignedByDiscipline, discipline, hours));
    }
  });

  // ---- Plan side ----
  let planTotal = 0;
  const planByDiscipline = new Map<string, number>(); // phase-agnostic, resolved rows only
  const planByPhaseDiscipline = new Map<string, Map<string, number>>();
  const unmappedRows: UnmappedPlanRow[] = [];
  let unmappedTotal = 0;

  resourcePlans.forEach((plan) => {
    const discipline = resolveDiscipline(plan.role, rateCards);
    let rowHours = 0;

    plan.allocations.forEach((allocation) => {
      const periodsEquivalent = allocation.allocation / 100;
      const hours = estimatedEffortHours(periodsEquivalent, hrsPerPeriod);
      // Project total is phase/discipline-agnostic and always available —
      // count every allocation's hours here regardless of role resolution.
      planTotal += hours;
      rowHours += hours;

      if (discipline !== undefined) {
        addTo(planByDiscipline, discipline, hours);

        const { phaseIndex } = getPhaseForPeriod(allocation.periodNumber, phases);
        const phase = phases[phaseIndex];
        if (phase) {
          const phaseMap = planByPhaseDiscipline.get(phase.name) ?? new Map<string, number>();
          addTo(phaseMap, discipline, hours);
          planByPhaseDiscipline.set(phase.name, phaseMap);
        }
      }
    });

    if (discipline === undefined) {
      unmappedTotal += rowHours;
      unmappedRows.push({ resourcePlanId: plan.id, role: plan.role, hours: rowHours });
    }
  });

  // ---- byDiscipline: union of disciplines seen on either side ----
  const allDisciplines = new Set<string>([...wbsByDiscipline.keys(), ...planByDiscipline.keys()]);
  const byDiscipline: DisciplineVariance[] = Array.from(allDisciplines)
    .sort(compareStrings)
    .map((discipline) => {
      const wbsHours = wbsByDiscipline.get(discipline) ?? 0;
      const planHours = planByDiscipline.get(discipline) ?? 0;
      return { discipline, wbsHours, planHours, varianceHours: wbsHours - planHours };
    });

  // ---- byPhaseDiscipline: phases in array order, disciplines alphabetical, one-sided rows kept ----
  const byPhaseDiscipline: PhaseDisciplineVariance[] = [];
  phases.forEach((phase) => {
    const wbsMap = wbsByPhaseDiscipline.get(phase.name) ?? new Map<string, number>();
    const planMap = planByPhaseDiscipline.get(phase.name) ?? new Map<string, number>();
    const disciplinesForPhase = new Set<string>([...wbsMap.keys(), ...planMap.keys()]);
    Array.from(disciplinesForPhase)
      .sort(compareStrings)
      .forEach((discipline) => {
        const wbsHours = wbsMap.get(discipline) ?? 0;
        const planHours = planMap.get(discipline) ?? 0;
        if (wbsHours > 0 || planHours > 0) {
          byPhaseDiscipline.push({
            phaseName: phase.name,
            discipline,
            wbsHours,
            planHours,
            varianceHours: wbsHours - planHours,
          });
        }
      });
  });

  const unassignedWbsByDiscipline = sortedEntries(unassignedByDiscipline).map(([discipline, hours]) => ({
    discipline,
    hours,
  }));
  const unassignedWbsTotal = unassignedWbsByDiscipline.reduce((sum, row) => sum + row.hours, 0);

  unmappedRows.sort((a, b) => a.resourcePlanId - b.resourcePlanId);

  return {
    projectTotal: { wbsHours: wbsTotal, planHours: planTotal, varianceHours: wbsTotal - planTotal },
    byDiscipline,
    byPhaseDiscipline,
    phaseLevelAvailable,
    unassignedWbs: { totalHours: unassignedWbsTotal, byDiscipline: unassignedWbsByDiscipline },
    unmappedPlan: { totalHours: unmappedTotal, rows: unmappedRows },
  };
}
