/**
 * Single source of truth for the Planning Table's lead columns (everything left of
 * the period columns). Column identity is an `id`, never a grid index — the grid index
 * of a column changes whenever the user hides one, so index arithmetic is not safe.
 */

export type LeadColumnId =
  | 'actions'
  | 'role'
  | 'clientRole'
  | 'name'
  | 'intHourly'
  | 'intDaily'
  | 'clientHourly'
  | 'clientDaily'
  | 'margin';

export interface LeadColumnDef {
  id: LeadColumnId;
  /** Header text in the grid. */
  title: string;
  width: number;
  /** Grid group header, e.g. 'Internal' / 'Client'. */
  group?: string;
  /** Sticky while visible — reproduces the old `freezeColumns={4}`. */
  frozen?: boolean;
  /** Cannot be hidden, never shown in the Columns menu. */
  pinned?: boolean;
  /** Label in the Columns menu. */
  menuLabel?: string;
}

export const LEAD_COLUMNS: readonly LeadColumnDef[] = [
  { id: 'actions',      title: '',               width: 60,  frozen: true, pinned: true },
  { id: 'role',         title: 'Rate card role', width: 200, frozen: true, menuLabel: 'Rate card role' },
  { id: 'clientRole',   title: 'Client Role',    width: 150, frozen: true, menuLabel: 'Client Role' },
  { id: 'name',         title: 'Name',           width: 150, frozen: true, menuLabel: 'Name' },
  { id: 'intHourly',    title: 'Hourly cost',    width: 90, group: 'Internal', menuLabel: 'Hourly cost' },
  { id: 'intDaily',     title: 'Daily cost',     width: 90, group: 'Internal', menuLabel: 'Daily cost' },
  { id: 'clientHourly', title: 'Hourly rate',    width: 90, group: 'Client',   menuLabel: 'Hourly rate' },
  { id: 'clientDaily',  title: 'Daily rate',     width: 90, group: 'Client',   menuLabel: 'Daily rate' },
  { id: 'margin',       title: 'Margin',         width: 70,  menuLabel: 'Margin' },
];

/** Trailing total columns. Order matters: index 0 = Cost, 1 = Price, 2 = Efforts. */
export const TOTAL_COLUMNS: readonly { title: string; width: number }[] = [
  { title: 'Cost', width: 100 },
  { title: 'Price', width: 100 },
  { title: 'Efforts, h', width: 90 },
];

export interface ColumnMenuSection {
  label?: string;
  ids: LeadColumnId[];
}

/** Menu layout — mirrors the grid's group headers so duplicate titles stay distinguishable. */
export const COLUMN_MENU_SECTIONS: readonly ColumnMenuSection[] = [
  { ids: ['role', 'clientRole', 'name'] },
  { label: 'Internal', ids: ['intHourly', 'intDaily'] },
  { label: 'Client', ids: ['clientHourly', 'clientDaily'] },
  { ids: ['margin'] },
];

const TOGGLEABLE_IDS = new Set<string>(
  LEAD_COLUMNS.filter((c) => !c.pinned).map((c) => c.id)
);

export const columnStorageKey = (projectId: number) => `planning-columns:${projectId}`;

/** Reads hidden column ids for a project. Unknown or pinned ids are dropped. */
export function loadHiddenColumns(projectId: number): LeadColumnId[] {
  try {
    const raw = window.localStorage.getItem(columnStorageKey(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (id): id is LeadColumnId => typeof id === 'string' && TOGGLEABLE_IDS.has(id)
    );
    return [...new Set(valid)];
  } catch {
    return [];
  }
}

/** Persists hidden column ids. Storage failures are non-fatal — the view still works. */
export function saveHiddenColumns(projectId: number, hidden: readonly LeadColumnId[]): void {
  try {
    window.localStorage.setItem(columnStorageKey(projectId), JSON.stringify(hidden));
  } catch {
    /* private mode / quota — the choice simply won't survive a reload */
  }
}

/** Lead columns actually rendered, in grid order. Pinned columns always survive. */
export function getVisibleLeadColumns(hidden: readonly LeadColumnId[]): LeadColumnDef[] {
  return LEAD_COLUMNS.filter((c) => c.pinned || !hidden.includes(c.id));
}

export type ResolvedColumn =
  | { kind: 'lead'; id: LeadColumnId }
  | { kind: 'period'; index: number }
  | { kind: 'total'; index: number }
  | { kind: 'none' };

/**
 * The ONLY place that turns a grid column index into meaning. Every handler must go
 * through this instead of comparing indices to literals.
 */
export function resolveColumn(
  colIndex: number,
  visibleLead: readonly LeadColumnDef[],
  periodCount: number
): ResolvedColumn {
  if (colIndex < 0) return { kind: 'none' };
  if (colIndex < visibleLead.length) return { kind: 'lead', id: visibleLead[colIndex].id };

  const periodIndex = colIndex - visibleLead.length;
  if (periodIndex < periodCount) return { kind: 'period', index: periodIndex };

  const totalIndex = periodIndex - periodCount;
  if (totalIndex < TOTAL_COLUMNS.length) return { kind: 'total', index: totalIndex };

  return { kind: 'none' };
}
