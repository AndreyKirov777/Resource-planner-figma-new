/**
 * The WBS grid's model layer: everything the grid *shows* and everything an
 * edit *means*, with no dependency on `@glideapps/glide-data-grid` and no
 * React. `Wbs.tsx` is a thin adapter over this file.
 *
 * The split is deliberate: the grid draws into a canvas, so cells are
 * unreachable from Testing Library. Any derivation or commit rule left inside
 * the component would be permanently untestable, so all of it lives here.
 */
import { WbsItem, WbsEstimate, RateCard as RateCardType, ResourceList as ResourceListType } from '../services/api';
import {
  buildWbsTree,
  flattenVisibleTree,
  rollupHours,
  descendantIds,
  outlineNumbers,
  effectivePhases,
  wouldCreateCycle,
} from './wbsTree';
import { resolveDiscipline } from './wbs';

/** One role x hours pair on a WBS item — the unit the composite Roles cell edits. */
export interface RolePair {
  role: string;
  discipline: string;
  hours: number;
}

/** One rendered grid row: everything the five columns need, already derived. */
export interface WbsGridRow {
  id: number;
  /** Outline number from tree position (`1`, `1.2.1`). Never persisted. */
  outline: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  /**
   * This row's OWN phase, or `null` when it has none or names a phase that no
   * longer exists. This — never the raw `phaseName` — is what the phase picker
   * shows, so its current value is always one of its own options.
   */
  ownPhaseName: string | null;
  /** The phase actually in force (own, or inherited from the nearest ancestor). */
  phaseName: string | null;
  /** True when `phaseName` came from an ancestor — rendered de-emphasised. */
  phaseInherited: boolean;
  /**
   * True when the item stores a `phaseName` that names no live project phase.
   * `ownPhaseName` is `null` in that case, so this flag is the only thing that
   * still distinguishes "never set" from "set to something dead" — which is
   * what lets a stale value actually be cleared. See `phaseEditFor`.
   */
  phaseStale: boolean;
  /** This row's own role x hours pairs (not descendants'). */
  pairs: RolePair[];
  /** Own + all descendants' hours, all roles merged. Never persisted. */
  totalHours: number;
  /** Depth-0 rows read as document sections and get their own row theme. */
  isSection: boolean;
}

/**
 * Format hours for display: at most one decimal place.
 *
 * Single source of truth for both the grid and `ReconciliationPanel`, so a
 * rollup of many floating-point terms can't render as `0.30000000000000004`
 * in one place and `0.3` in the other.
 */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  return hours.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** A WBS item's own estimates as role x hours pairs. */
export function pairsFromEstimates(estimates: WbsEstimate[]): RolePair[] {
  return estimates.map((estimate) => ({
    role: estimate.role,
    discipline: estimate.discipline,
    hours: estimate.hours,
  }));
}

/** Role x hours pairs as a `replaceWbsEstimates` payload (the item's FULL set). */
export function pairsToPayload(pairs: RolePair[]): Partial<WbsEstimate>[] {
  return pairs.map((pair) => ({ discipline: pair.discipline, role: pair.role, hours: pair.hours }));
}

/**
 * Hours as a plain, locale-independent string for a text input. Deliberately
 * NOT `formatHours`: `toLocaleString` can emit a comma decimal separator,
 * which `parseHours` would then reject when the untouched value is committed.
 */
export function formatHoursInput(hours: number): string {
  if (!Number.isFinite(hours)) return '';
  return String(Math.round(hours * 10) / 10);
}

/**
 * A pair's user-facing name. Falls back to the discipline for estimates
 * written by the pre-redesign matrix, which persisted `role: ''`.
 */
export function pairDisplayName(pair: RolePair): string {
  return pair.role.trim() === '' ? pair.discipline : pair.role;
}

/**
 * A stable React/draft key for one pair. `role` alone is not unique: the
 * pre-redesign matrix wrote one `(discipline, role: '')` row per discipline,
 * so several of an item's pairs can share an empty role. JSON-encoding both
 * fields keeps the key unambiguous and plain text.
 */
export function pairKey(pair: RolePair): string {
  return JSON.stringify([pair.discipline, pair.role]);
}

/** The label for one role chip. */
export function pairLabel(pair: RolePair): string {
  return `${pairDisplayName(pair)} ${MULTIPLY_SIGN}${formatHours(pair.hours)}`;
}

// Written as an escape rather than the literal glyph: this file must stay
// plain, reviewable text (see the spec's iteration-1 note on a stray NUL byte).
export const MULTIPLY_SIGN = '\u00d7';

/**
 * A row's Roles cell as plain text (chips joined) — the cell's `copyData`, and
 * what the harness tests read.
 */
export function pairsSummary(pairs: RolePair[]): string {
  return pairs.map(pairLabel).join(', ');
}

/**
 * The discipline for a role, taken from the rate-card row the role came from,
 * so it can never drift from the card (which is what keeps the server's
 * `validWbsDisciplines` check and per-discipline reconciliation working).
 *
 * With an EMPTY rate card nothing resolves, but `wbsEstimateSchema` requires a
 * non-empty discipline, so the role itself is used — the only non-arbitrary
 * value available, and accepted by the server's own empty-card bypass.
 *
 * That fallback is ONLY ever valid for a genuinely empty card. The server's
 * bypass in `validWbsDisciplines` keys off the rate-card table being empty, so
 * a typed-role discipline against a non-empty card is rejected 400 every time.
 * The editor therefore offers free text only when BOTH the resource list and
 * the rate card are empty — not merely when `availableRoles` is, which also
 * happens when every list role is already on the item, or when a populated
 * card maps none of them.
 */
export function deriveDiscipline(role: string, rateCards: RateCardType[]): string {
  return resolveDiscipline(role, rateCards) || role;
}

/** Every distinct, non-empty role the rate card names, alphabetised. */
export function rateCardRoles(rateCards: RateCardType[]): string[] {
  return distinctRoles(rateCards);
}

/**
 * Every distinct, non-empty role the project's resource list names, alphabetised.
 *
 * Duplicate list rows (same role, different location/rate) collapse to one
 * string — WBS stores a role, not a list `id`.
 */
export function resourceListRoles(resourceLists: ResourceListType[]): string[] {
  return distinctRoles(resourceLists);
}

function distinctRoles(rows: { role: string }[]): string[] {
  const roles = new Set(
    rows.map((row) => row.role).filter((role): role is string => !!role && role.trim() !== '')
  );
  return Array.from(roles).sort((a, b) => a.localeCompare(b));
}

/**
 * Roles the overlay Select may offer: distinct resource-list roles, minus any
 * already on the item. When the rate card is non-empty, also drop list roles
 * that `resolveDiscipline` cannot map — those writes would 400.
 */
export function availableRoles(
  resourceLists: ResourceListType[],
  taken: RolePair[],
  rateCards: RateCardType[]
): string[] {
  const used = new Set(taken.map((pair) => pair.role));
  const cardEmpty = rateCardRoles(rateCards).length === 0;
  return resourceListRoles(resourceLists).filter((role) => {
    if (used.has(role)) return false;
    // Falsy (undefined or '') is not a usable mapping — `deriveDiscipline`
    // would fall back to the role string and a non-empty card would 400.
    if (!cardEmpty && !resolveDiscipline(role, rateCards)) return false;
    return true;
  });
}

/**
 * Free-text is accepted by the server only when the rate card is empty. An
 * empty roster with a populated card must not open that input — it would 400.
 */
export function rolesUseFreeText(
  resourceLists: ResourceListType[],
  rateCards: RateCardType[]
): boolean {
  return resourceListRoles(resourceLists).length === 0 && rateCardRoles(rateCards).length === 0;
}

/**
 * The single pass that turns server state into rendered rows: tree assembly,
 * outline numbering, phase inheritance, role pairs and the hours rollup.
 *
 * `phaseNames` are the project's live phase names; a row naming any other
 * phase is treated as unset (see `effectivePhases`).
 */
export function buildGridRows(
  items: WbsItem[],
  collapsedIds: Set<number>,
  phaseNames: readonly string[]
): WbsGridRow[] {
  const tree = buildWbsTree(items);
  const outlines = outlineNumbers(tree);
  const phases = effectivePhases(tree, phaseNames);
  const livePhaseNames = new Set(phaseNames);

  return flattenVisibleTree(tree, collapsedIds).map(({ node, depth, hasChildren }) => {
    const effective = phases.get(node.id) ?? { phaseName: null, inherited: false };
    const ownPhaseName =
      node.phaseName != null && livePhaseNames.has(node.phaseName) ? node.phaseName : null;

    let totalHours = 0;
    rollupHours(node).forEach((hours) => {
      totalHours += hours;
    });

    return {
      id: node.id,
      outline: outlines.get(node.id) ?? '',
      name: node.name,
      depth,
      hasChildren,
      collapsed: hasChildren && collapsedIds.has(node.id),
      ownPhaseName,
      phaseStale: node.phaseName != null && !livePhaseNames.has(node.phaseName),
      phaseName: effective.phaseName,
      phaseInherited: effective.inherited,
      pairs: pairsFromEstimates(node.estimates),
      totalHours,
      isSection: depth === 0,
    };
  });
}

/** The label the Phase cell paints: the effective phase, or `Unassigned`. */
export function phaseLabel(row: Pick<WbsGridRow, 'phaseName'>): string {
  return row.phaseName ?? UNASSIGNED_PHASE_LABEL;
}

export const UNASSIGNED_PHASE_LABEL = 'Unassigned';

/**
 * Parsed hours. Blank and unparseable are deliberately DIFFERENT outcomes:
 * blank means "no hours" (`0`), anything unparseable reverts without a
 * request. `<input type="number">` cannot express that distinction — it
 * reports `''` for `1e`, `1.2.3`, `-`, `1,5` and pasted text alike — which is
 * why the editors use text inputs and validate the raw string here.
 */
export type ParsedHours = { ok: true; hours: number } | { ok: false };

// Plain decimal only: no sign, no exponent, no thousands separator, no NaN/Infinity.
const HOURS_PATTERN = /^(\d+(\.\d*)?|\.\d+)$/;

/**
 * Upper bound on one pair's hours. Every accepted value must survive
 * `formatHoursInput` and parse again, or an edit that was accepted once fails
 * on its very next commit: `String()` switches to exponent form (`1e+21`) for
 * large magnitudes, and `parseHours` rejects exponents. A million hours is
 * roughly five hundred person-years — far past anything a WBS row can mean.
 */
export const MAX_HOURS = 1_000_000;

export function parseHours(raw: string): ParsedHours {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, hours: 0 };
  if (!HOURS_PATTERN.test(trimmed)) return { ok: false };
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0 || hours > MAX_HOURS) return { ok: false };
  return { ok: true, hours };
}

/**
 * Tolerance for "these hours are the same". `replaceWbsEstimates` is a full
 * delete-and-recreate, so a no-op edit must not issue one — and hours are
 * displayed rounded, so a stored `0.30000000000000004` reads as `0.3` and
 * comes back from the input as exactly `0.3`. Comparing with `===` turns
 * re-committing an untouched field into a real write.
 */
export const HOURS_EPSILON = 1e-6;

export function sameHours(a: number, b: number): boolean {
  return Math.abs(a - b) < HOURS_EPSILON;
}

/** Two pair sets carry the same estimates, in the same order. */
export function samePairs(a: RolePair[], b: RolePair[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (pair, i) =>
        pair.role === b[i].role &&
        pair.discipline === b[i].discipline &&
        sameHours(pair.hours, b[i].hours)
    )
  );
}

/**
 * The `updateWbsItem` payload for a name edit, or `null` when the edit is a
 * no-op or blank — blank reverts without a request, per the edge-case matrix.
 */
export function nameEditFor(row: Pick<WbsGridRow, 'name'>, raw: string): { name: string } | null {
  const name = raw.trim();
  if (name === '' || name === row.name) return null;
  return { name };
}

/**
 * The `updateWbsItem` payload for a phase edit, or `null` when nothing
 * changed. Compares against the row's OWN phase: picking the value a row
 * merely inherits is a real change (it pins the phase locally), and picking
 * Unassigned on a row that only inherits is not.
 *
 * A STALE stored value is the exception. It reads as `null` everywhere else,
 * so comparing the pick against `ownPhaseName` would make "Unassigned" a no-op
 * on exactly the rows that need clearing — the dead name would sit in the DB
 * forever and silently reattach if a phase of that name were ever recreated.
 * Any pick on such a row therefore issues a write.
 */
export function phaseEditFor(
  row: Pick<WbsGridRow, 'ownPhaseName' | 'phaseStale'>,
  selected: string | null
): { phaseName: string | null } | null {
  if (selected === row.ownPhaseName && !row.phaseStale) return null;
  return { phaseName: selected };
}

/**
 * Drop collapsed ids whose item no longer exists. Ids are recycled by the
 * database, so a stale entry would silently start a brand-new row collapsed.
 * Returns the SAME set when nothing changed, so it is safe to use directly as
 * a `setState` updater without causing a render loop.
 */
export function pruneCollapsedIds(collapsed: Set<number>, items: WbsItem[]): Set<number> {
  if (collapsed.size === 0) return collapsed;
  const live = new Set(items.map((item) => item.id));
  const next = new Set<number>();
  collapsed.forEach((id) => {
    if (live.has(id)) next.add(id);
  });
  return next.size === collapsed.size ? collapsed : next;
}

/** Next sibling `displayOrder` — the API does not auto-increment it. */
export function nextDisplayOrder(items: WbsItem[], parentId: number | null): number {
  return items
    .filter((item) => item.parentId === parentId)
    .reduce((max, item) => Math.max(max, item.displayOrder), -1) + 1;
}

export interface DisplayOrderShift {
  id: number;
  displayOrder: number;
}

/** Insert a new sibling immediately after `after`, bumping later siblings. */
export interface InsertAfterPlacement {
  parentId: number | null;
  displayOrder: number;
  shifts: DisplayOrderShift[];
}

function siblingsOf(items: WbsItem[], parentId: number | null): WbsItem[] {
  return items
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
}

function insertAfter(items: WbsItem[], after: WbsItem): InsertAfterPlacement {
  const siblings = siblingsOf(items, after.parentId);
  const afterIndex = siblings.findIndex((sibling) => sibling.id === after.id);
  const later = afterIndex === -1 ? [] : siblings.slice(afterIndex + 1);
  return {
    parentId: after.parentId,
    displayOrder: after.displayOrder + 1,
    shifts: later.map((sibling) => ({ id: sibling.id, displayOrder: sibling.displayOrder + 1 })),
  };
}

function insertBefore(items: WbsItem[], target: WbsItem): InsertAfterPlacement {
  const siblings = siblingsOf(items, target.parentId);
  const targetIndex = siblings.findIndex((sibling) => sibling.id === target.id);
  const later = targetIndex === -1 ? [] : siblings.slice(targetIndex);
  return {
    parentId: target.parentId,
    displayOrder: target.displayOrder,
    shifts: later.map((sibling) => ({ id: sibling.id, displayOrder: sibling.displayOrder + 1 })),
  };
}

export type DropZone = 'before' | 'after' | 'child' | 'first-child';

/**
 * Pointer Y inside a hovered row → drop zone. Top/middle thirds are always
 * sibling-before / nest-as-last-child. The bottom third is sibling-after on a
 * leaf or collapsed row, otherwise the gap before the first visible child.
 */
export function dropZone(
  yInRow: number,
  rowHeight: number,
  targetHasVisibleChildren: boolean
): DropZone {
  const height = rowHeight <= 0 ? 1 : rowHeight;
  const t = yInRow / height;
  if (t < 1 / 3) return 'before';
  if (t < 2 / 3) return 'child';
  return targetHasVisibleChildren ? 'first-child' : 'after';
}

function withoutDragged(shifts: DisplayOrderShift[], draggedId: number): DisplayOrderShift[] {
  return shifts.filter((shift) => shift.id !== draggedId);
}

/**
 * Tree-aware placement for a drag. Only the dragged node is rewritten;
 * destination later siblings are bumped. Source siblings are left with gaps.
 */
function isAlreadyThere(items: WbsItem[], dragged: WbsItem, target: WbsItem, zone: DropZone): boolean {
  const destParentId = zone === 'child' || zone === 'first-child' ? target.id : target.parentId;
  const destSiblings = siblingsOf(items, destParentId);
  const draggedIndex = destSiblings.findIndex((sibling) => sibling.id === dragged.id);
  const targetIndex = destSiblings.findIndex((sibling) => sibling.id === target.id);
  if (draggedIndex < 0) return false;
  switch (zone) {
    case 'before':
      return dragged.parentId === target.parentId && draggedIndex === targetIndex - 1;
    case 'after':
      return dragged.parentId === target.parentId && draggedIndex === targetIndex + 1;
    case 'child':
      return dragged.parentId === target.id && draggedIndex === destSiblings.length - 1;
    case 'first-child':
      return dragged.parentId === target.id && draggedIndex === 0;
  }
}

export function dropPlacement(
  items: WbsItem[],
  draggedId: number,
  targetId: number,
  zone: DropZone
): InsertAfterPlacement | null {
  if (draggedId === targetId) return null;
  const dragged = items.find((item) => item.id === draggedId);
  const target = items.find((item) => item.id === targetId);
  if (dragged === undefined || target === undefined) return null;
  if (descendantIds(items, draggedId).includes(targetId)) return null;
  if (isAlreadyThere(items, dragged, target, zone)) return null;

  let placed: InsertAfterPlacement;
  switch (zone) {
    case 'before':
      placed = insertBefore(items, target);
      break;
    case 'after':
      placed = insertAfter(items, target);
      break;
    case 'child':
      placed = {
        parentId: target.id,
        displayOrder: nextDisplayOrder(items, target.id),
        shifts: [],
      };
      break;
    case 'first-child': {
      const firstChild = siblingsOf(items, target.id)[0];
      placed =
        firstChild === undefined
          ? { parentId: target.id, displayOrder: nextDisplayOrder(items, target.id), shifts: [] }
          : insertBefore(items, firstChild);
      break;
    }
  }

  if (wouldCreateCycle(items, draggedId, placed.parentId)) return null;
  if (dragged.parentId === placed.parentId && dragged.displayOrder === placed.displayOrder) return null;
  return { ...placed, shifts: withoutDragged(placed.shifts, draggedId) };
}

/** Create-payload fields shared by add-root / add-child / add-sibling. */
export function newWbsItemFields(
  parentId: number | null,
  displayOrder: number
): { name: string; parentId: number | null; phaseName: null; displayOrder: number } {
  return { name: 'New item', parentId, phaseName: null, displayOrder };
}

/** First id in `current` that was not in `seen`. Used to select a just-created row. */
export function firstUnseenId(seen: ReadonlySet<number>, current: readonly number[]): number | undefined {
  return current.find((id) => !seen.has(id));
}

/**
 * After deleting `deletedId` (cascade includes descendants), the visible row
 * that should keep keyboard focus: nearest survivor above, else nearest below.
 */
export function selectionAfterDelete(
  visibleIds: readonly number[],
  items: WbsItem[],
  deletedId: number
): number | undefined {
  const gone = new Set([deletedId, ...descendantIds(items, deletedId)]);
  const index = visibleIds.indexOf(deletedId);
  if (index < 0) return undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (!gone.has(visibleIds[i])) return visibleIds[i];
  }
  for (let i = index + 1; i < visibleIds.length; i++) {
    if (!gone.has(visibleIds[i])) return visibleIds[i];
  }
  return undefined;
}

/** Place a new sibling immediately below `afterId` (same parent). */
export function siblingBelowPlacement(items: WbsItem[], afterId: number): InsertAfterPlacement | null {
  const after = items.find((item) => item.id === afterId);
  if (after === undefined) return null;
  return insertAfter(items, after);
}

/** Reparent `id` as the last child of its previous sibling, or `null` if none. */
export function indentPlacement(
  items: WbsItem[],
  id: number
): { parentId: number; displayOrder: number } | null {
  const current = items.find((item) => item.id === id);
  if (current === undefined) return null;
  const siblings = siblingsOf(items, current.parentId);
  const index = siblings.findIndex((sibling) => sibling.id === id);
  if (index <= 0) return null;
  const previous = siblings[index - 1];
  return { parentId: previous.id, displayOrder: nextDisplayOrder(items, previous.id) };
}

/** Reparent `id` as the next sibling after its current parent, or `null` on a root. */
export function outdentPlacement(items: WbsItem[], id: number): InsertAfterPlacement | null {
  const current = items.find((item) => item.id === id);
  if (current === undefined || current.parentId == null) return null;
  const parent = items.find((item) => item.id === current.parentId);
  if (parent === undefined) return null;
  return insertAfter(items, parent);
}

export type StructureAction = 'addChild' | 'addSibling' | 'indent' | 'outdent' | 'delete';

/** Map a Glide key event to a structure action. `null` while an overlay owns keys. */
export function structureActionFromKey(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  overlayOpen: boolean
): StructureAction | null {
  if (overlayOpen) return null;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return 'addChild';
  if (event.key === 'Enter') return 'addSibling';
  if (event.key === 'Tab' && event.shiftKey) return 'outdent';
  if (event.key === 'Tab') return 'indent';
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
  return null;
}

export function isMacPlatform(platform = typeof navigator !== 'undefined' ? navigator.platform : ''): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function structureShortcutLabel(action: StructureAction, isMac: boolean): string {
  switch (action) {
    case 'addChild':
      return isMac ? '\u2318\u21b5' : 'Ctrl+Enter';
    case 'addSibling':
      return '\u21b5';
    case 'indent':
      return '\u21e5';
    case 'outdent':
      return '\u21e7\u21e5';
    case 'delete':
      return '\u232b';
  }
}

export function structureHintText(isMac: boolean): string {
  const child = isMac ? '\u2318Enter' : 'Ctrl+Enter';
  return `Enter sibling \u00b7 ${child} child \u00b7 Tab indent \u00b7 \u21e7Tab outdent \u00b7 \u232b delete \u00b7 drag to move`;
}

/** Side of the ⋮ hit box on the Task Description cell. */
export const KEBAB_SIZE = 16;

export function kebabLeft(cellWidth: number): number {
  return Math.max(CELL_PAD, cellWidth - CELL_PAD - KEBAB_SIZE);
}

export function hitsKebab(
  cellWidth: number,
  cellHeight: number,
  posX: number,
  posY: number
): boolean {
  const left = kebabLeft(cellWidth);
  const top = (cellHeight - KEBAB_SIZE) / 2;
  return posX >= left && posX <= left + KEBAB_SIZE && posY >= top && posY <= top + KEBAB_SIZE;
}

/** Delete confirmation naming the subtree size — the DB cascade is silent. */
export function deleteConfirmMessage(items: WbsItem[], id: number, name: string): string {
  const count = descendantIds(items, id).length;
  if (count === 0) return `Delete "${name}"? This cannot be undone.`;
  return `Delete "${name}" and its ${count} descendant item${count === 1 ? '' : 's'}? This cannot be undone.`;
}

/**
 * Serializes `replaceWbsEstimates` writes per WBS item and hands each new edit
 * the previous in-flight edit's result as its merge basis.
 *
 * `replaceWbsEstimates` is a full delete-then-recreate of an item's estimate
 * set, so two quick edits on one row that each merge against the same
 * last-rendered snapshot silently clobber one another. `basisFor` closes the
 * stale-snapshot half, the promise chain closes the ordering half.
 *
 * MUST be created once per grid and passed to the overlay editor as a prop:
 * the overlay unmounts on every close, so an editor-owned committer would
 * reset the chain and reopen the very race it exists to close.
 */
export interface EstimateCommitter {
  /**
   * The pairs a new edit should build on: the last in-flight edit's result if
   * one is still settling, otherwise the caller's own (server-backed) pairs.
   */
  basisFor(itemId: number, fallback: RolePair[]): RolePair[];
  /**
   * Queue the item's full pair set. Resolves when the write lands and REJECTS
   * when it fails, so the caller can roll its own state back.
   */
  commit(itemId: number, pairs: RolePair[]): Promise<void>;
}

export function createEstimateCommitter(
  replace: (itemId: number, estimates: Partial<WbsEstimate>[]) => Promise<void>
): EstimateCommitter {
  const chains = new Map<number, Promise<void>>();
  const pending = new Map<number, RolePair[]>();

  return {
    basisFor(itemId, fallback) {
      return pending.get(itemId) ?? fallback;
    },
    commit(itemId, pairs) {
      // Recorded synchronously so a second edit queued before this one settles
      // merges against this edit's result rather than the stale prop.
      pending.set(itemId, pairs);

      const previous = chains.get(itemId) ?? Promise.resolve();
      const request = previous.then(() => replace(itemId, pairsToPayload(pairs)));

      // The stored chain link must always settle successfully, so one failed
      // write can never permanently block later edits on the same item.
      const link = request.then(
        () => undefined,
        () => {
          // A rejected write must NOT stay behind as a merge basis: the next
          // edit sends the item's entire set, so a phantom basis would
          // resurrect the rejected value through an unrelated later edit.
          // Only drop it if it is still ours — a newer edit may have replaced it.
          if (pending.get(itemId) === pairs) pending.delete(itemId);
        }
      );
      chains.set(itemId, link);
      link.then(() => {
        // Clear the basis only once this is the LAST queued commit for the
        // item; anything queued behind it still needs something to build on.
        if (chains.get(itemId) === link) {
          pending.delete(itemId);
          chains.delete(itemId);
        }
      });

      return request;
    },
  };
}

// ---------------------------------------------------------------------------
// Cell layout
//
// The custom cells draw into a canvas, so nothing about their geometry can be
// observed from a test once it lives in the renderer. The arithmetic therefore
// lives here and the renderers only paint what these return. (A mutation probe
// that deleted the depth clamp while it sat in `Wbs.tsx` passed the entire
// suite — that is the failure mode this section exists to prevent.)
// ---------------------------------------------------------------------------

/** Pixels of indent per tree level in the Task Description column. */
export const INDENT_PX = 16;
/**
 * Deepest level that still adds indent. Unclamped, `depth * INDENT_PX`
 * eventually pushes the chevron out of the column, at which point a collapsed
 * node can never be expanded again because its hit test can no longer be
 * satisfied.
 */
export const MAX_INDENT_DEPTH = 8;
/** Side of the square the chevron glyph is drawn in — and of its hit box. */
export const CHEVRON_SIZE = 16;
/** Horizontal padding inside every cell. */
export const CELL_PAD = 8;
/** Label width always kept for the name, whatever the depth or column width. */
export const MIN_LABEL_WIDTH = 60;

/** Pixel indent for a row, clamped so chevron and label always stay in-column. */
export function indentFor(depth: number, cellWidth: number): number {
  const wanted = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX;
  const ceiling = Math.max(0, cellWidth - CHEVRON_SIZE - MIN_LABEL_WIDTH - CELL_PAD * 2);
  return Math.min(wanted, ceiling);
}

/**
 * True when a cell-local click landed on the chevron glyph.
 *
 * Both axes matter. Testing `posX` alone hands the chevron the full row height,
 * so a click anywhere down the left edge of a parent row toggles it instead of
 * selecting the row — and selection is what enables the toolbar, so those rows
 * become unselectable.
 */
export function hitsChevron(
  depth: number,
  cellWidth: number,
  cellHeight: number,
  posX: number,
  posY: number
): boolean {
  const left = CELL_PAD + indentFor(depth, cellWidth);
  const top = (cellHeight - CHEVRON_SIZE) / 2;
  return (
    posX >= left &&
    posX <= left + CHEVRON_SIZE &&
    posY >= top &&
    posY <= top + CHEVRON_SIZE
  );
}

/** Horizontal padding inside a role chip. */
export const CHIP_PAD = 6;
/** Gap between adjacent role chips. */
export const CHIP_GAP = 4;
/** Height of a role chip. */
export const CHIP_HEIGHT = 20;

export interface ChipPlacement {
  label: string;
  x: number;
  width: number;
}

export interface ChipLayout {
  /** Chips that fit, in order, with cell-local x offsets. */
  chips: ChipPlacement[];
  /** How many pairs did not fit. */
  overflow: number;
  /** `+N` badge, or `''` when everything fitted. */
  overflowLabel: string;
  overflowX: number;
  overflowWidth: number;
}

/**
 * Lay out the role chips for one cell.
 *
 * `measure` is the caller's text metric (the grid passes Glide's cached canvas
 * measurement), which is the only part of this that needs a canvas.
 *
 * Two rules: chips that do not fit are REPLACED by a `+N` badge, so a cell that
 * silently drops roles is impossible to mistake for a cell that has none; and
 * the first chip is always placed even when it is wider than the whole cell —
 * the renderer's clip is what stops it painting over `Hours`, because dropping
 * it instead would render an empty-looking cell for a row that has roles.
 */
export function layoutChips(
  pairs: RolePair[],
  cellWidth: number,
  measure: (label: string) => number
): ChipLayout {
  const limit = cellWidth - CELL_PAD;
  const chipWidthOf = (label: string) => measure(label) + CHIP_PAD * 2;

  const chips: ChipPlacement[] = [];
  let x = CELL_PAD;

  for (let i = 0; i < pairs.length; i++) {
    const label = pairLabel(pairs[i]);
    const width = chipWidthOf(label);
    const remaining = pairs.length - i - 1;
    // Reserve room for the badge whenever something would be left over.
    const badge = remaining > 0 ? CHIP_GAP + chipWidthOf(overflowLabel(remaining)) : 0;
    if (chips.length > 0 && x + width + badge > limit) break;
    chips.push({ label, x, width });
    x += width + CHIP_GAP;
  }

  const overflow = pairs.length - chips.length;
  if (overflow === 0) {
    return { chips, overflow: 0, overflowLabel: '', overflowX: x, overflowWidth: 0 };
  }
  const label = overflowLabel(overflow);
  const width = chipWidthOf(label);
  // Keep the badge inside the cell even when an oversized first chip pushed the
  // cursor past the limit; the clip handles the chip, the badge must stay read-able.
  const badgeX = Math.max(CELL_PAD, Math.min(x, limit - width));
  return { chips, overflow, overflowLabel: label, overflowX: badgeX, overflowWidth: width };
}

function overflowLabel(count: number): string {
  return `+${count}`;
}
