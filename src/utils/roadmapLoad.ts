/**
 * The roadmap's demand engine (Slice B, CAP-8): derives, from linked effort
 * and roadmap windows, how much of each role/discipline is needed in each
 * period, and compares it with Resource Plan supply. Pure, no React/DOM — see
 * `_bmad-output/specs/spec-roadmap/data-model.md`'s "Demand engine" section
 * for the frozen contract this implements.
 *
 * ONE engine, five readers (the bar's stripe, the tooltip's supply lines, the
 * load strip, the by-period matrix, and the draft-plan generator) — none of
 * them re-implements this math. Reuses `hoursPerPeriod`, `resolveDiscipline`,
 * `effectiveRoadmapItems` and `itemEffort` rather than re-deriving them.
 *
 * Rounding: never here — only at render. A column of rounded display cells
 * is allowed to differ from an exact total by a few hours; that is expected.
 *
 * --- Role <-> supply matching (a judgment call; not settled by the spec) ---
 * `data-model.md` says: "Role matching is exact on role; unmatched rows fall
 * back to discipline via resolveDiscipline, and what still fails to match
 * lands in the existing Unmapped bucket rather than being silently dropped."
 * That is read here as a per-role waterfall for ROLE-dimension supply:
 *   1. Sum ResourcePlan rows whose `role` field equals the demand role
 *      exactly (string equality).
 *   2. A demand role with NO exact-role plan rows falls back to its
 *      DISCIPLINE'S pool: every ResourcePlan row that (a) resolves, via
 *      `resolveDiscipline`, to that role's discipline, AND (b) does not
 *      itself exactly match some OTHER demand role (so a row already
 *      claimed at step 1 by a different role is not also lent out here).
 *   3. A ResourcePlan row that resolves no discipline at all is genuinely
 *      unmapped — already reported by WBS-3's existing "Unmapped (plan)"
 *      card; this engine does not re-report it.
 * This is a documented simplification: two demand roles that share one
 * discipline and both lack an exact match will each see the FULL shared
 * discipline pool (the same hours can appear as available supply for both),
 * because the pool is genuinely fungible labor within a discipline — no
 * invariant in `data-model.md` requires role-level supply to sum to the
 * plan total (only the DEMAND side has a summed invariant, checked below).
 * DISCIPLINE-dimension matching has no such waterfall: every ResourcePlan
 * row's discipline (via `resolveDiscipline`) is used directly, exactly as
 * `buildReconciliationReport` already does.
 */
import { Phase, ResourcePlan as ResourcePlanType, RateCard as RateCardType, WbsItem } from '../services/api';
import { hoursPerPeriod } from './calculations';
import { resolveDiscipline } from './wbs';
import { buildWbsTree, effectivePhases } from './wbsTree';
import { effectiveRoadmapItems, itemEffort, RoadmapLinkRecord } from './roadmap';
import { phaseStartOffset } from './phases';

/** A demand distribution: period -> role -> hours, per `data-model.md`'s producer contract. */
export type Distribution = Map<number, Map<string, number>>;

export type RoadmapLoadDimension = 'role' | 'discipline';

export interface RoadmapLoadItemInput {
  id: number;
  name: string;
  kind: 'bar' | 'milestone' | 'spread';
  startPeriod: number;
  periodCount: number;
}

export interface RoadmapLoadInput {
  wbsItems: WbsItem[];
  roadmapItems: readonly RoadmapLoadItemInput[];
  links: readonly RoadmapLinkRecord[];
  resourcePlans: ResourcePlanType[];
  rateCards: RateCardType[];
  phases: Phase[];
  planningMode: 'weekly' | 'monthly';
  daysInFTE: number;
}

export interface RoadmapLoad {
  np: number;
  hrsPerPeriod: number;
  demandByRole: Map<string, Map<number, number>>;
  supplyByRole: Map<string, Map<number, number>>;
  demandByDiscipline: Map<string, Map<number, number>>;
  supplyByDiscipline: Map<string, Map<number, number>>;
  /** Own hours of leaves with neither an effective roadmap item nor an effective phase. */
  unplaceableHours: number;
  /** Per roadmap item (bar/spread) — its own demand distribution, for the stripe/tooltip/popover. */
  itemDistributions: Map<number, Distribution>;
  /** One aggregate distribution across every unplaced-but-phased leaf (producer 2). */
  phaseBaseline: Distribution;
  /** role -> the discipline recorded on some WbsEstimate carrying that role — the load strip's discipline mode. */
  roleDiscipline: Map<string, string>;
  /** Item id -> its per-role effort (== `itemEffort` output), so a component doesn't recompute it. */
  itemEffortByRole: Map<number, Map<string, number>>;
}

export function projectPeriodCountFromPhases(phases: Phase[]): number {
  const total = phases.reduce((sum, p) => sum + (p.periodCount ?? p.weekCount ?? 0), 0);
  return total > 0 ? total : 1;
}

/** Producer primitive: spreads `effortByRole` evenly over `[startPeriod, startPeriod + periodCount)`. */
function evenDistribution(
  effortByRole: Map<string, number>,
  startPeriod: number,
  periodCount: number
): Distribution {
  const dist: Distribution = new Map();
  if (periodCount <= 0) return dist;
  const perPeriod = new Map<string, number>();
  effortByRole.forEach((hours, role) => {
    if (hours !== 0) perPeriod.set(role, hours / periodCount);
  });
  if (perPeriod.size === 0) return dist;
  for (let p = startPeriod; p < startPeriod + periodCount; p++) {
    dist.set(p, new Map(perPeriod));
  }
  return dist;
}

/** Producer 1 — placed effort for a bar: `E(R,r)/n` over its own `[startPeriod, startPeriod+periodCount)`. */
export function placedEffortDistribution(
  effortByRole: Map<string, number>,
  startPeriod: number,
  periodCount: number
): Distribution {
  return evenDistribution(effortByRole, startPeriod, periodCount);
}

/** Producer 2 — phase baseline for one unplaced leaf: `hours(i,r)/m` over its effective phase `[a, a+m)`. */
export function phaseBaselineDistribution(
  ownEstimatesByRole: Map<string, number>,
  phaseStart: number,
  phaseCount: number
): Distribution {
  return evenDistribution(ownEstimatesByRole, phaseStart, phaseCount);
}

/**
 * Producer 3 — spread (Slice B, decision 2): `E(R,r)/np` over the WHOLE
 * project `[1, np]`, ignoring the item's own stored startPeriod/periodCount
 * sentinel entirely — a spread item's window is never read from the row, it
 * is always "the whole project as it stands right now."
 */
export function spreadDistribution(effortByRole: Map<string, number>, projectPeriodCount: number): Distribution {
  return evenDistribution(effortByRole, 1, Math.max(1, projectPeriodCount));
}

function addDistribution(target: Map<string, Map<number, number>>, dist: Distribution) {
  dist.forEach((byRole, period) => {
    byRole.forEach((hours, role) => {
      const roleMap = target.get(role) ?? new Map<number, number>();
      roleMap.set(period, (roleMap.get(period) ?? 0) + hours);
      target.set(role, roleMap);
    });
  });
}

function mergeDistribution(target: Distribution, source: Distribution) {
  source.forEach((byRole, period) => {
    const targetByRole = target.get(period) ?? new Map<string, number>();
    byRole.forEach((hours, role) => {
      targetByRole.set(role, (targetByRole.get(role) ?? 0) + hours);
    });
    target.set(period, targetByRole);
  });
}

function allocationHours(plan: ResourcePlanType, period: number, hrsPerPeriod: number): number {
  const allocation = plan.allocations.find((a) => a.periodNumber === period);
  if (!allocation) return 0;
  return (allocation.allocation / 100) * hrsPerPeriod;
}

/**
 * Build the whole engine's output from raw inputs. The one place all five
 * consumers ultimately read from — call once per render and pass the result
 * around, rather than each consumer re-deriving it.
 */
export function buildRoadmapLoad(input: RoadmapLoadInput): RoadmapLoad {
  const { wbsItems, roadmapItems, links, resourcePlans, rateCards, phases, planningMode, daysInFTE } = input;
  const np = projectPeriodCountFromPhases(phases);
  const hrsPerPeriod = hoursPerPeriod(planningMode, daysInFTE);

  const tree = buildWbsTree(wbsItems);
  const effective = effectiveRoadmapItems(tree, links);
  const phaseNames = new Set(phases.map((p) => p.name));
  const phaseEff = effectivePhases(tree, phaseNames);

  const demandByRole = new Map<string, Map<number, number>>();
  const itemDistributions = new Map<number, Distribution>();
  const itemEffortByRole = new Map<number, Map<string, number>>();
  const phaseBaseline: Distribution = new Map();
  let unplaceableHours = 0;

  // --- Producers 1 & 3: every non-milestone roadmap item's own linked scope. ---
  roadmapItems
    .filter((item) => item.kind !== 'milestone')
    .forEach((item) => {
      const effort = itemEffort(item.id, wbsItems, tree, effective);
      itemEffortByRole.set(item.id, effort);
      const dist =
        item.kind === 'spread'
          ? spreadDistribution(effort, np)
          : placedEffortDistribution(effort, item.startPeriod, item.periodCount);
      itemDistributions.set(item.id, dist);
      addDistribution(demandByRole, dist);
    });

  // --- Producer 2 (phase baseline) + unplaceable: every WBS node's OWN hours
  // that are NOT claimed by an effective roadmap item (already counted above
  // via `itemEffort`'s scope walk, so skipped here to avoid double-counting). ---
  const roleDiscipline = new Map<string, string>();
  wbsItems.forEach((node) => {
    if ((effective.get(node.id)?.roadmapItemId ?? null) !== null) return;
    const ownByRole = new Map<string, number>();
    let ownTotal = 0;
    node.estimates.forEach((e) => {
      if (e.hours === 0) return;
      ownByRole.set(e.role, (ownByRole.get(e.role) ?? 0) + e.hours);
      ownTotal += e.hours;
      if (!roleDiscipline.has(e.role)) roleDiscipline.set(e.role, e.discipline);
    });
    if (ownTotal <= 0) return;

    const phaseName = phaseEff.get(node.id)?.phaseName ?? null;
    const phaseIndex = phaseName === null ? -1 : phases.findIndex((p) => p.name === phaseName);
    if (phaseIndex < 0) {
      unplaceableHours += ownTotal;
      return;
    }
    const phaseStart = phaseStartOffset(phases, phaseIndex) + 1;
    const phaseCount = Math.max(1, phases[phaseIndex].periodCount ?? 0);
    const dist = phaseBaselineDistribution(ownByRole, phaseStart, phaseCount);
    mergeDistribution(phaseBaseline, dist);
    addDistribution(demandByRole, dist);
  });
  // Roles seen only via placed/spread items (never via an unplaced leaf) still
  // need a discipline for the discipline-mode matrix — recover it from ANY
  // WbsEstimate row carrying that role, effective item or not.
  wbsItems.forEach((node) => {
    node.estimates.forEach((e) => {
      if (!roleDiscipline.has(e.role)) roleDiscipline.set(e.role, e.discipline);
    });
  });

  // --- Supply, role dimension: exact match, then a bounded discipline fallback. ---
  const demandRoles = new Set(demandByRole.keys());
  const exactRoleRows = new Map<string, ResourcePlanType[]>();
  resourcePlans.forEach((plan) => {
    const list = exactRoleRows.get(plan.role) ?? [];
    list.push(plan);
    exactRoleRows.set(plan.role, list);
  });

  const supplyByRole = new Map<string, Map<number, number>>();
  demandRoles.forEach((role) => {
    const periodMap = new Map<number, number>();
    const exactRows = exactRoleRows.get(role) ?? [];
    const rows =
      exactRows.length > 0
        ? exactRows
        : (() => {
            const discipline = roleDiscipline.get(role);
            if (discipline === undefined) return [];
            return resourcePlans.filter(
              (plan) => !demandRoles.has(plan.role) && resolveDiscipline(plan.role, rateCards) === discipline
            );
          })();
    for (let p = 1; p <= np; p++) {
      const hours = rows.reduce((sum, plan) => sum + allocationHours(plan, p, hrsPerPeriod), 0);
      if (hours !== 0) periodMap.set(p, hours);
    }
    supplyByRole.set(role, periodMap);
  });

  // --- Discipline dimension: demand and supply both fold onto discipline directly. ---
  const demandByDiscipline = new Map<string, Map<number, number>>();
  demandByRole.forEach((byPeriod, role) => {
    const discipline = roleDiscipline.get(role);
    if (discipline === undefined) return;
    const target = demandByDiscipline.get(discipline) ?? new Map<number, number>();
    byPeriod.forEach((hours, period) => target.set(period, (target.get(period) ?? 0) + hours));
    demandByDiscipline.set(discipline, target);
  });

  const supplyByDiscipline = new Map<string, Map<number, number>>();
  resourcePlans.forEach((plan) => {
    const discipline = resolveDiscipline(plan.role, rateCards);
    if (discipline === undefined) return;
    const target = supplyByDiscipline.get(discipline) ?? new Map<number, number>();
    for (let p = 1; p <= np; p++) {
      const hours = allocationHours(plan, p, hrsPerPeriod);
      if (hours !== 0) target.set(p, (target.get(p) ?? 0) + hours);
    }
    supplyByDiscipline.set(discipline, target);
  });

  return {
    np,
    hrsPerPeriod,
    demandByRole,
    supplyByRole,
    demandByDiscipline,
    supplyByDiscipline,
    unplaceableHours,
    itemDistributions,
    phaseBaseline,
    itemEffortByRole,
    roleDiscipline,
  };
}

function dimensionMaps(
  load: RoadmapLoad,
  dimension: RoadmapLoadDimension
): { demand: Map<string, Map<number, number>>; supply: Map<string, Map<number, number>> } {
  return dimension === 'discipline'
    ? { demand: load.demandByDiscipline, supply: load.supplyByDiscipline }
    : { demand: load.demandByRole, supply: load.supplyByRole };
}

export function demandHours(load: RoadmapLoad, dimension: RoadmapLoadDimension, key: string, period: number): number {
  return dimensionMaps(load, dimension).demand.get(key)?.get(period) ?? 0;
}

export function demandFte(load: RoadmapLoad, dimension: RoadmapLoadDimension, key: string, period: number): number {
  if (load.hrsPerPeriod <= 0) return 0;
  return demandHours(load, dimension, key, period) / load.hrsPerPeriod;
}

export function supplyHours(load: RoadmapLoad, dimension: RoadmapLoadDimension, key: string, period: number): number {
  return dimensionMaps(load, dimension).supply.get(key)?.get(period) ?? 0;
}

/** demand - supply: positive = under-staffed (amber), negative = idle (red) — matches `varianceClass`. */
export function variance(load: RoadmapLoad, dimension: RoadmapLoadDimension, key: string, period: number): number {
  return demandHours(load, dimension, key, period) - supplyHours(load, dimension, key, period);
}

/** Every key with demand and/or supply on either dimension, sorted. */
export function roadmapLoadKeys(load: RoadmapLoad, dimension: RoadmapLoadDimension): string[] {
  const { demand, supply } = dimensionMaps(load, dimension);
  return Array.from(new Set([...demand.keys(), ...supply.keys()])).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export interface FeasibleResult {
  periods: number;
  /** The role that determined `periods` (max over roles), or `null` for a window with no effort. */
  limitingRole: string | null;
}

/**
 * `feasiblePeriods` — decision 1 (residual supply): for each role the item
 * has effort in, the average RESIDUAL supply over the item's window (supply
 * minus every OTHER item's/leaf's demand in those periods, i.e. this item's
 * own demand is added back before subtracting), then `ceil(effort / avg)`.
 * The max over roles is the answer; a role with no positive residual supply
 * anywhere in the window makes the window infeasible at current staffing
 * (`Infinity` — "cannot be resourced at all", not just "cannot be shorter").
 */
export function feasiblePeriodsDetail(
  load: RoadmapLoad,
  itemId: number,
  window: { startPeriod: number; periodCount: number },
  itemEffortByRole: Map<string, number>
): FeasibleResult {
  if (window.periodCount <= 0) return { periods: 0, limitingRole: null };
  const dist = load.itemDistributions.get(itemId);
  let maxPeriods = 0;
  let limitingRole: string | null = null;

  itemEffortByRole.forEach((totalEffort, role) => {
    if (totalEffort <= 0) return;
    let residualSum = 0;
    for (let p = window.startPeriod; p < window.startPeriod + window.periodCount; p++) {
      const supply = supplyHours(load, 'role', role, p);
      const totalRoleDemand = demandHours(load, 'role', role, p);
      const ownDemand = dist?.get(p)?.get(role) ?? 0;
      residualSum += supply - (totalRoleDemand - ownDemand);
    }
    const avgResidual = residualSum / window.periodCount;
    const periodsNeeded = avgResidual > 0 ? Math.ceil(totalEffort / avgResidual) : Infinity;
    if (periodsNeeded > maxPeriods) {
      maxPeriods = periodsNeeded;
      limitingRole = role;
    }
  });

  return { periods: maxPeriods, limitingRole };
}

/** Average FTE of a role's supply over a window — the editor's "plan supply" figure and the tooltip's "plan X.X FTE" line. */
export function avgSupplyFteOverWindow(
  load: RoadmapLoad,
  role: string,
  window: { startPeriod: number; periodCount: number },
  hrsPerPeriod: number
): number {
  if (window.periodCount <= 0 || hrsPerPeriod <= 0) return 0;
  let sum = 0;
  for (let p = window.startPeriod; p < window.startPeriod + window.periodCount; p++) {
    sum += supplyHours(load, 'role', role, p);
  }
  return sum / window.periodCount / hrsPerPeriod;
}

export interface ConflictPeriod {
  period: number;
  role: string;
  demandFte: number;
  supplyFte: number;
}

/**
 * The single worst (largest demand-over-supply) period/role conflict within
 * `window`, across every role the item has effort in — the editor's
 * concrete conflict statement (CAP-11). `null` when nothing is over-demand.
 * Deliberately reports only ONE conflict, the worst, rather than every
 * over-demand period — the editor states it concretely, it doesn't enumerate.
 */
export function worstConflictInWindow(
  load: RoadmapLoad,
  itemEffortByRole: ReadonlyMap<string, number>,
  window: { startPeriod: number; periodCount: number }
): ConflictPeriod | null {
  if (window.periodCount <= 0 || load.hrsPerPeriod <= 0) return null;
  let worst: { period: number; role: string; varianceHours: number; demand: number; supply: number } | null = null;

  itemEffortByRole.forEach((_, role) => {
    for (let p = window.startPeriod; p < window.startPeriod + window.periodCount; p++) {
      const demand = demandHours(load, 'role', role, p);
      const supply = supplyHours(load, 'role', role, p);
      const varianceHours = demand - supply;
      if (varianceHours > 1e-9 && (worst === null || varianceHours > worst.varianceHours)) {
        worst = { period: p, role, varianceHours, demand, supply };
      }
    }
  });

  if (!worst) return null;
  const w: { period: number; role: string; varianceHours: number; demand: number; supply: number } = worst;
  return {
    period: w.period,
    role: w.role,
    demandFte: w.demand / load.hrsPerPeriod,
    supplyFte: w.supply / load.hrsPerPeriod,
  };
}

/**
 * Periods, within `window`, where role-dimension demand exceeds supply for
 * ANY role this item has effort in — the bar's stripe (CAP-9) and
 * `toRoadmapRows`' `overDemandPeriods` field both come from this.
 */
export function overDemandPeriodsInWindow(
  load: RoadmapLoad,
  itemEffortByRoleForItem: Map<string, number>,
  window: { startPeriod: number; periodCount: number }
): number[] {
  if (window.periodCount <= 0 || itemEffortByRoleForItem.size === 0) return [];
  const roles = Array.from(itemEffortByRoleForItem.keys());
  const periods: number[] = [];
  for (let p = window.startPeriod; p < window.startPeriod + window.periodCount; p++) {
    const over = roles.some((role) => variance(load, 'role', role, p) > 1e-9);
    if (over) periods.push(p);
  }
  return periods;
}

export interface LoadContributor {
  source: 'item' | 'phase-baseline';
  /** A roadmap item id, or -1 for the synthetic phase-baseline bucket. */
  id: number;
  name: string;
  hours: number;
}

function rolesForDiscipline(load: RoadmapLoad, discipline: string): string[] {
  const roles: string[] = [];
  load.roleDiscipline.forEach((d, role) => {
    if (d === discipline) roles.push(role);
  });
  return roles;
}

/**
 * The load strip's per-period popover (CAP-9): every roadmap item (and the
 * phase-baseline bucket, when unplaced effort contributes) producing demand
 * for `key`/`period`, largest first. In discipline mode this sums every role
 * that resolves to that discipline.
 */
export function contributorsForPeriod(
  load: RoadmapLoad,
  items: readonly RoadmapLoadItemInput[],
  dimension: RoadmapLoadDimension,
  key: string,
  period: number
): LoadContributor[] {
  const roles = dimension === 'discipline' ? rolesForDiscipline(load, key) : [key];
  const contributors: LoadContributor[] = [];

  items.forEach((item) => {
    const dist = load.itemDistributions.get(item.id);
    if (!dist) return;
    const hours = roles.reduce((sum, role) => sum + (dist.get(period)?.get(role) ?? 0), 0);
    if (hours > 1e-9) contributors.push({ source: 'item', id: item.id, name: item.name, hours });
  });

  const baselineHours = roles.reduce((sum, role) => sum + (load.phaseBaseline.get(period)?.get(role) ?? 0), 0);
  if (baselineHours > 1e-9) {
    contributors.push({ source: 'phase-baseline', id: -1, name: 'Unplaced effort (phase baseline)', hours: baselineHours });
  }

  return contributors.sort((a, b) => b.hours - a.hours);
}

// ---------------------------------------------------------------------------
// By-period matrix (CAP-10) — ReconciliationPanel's roles/disciplines x
// periods section. Pure aggregation over the same engine output the load
// strip and bar stripe read, so the three can never disagree.
// ---------------------------------------------------------------------------

export interface ByPeriodCell {
  demand: number;
  supply: number;
  variance: number;
}

export interface ByPeriodMatrixRow {
  key: string;
  cells: ByPeriodCell[]; // aligned with ByPeriodMatrix.periods
  total: ByPeriodCell;
}

export interface ByPeriodMatrix {
  periods: number[];
  rows: ByPeriodMatrixRow[];
  /** Column sums per period AND the grand total — note its `supply` figure is
   * a sum of whatever rows are shown, so it can legitimately differ between
   * role and discipline dimension (see the module doc comment's supply-matching
   * simplification): role mode's discipline-fallback can lend the same pool
   * of hours to more than one role, discipline mode never does. */
  totalRow: ByPeriodMatrixRow;
}

function cellVariance(demand: number, supply: number): ByPeriodCell {
  return { demand, supply, variance: demand - supply };
}

export function buildByPeriodMatrix(load: RoadmapLoad, dimension: RoadmapLoadDimension): ByPeriodMatrix {
  const periods = Array.from({ length: load.np }, (_, i) => i + 1);
  const keys = roadmapLoadKeys(load, dimension);

  const rows: ByPeriodMatrixRow[] = keys.map((key) => {
    let totalDemand = 0;
    let totalSupply = 0;
    const cells = periods.map((p) => {
      const demand = demandHours(load, dimension, key, p);
      const supply = supplyHours(load, dimension, key, p);
      totalDemand += demand;
      totalSupply += supply;
      return cellVariance(demand, supply);
    });
    return { key, cells, total: cellVariance(totalDemand, totalSupply) };
  });

  const totalCells = periods.map((_, i) => {
    const demand = rows.reduce((sum, row) => sum + row.cells[i].demand, 0);
    const supply = rows.reduce((sum, row) => sum + row.cells[i].supply, 0);
    return cellVariance(demand, supply);
  });
  const totalRow: ByPeriodMatrixRow = {
    key: 'Total',
    cells: totalCells,
    total: cellVariance(
      rows.reduce((sum, row) => sum + row.total.demand, 0),
      rows.reduce((sum, row) => sum + row.total.supply, 0)
    ),
  };

  return { periods, rows, totalRow };
}
