/**
 * The roadmap's pure logic: link inheritance, scope/effort, coverage,
 * bootstrap and the period<->calendar adapters. No React, no DOM — see
 * `_bmad-output/specs/spec-roadmap/data-model.md` for the frozen contract.
 *
 * "Leaf" below follows the spec's usage, not tree topology: it means "a WBS
 * node's OWN estimate rows", exactly the unit `rollupHours`/`buildReconciliationReport`
 * already use (a node with children can still carry its own hours). Nothing
 * here re-derives phase or WBS-tree logic — see the imports.
 */
import { Phase, WbsItem } from '../services/api';
import { buildWbsTree, effectivePhases, rollupHours, WbsTreeNode } from './wbsTree';
import { getPhaseForPeriod, phaseStartOffset, remapPeriodNumber } from './phases';

// ---------------------------------------------------------------------------
// Link inheritance
// ---------------------------------------------------------------------------

/** A direct link row: "this WBS node is delivered by that roadmap item." */
export interface RoadmapLinkRecord {
  wbsItemId: number;
  roadmapItemId: number;
}

export interface EffectiveRoadmapItem {
  /** The roadmap item in force for this node, or `null` when nothing above it links either. */
  roadmapItemId: number | null;
  /** True when `roadmapItemId` came from an ancestor rather than this node's own link. */
  inherited: boolean;
}

/**
 * Resolve link inheritance over a forest: a node's effective roadmap item is
 * its own link if it has one, otherwise its nearest linked ancestor's,
 * otherwise `null`. Modelled exactly on `effectivePhases` in `wbsTree.ts`.
 */
export function effectiveRoadmapItems(
  tree: WbsTreeNode[],
  links: readonly RoadmapLinkRecord[]
): Map<number, EffectiveRoadmapItem> {
  const ownLink = new Map<number, number>(links.map((l) => [l.wbsItemId, l.roadmapItemId]));
  const resolved = new Map<number, EffectiveRoadmapItem>();
  const seen = new Set<number>();

  const walk = (nodes: WbsTreeNode[], inherited: number | null) => {
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const own = ownLink.get(node.id) ?? null;
      const roadmapItemId = own ?? inherited;
      resolved.set(node.id, { roadmapItemId, inherited: own === null && roadmapItemId !== null });
      walk(node.children, roadmapItemId);
    }
  };
  walk(tree, null);
  return resolved;
}

/**
 * WBS node ids whose effective roadmap item is `itemId` — "the scope" of that
 * item. Walks the whole forest, not just direct links, so an inherited
 * subtree (minus anything carved out by a deeper link) is included.
 */
export function scopeLeaves(
  itemId: number,
  tree: WbsTreeNode[],
  effective: Map<number, EffectiveRoadmapItem>
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const walk = (nodes: WbsTreeNode[]) => {
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      if (effective.get(node.id)?.roadmapItemId === itemId) ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

/**
 * An item's effort by role: sum of `WbsEstimate.hours` over its scope,
 * grouped by `role`. Deliberately NOT `rollupHours` on the linked node
 * directly — that would include descendants carved out by a deeper link.
 * Parents contribute nothing of their own unless they carry estimates.
 */
export function itemEffort(
  itemId: number,
  items: WbsItem[],
  tree: WbsTreeNode[],
  effective: Map<number, EffectiveRoadmapItem>
): Map<string, number> {
  const scopeIds = new Set(scopeLeaves(itemId, tree, effective));
  const byId = new Map(items.map((i) => [i.id, i]));
  const totals = new Map<string, number>();
  scopeIds.forEach((id) => {
    const item = byId.get(id);
    if (!item) return;
    item.estimates.forEach((e) => {
      totals.set(e.role, (totals.get(e.role) ?? 0) + e.hours);
    });
  });
  return totals;
}

/** Sum of `itemEffort`'s per-role hours — the single number a bar label shows. */
export function totalHours(effort: Map<string, number>): number {
  let sum = 0;
  effort.forEach((h) => (sum += h));
  return sum;
}

/** Own + all descendants' hours (any discipline/role), for the bootstrap preview. */
export function subtreeHours(node: WbsTreeNode): number {
  let sum = 0;
  rollupHours(node).forEach((h) => (sum += h));
  return sum;
}

// ---------------------------------------------------------------------------
// Coverage — CAP-7
// ---------------------------------------------------------------------------

export interface CoverageRow {
  wbsItemId: number;
  hours: number;
}

export interface PhaseMismatchRow {
  roadmapItemId: number;
  wbsItemId: number;
  phaseName: string;
}

export interface CoverageReport {
  unplaced: CoverageRow[];
  unplacedHours: number;
  unplacedShare: number;
  unplaceable: CoverageRow[];
  empty: number[];
  phaseMismatch: PhaseMismatchRow[];
}

export interface CoverageRoadmapItem {
  id: number;
  kind: 'bar' | 'milestone';
  startPeriod: number;
  periodCount: number;
}

function ownHoursOf(item: WbsItem): number {
  return item.estimates.reduce((sum, e) => sum + e.hours, 0);
}

/**
 * The three coverage categories from `data-model.md`. Pure — everything it
 * needs is passed in, nothing is fetched.
 */
export function coverage(
  items: WbsItem[],
  links: readonly RoadmapLinkRecord[],
  roadmapItems: readonly CoverageRoadmapItem[],
  phases: Phase[]
): CoverageReport {
  const tree = buildWbsTree(items);
  const effective = effectiveRoadmapItems(tree, links);
  const phaseNames = new Set(phases.map((p) => p.name));
  const phaseEff = effectivePhases(tree, phaseNames);
  const byId = new Map(items.map((i) => [i.id, i]));

  let wbsTotal = 0;
  items.forEach((item) => (wbsTotal += ownHoursOf(item)));

  // --- unplaced: the highest node of each maximal unplaced subtree, with the
  // rolled-up hours of everything under it that is ALSO unplaced (a deeper
  // explicit link carves its subtree out of the sum). ---
  const unplaced: CoverageRow[] = [];
  const unplacedSeen = new Set<number>();
  const sumUnplacedSubtree = (node: WbsTreeNode): number => {
    let sum = ownHoursOf(byId.get(node.id) ?? { estimates: [] } as unknown as WbsItem);
    for (const child of node.children) {
      if (unplacedSeen.has(child.id)) continue;
      if (effective.get(child.id)?.roadmapItemId == null) {
        unplacedSeen.add(child.id);
        sum += sumUnplacedSubtree(child);
      }
    }
    return sum;
  };
  const walkForUnplaced = (nodes: WbsTreeNode[]) => {
    for (const node of nodes) {
      if (unplacedSeen.has(node.id)) continue;
      if (effective.get(node.id)?.roadmapItemId == null) {
        unplacedSeen.add(node.id);
        const hours = sumUnplacedSubtree(node);
        if (hours > 0) unplaced.push({ wbsItemId: node.id, hours });
      } else {
        unplacedSeen.add(node.id);
        walkForUnplaced(node.children);
      }
    }
  };
  walkForUnplaced(tree);
  const unplacedHours = unplaced.reduce((sum, row) => sum + row.hours, 0);
  const unplacedShare = wbsTotal > 0 ? unplacedHours / wbsTotal : 0;

  // --- unplaceable: node-level (not subtree-rolled), own hours>0, no effective
  // item AND no effective phase either. ---
  const unplaceable: CoverageRow[] = [];
  items.forEach((item) => {
    const hours = ownHoursOf(item);
    if (hours <= 0) return;
    const eff = effective.get(item.id);
    const phase = phaseEff.get(item.id);
    if ((eff?.roadmapItemId ?? null) === null && (phase?.phaseName ?? null) === null) {
      unplaceable.push({ wbsItemId: item.id, hours });
    }
  });

  // --- empty: bars (not milestones) with no scope leaves at all. ---
  const empty: number[] = roadmapItems
    .filter((ri) => ri.kind !== 'milestone')
    .filter((ri) => scopeLeaves(ri.id, tree, effective).length === 0)
    .map((ri) => ri.id);

  // --- phaseMismatch: an item's window shares no period with the effective
  // phase of a linked leaf (own hours > 0, so a phase-less structural node
  // never triggers noise). ---
  const itemById = new Map(roadmapItems.map((ri) => [ri.id, ri]));
  const phaseMismatch: PhaseMismatchRow[] = [];
  items.forEach((item) => {
    if (ownHoursOf(item) <= 0) return;
    const eff = effective.get(item.id);
    if (eff?.roadmapItemId == null) return;
    const roadmapItem = itemById.get(eff.roadmapItemId);
    if (roadmapItem === undefined || roadmapItem.kind === 'milestone') return;
    const phase = phaseEff.get(item.id);
    if (phase?.phaseName == null) return;
    const phaseIndex = phases.findIndex((p) => p.name === phase.phaseName);
    if (phaseIndex < 0) return;
    const phaseStart = phaseStartOffset(phases, phaseIndex) + 1;
    const phaseEnd = phaseStart + (phases[phaseIndex].periodCount ?? 0) - 1;
    const itemStart = roadmapItem.startPeriod;
    const itemEnd = roadmapItem.startPeriod + Math.max(0, roadmapItem.periodCount) - 1;
    const overlaps = phaseStart <= itemEnd && itemStart <= phaseEnd;
    if (!overlaps) {
      phaseMismatch.push({ roadmapItemId: roadmapItem.id, wbsItemId: item.id, phaseName: phase.phaseName });
    }
  });

  return { unplaced, unplacedHours, unplacedShare, unplaceable, empty, phaseMismatch };
}

// ---------------------------------------------------------------------------
// Bootstrap — CAP-12
// ---------------------------------------------------------------------------

export interface BootstrapItemPreview {
  name: string;
  startPeriod: number;
  periodCount: number;
  /** The single direct link this item gets on apply — its subtree follows by inheritance. */
  wbsItemIds: number[];
  hours: number;
  phaseName: string | null;
  /** True when the node has no effective phase: the item spans the whole project instead. */
  flagged: boolean;
}

export interface BootstrapLanePreview {
  name: string;
  items: BootstrapItemPreview[];
}

export interface BootstrapPreview {
  lanes: BootstrapLanePreview[];
}

function projectPeriodCount(phases: Phase[]): number {
  const total = phases.reduce((sum, p) => sum + (p.periodCount ?? p.weekCount ?? 0), 0);
  return total > 0 ? total : 1;
}

/** Window (startPeriod, periodCount) for a node's effective phase, or a whole-project span when it has none. */
function windowFor(
  node: WbsTreeNode,
  phaseEff: Map<number, { phaseName: string | null }>,
  phases: Phase[],
  npTotal: number
): { startPeriod: number; periodCount: number; phaseName: string | null; flagged: boolean } {
  const phaseName = phaseEff.get(node.id)?.phaseName ?? null;
  const phaseIndex = phaseName === null ? -1 : phases.findIndex((p) => p.name === phaseName);
  if (phaseIndex < 0) {
    return { startPeriod: 1, periodCount: npTotal, phaseName: null, flagged: true };
  }
  const startPeriod = phaseStartOffset(phases, phaseIndex) + 1;
  const periodCount = Math.max(1, phases[phaseIndex].periodCount ?? 0);
  return { startPeriod, periodCount, phaseName, flagged: false };
}

/**
 * Preview a roadmap built from the WBS: depth-0 nodes become lanes; a
 * depth-0 node WITH children gets one item per depth-1 child (linked to
 * itself, subtree follows by inheritance); a CHILDLESS depth-0 node (a
 * "depth-0 leaf") becomes a lane holding one same-named item linked to
 * itself. Either way, every item is windowed to its own effective phase, or
 * spans the whole project and is flagged when it has none. Pure and
 * previewable — nothing is written here.
 */
export function bootstrapRoadmap(items: WbsItem[], phases: Phase[]): BootstrapPreview {
  const tree = buildWbsTree(items);
  const phaseNames = new Set(phases.map((p) => p.name));
  const phaseEff = effectivePhases(tree, phaseNames);
  const npTotal = projectPeriodCount(phases);
  const byId = new Map(items.map((i) => [i.id, i]));

  const toItemPreview = (node: WbsTreeNode): BootstrapItemPreview => {
    const win = windowFor(node, phaseEff, phases, npTotal);
    const hours = subtreeHours(node);
    return {
      name: (byId.get(node.id) ?? node).name,
      startPeriod: win.startPeriod,
      periodCount: win.periodCount,
      wbsItemIds: [node.id],
      hours,
      phaseName: win.phaseName,
      flagged: win.flagged,
    };
  };

  const lanes: BootstrapLanePreview[] = tree.map((root) => {
    if (root.children.length === 0) {
      return { name: root.name, items: [toItemPreview(root)] };
    }
    return { name: root.name, items: root.children.map(toItemPreview) };
  });

  return { lanes };
}

// ---------------------------------------------------------------------------
// Calendar adapters
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date a period STARTS on, given `Project.startDate` anchors period 1. `null` startDate -> `null` (ordinals only). */
export function periodToDate(
  period: number,
  planningMode: 'weekly' | 'monthly',
  startDate: string | null
): Date | null {
  if (startDate == null) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  if (planningMode === 'monthly') {
    const d = new Date(start);
    d.setMonth(d.getMonth() + (period - 1));
    return d;
  }
  return new Date(start.getTime() + (period - 1) * 7 * DAY_MS);
}

/** Inverse of `periodToDate` — the period a calendar date falls in. `null` startDate -> `null`. */
export function dateToPeriod(
  date: Date,
  planningMode: 'weekly' | 'monthly',
  startDate: string | null
): number | null {
  if (startDate == null) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  if (planningMode === 'monthly') {
    const months =
      (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
    return months + 1;
  }
  const days = Math.floor((date.getTime() - start.getTime()) / DAY_MS);
  return Math.floor(days / 7) + 1;
}

/** A date range snapped to whole periods, for anything that starts from calendar dates rather than periods. */
export function snapToPeriod(
  start: Date,
  end: Date,
  planningMode: 'weekly' | 'monthly',
  startDate: string | null
): { startPeriod: number; periodCount: number } | null {
  const startPeriod = dateToPeriod(start, planningMode, startDate);
  const endPeriod = dateToPeriod(end, planningMode, startDate);
  if (startPeriod === null || endPeriod === null) return null;
  const lo = Math.min(startPeriod, endPeriod);
  const hi = Math.max(startPeriod, endPeriod);
  return { startPeriod: Math.max(1, lo), periodCount: Math.max(1, hi - lo + 1) };
}

// ---------------------------------------------------------------------------
// Render rows
// ---------------------------------------------------------------------------

export interface RoadmapRowLane {
  id: number;
  name: string;
  displayOrder: number;
}

export interface RoadmapRowItem {
  id: number;
  laneId: number;
  name: string;
  kind: 'bar' | 'milestone';
  startPeriod: number;
  periodCount: number;
  displayOrder: number;
}

export interface RoadmapRow {
  kind: 'lane' | 'bar' | 'milestone';
  id: number;
  laneId: number | null;
  name: string;
  startPeriod: number;
  periodCount: number;
  hours: number;
  fte: number;
  /** True for a bar with no scope leaves at all — rendered with the "no scope" style. */
  emptyScope: boolean;
  /** Periods where demand exceeds supply for this item. Slice A always passes []. */
  overDemandPeriods: number[];
  collapsed: boolean;
}

function itemFte(hours: number, periodCount: number, hrsPerPeriod: number): number {
  if (periodCount <= 0 || hrsPerPeriod <= 0) return 0;
  return hours / (periodCount * hrsPerPeriod);
}

/**
 * The flat render list the chart draws: one row per lane (in `displayOrder`),
 * then its items (in `displayOrder`) unless the lane is collapsed. Pure —
 * the component maps this straight to DOM with no further derivation.
 */
export function toRoadmapRows(
  lanes: readonly RoadmapRowLane[],
  items: readonly RoadmapRowItem[],
  effortByItemId: Map<number, Map<string, number>>,
  collapsed: ReadonlySet<number>,
  hrsPerPeriod: number
): RoadmapRow[] {
  const rows: RoadmapRow[] = [];
  const sortedLanes = [...lanes].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  const itemsByLane = new Map<number, RoadmapRowItem[]>();
  items.forEach((item) => {
    const list = itemsByLane.get(item.laneId) ?? [];
    list.push(item);
    itemsByLane.set(item.laneId, list);
  });
  itemsByLane.forEach((list) => list.sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id));

  for (const lane of sortedLanes) {
    const laneItems = itemsByLane.get(lane.id) ?? [];
    let laneHours = 0;
    let laneFte = 0;
    const itemRows: RoadmapRow[] = laneItems.map((item) => {
      const effort = effortByItemId.get(item.id) ?? new Map<string, number>();
      const hours = totalHours(effort);
      const fte = itemFte(hours, item.periodCount, hrsPerPeriod);
      laneHours += hours;
      laneFte += fte;
      return {
        kind: item.kind,
        id: item.id,
        laneId: lane.id,
        name: item.name,
        startPeriod: item.startPeriod,
        periodCount: item.periodCount,
        hours,
        fte,
        emptyScope: item.kind === 'bar' && hours === 0,
        overDemandPeriods: [],
        collapsed: false,
      };
    });

    rows.push({
      kind: 'lane',
      id: lane.id,
      laneId: null,
      name: lane.name,
      startPeriod: 1,
      periodCount: 0,
      hours: laneHours,
      fte: laneFte,
      emptyScope: false,
      overDemandPeriods: [],
      collapsed: collapsed.has(lane.id),
    });
    if (!collapsed.has(lane.id)) rows.push(...itemRows);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Weekly <-> monthly conversion — decision 1
// ---------------------------------------------------------------------------

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface RoadmapItemWindow {
  startPeriod: number;
  periodCount: number;
}

/**
 * Scale `startPeriod`/`periodCount` weekly -> monthly exactly as
 * `convertPhasesToMonthly` scales phases: ceil coarsening. A milestone
 * (`periodCount === 0`) keeps 0 and maps `startPeriod` by boundary only.
 * Clamped into `[1, projectPeriodCountMonthly]`.
 */
export function convertRoadmapItemsToMonthly<T extends RoadmapItemWindow>(
  items: readonly T[],
  weeksPerMonth: number,
  projectPeriodCountMonthly: number
): T[] {
  const np = Math.max(1, projectPeriodCountMonthly);
  return items.map((item) => {
    const startMonth = Math.max(1, Math.ceil(item.startPeriod / weeksPerMonth));
    if (item.periodCount <= 0) {
      return { ...item, startPeriod: clampInt(startMonth, 1, np), periodCount: 0 };
    }
    const finishWeek = item.startPeriod + item.periodCount - 1;
    const finishMonth = Math.max(startMonth, Math.ceil(finishWeek / weeksPerMonth));
    const clampedStart = clampInt(startMonth, 1, np);
    const clampedFinish = clampInt(finishMonth, clampedStart, np);
    return { ...item, startPeriod: clampedStart, periodCount: clampedFinish - clampedStart + 1 };
  });
}

/**
 * Scale `startPeriod`/`periodCount` monthly -> weekly exactly as
 * `convertPhasesToWeekly` scales phases: round splitting. A milestone keeps
 * `periodCount: 0`. Clamped into `[1, projectPeriodCountWeekly]`.
 */
export function convertRoadmapItemsToWeekly<T extends RoadmapItemWindow>(
  items: readonly T[],
  weeksPerMonth: number,
  projectPeriodCountWeekly: number
): T[] {
  const np = Math.max(1, projectPeriodCountWeekly);
  return items.map((item) => {
    const startWeek = Math.max(1, Math.round((item.startPeriod - 1) * weeksPerMonth) + 1);
    if (item.periodCount <= 0) {
      return { ...item, startPeriod: clampInt(startWeek, 1, np), periodCount: 0 };
    }
    const finishWeek = Math.max(startWeek, Math.round((item.startPeriod + item.periodCount - 1) * weeksPerMonth));
    const clampedStart = clampInt(startWeek, 1, np);
    const clampedFinish = clampInt(finishWeek, clampedStart, np);
    return { ...item, startPeriod: clampedStart, periodCount: clampedFinish - clampedStart + 1 };
  });
}

// ---------------------------------------------------------------------------
// Phase reorder/split/delete remap — decision 2
// ---------------------------------------------------------------------------

/**
 * Apply a `reorderPhases`-style `periodMap` to a roadmap item's `startPeriod`
 * only; `periodCount` is preserved (mirrors the allocation remap at
 * `ResourcePlan.tsx:846-856`). An item whose window no longer overlaps any
 * phase is kept as-is — it is never clamped or dropped here; it surfaces via
 * `coverage`'s `phaseMismatch` instead.
 */
export function remapRoadmapItemsForPhaseChange<T extends { startPeriod: number }>(
  items: readonly T[],
  periodMap: Map<number, number>
): T[] {
  return items.map((item) => ({ ...item, startPeriod: remapPeriodNumber(periodMap, item.startPeriod) }));
}

// Re-export so consumers don't need a second import for the one phase helper
// this file leans on for windowing.
export { getPhaseForPeriod };
