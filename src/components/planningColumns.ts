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
  | 'location'
  | 'intHourly'
  | 'intDaily'
  | 'clientHourly'
  | 'clientDaily'
  | 'margin';

/** A signed-in user's group — kept local (no import from services/api) since this is a pure, dependency-free module. */
export type Group = 'ADMIN' | 'MANAGER' | 'USER';

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
  /** Carries an internal figure: never shown to USER, regardless of the hidden-columns preference. */
  internal?: true;
}

export const LEAD_COLUMNS: readonly LeadColumnDef[] = [
  { id: 'actions',      title: '',               width: 60,  frozen: true, pinned: true },
  { id: 'role',         title: 'Rate card role', width: 200, frozen: true, menuLabel: 'Rate card role' },
  { id: 'clientRole',   title: 'Client Role',    width: 150, frozen: true, menuLabel: 'Client Role' },
  { id: 'name',         title: 'Name',           width: 150, frozen: true, menuLabel: 'Name' },
  { id: 'location',     title: 'Location',       width: 70,  frozen: true, menuLabel: 'Location' },
  { id: 'intHourly',    title: 'Hourly cost',    width: 90, group: 'Internal', menuLabel: 'Hourly cost', internal: true },
  { id: 'intDaily',     title: 'Daily cost',     width: 90, group: 'Internal', menuLabel: 'Daily cost', internal: true },
  { id: 'clientHourly', title: 'Hourly rate',    width: 90, group: 'Client',   menuLabel: 'Hourly rate' },
  { id: 'clientDaily',  title: 'Daily rate',     width: 90, group: 'Client',   menuLabel: 'Daily rate' },
  { id: 'margin',       title: 'Margin',         width: 70,  menuLabel: 'Margin', internal: true },
];

export type TotalColumnId = 'cost' | 'price' | 'efforts';

/** Trailing total columns. `id: 'cost'` is internal and dropped for USER — see getVisibleTotalColumns. */
export const TOTAL_COLUMNS: readonly { id: TotalColumnId; title: string; width: number }[] = [
  { id: 'cost', title: 'Cost', width: 100 },
  { id: 'price', title: 'Price', width: 100 },
  { id: 'efforts', title: 'Efforts, h', width: 90 },
];

/** Total columns actually rendered: USER never sees the internal Cost total. */
export function getVisibleTotalColumns(group?: Group): readonly { id: TotalColumnId; title: string; width: number }[] {
  return group === 'USER' ? TOTAL_COLUMNS.filter((c) => c.id !== 'cost') : TOTAL_COLUMNS;
}

export interface ColumnMenuSection {
  label?: string;
  ids: LeadColumnId[];
}

/** Menu layout — mirrors the grid's group headers so duplicate titles stay distinguishable. */
export const COLUMN_MENU_SECTIONS: readonly ColumnMenuSection[] = [
  { ids: ['role', 'clientRole', 'name', 'location'] },
  { label: 'Internal', ids: ['intHourly', 'intDaily'] },
  { label: 'Client', ids: ['clientHourly', 'clientDaily'] },
  { ids: ['margin'] },
];

const TOGGLEABLE_IDS = new Set<string>(
  LEAD_COLUMNS.filter((c) => !c.pinned).map((c) => c.id)
);

/** Hidden until the user saves a choice for the project. */
export const DEFAULT_HIDDEN_COLUMNS: readonly LeadColumnId[] = ['intDaily', 'clientDaily'];

export const columnStorageKey = (projectId: number) => `planning-columns:${projectId}`;

/** Reads hidden column ids for a project. Unknown or pinned ids are dropped. */
export function loadHiddenColumns(projectId: number): LeadColumnId[] {
  try {
    const raw = window.localStorage.getItem(columnStorageKey(projectId));
    if (!raw) return [...DEFAULT_HIDDEN_COLUMNS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_HIDDEN_COLUMNS];
    const valid = parsed.filter(
      (id): id is LeadColumnId => typeof id === 'string' && TOGGLEABLE_IDS.has(id)
    );
    return [...new Set(valid)];
  } catch {
    return [...DEFAULT_HIDDEN_COLUMNS];
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

/**
 * Lead columns actually rendered, in grid order. Pinned columns always survive.
 * USER never sees an internal column, regardless of the hidden-columns preference.
 */
export function getVisibleLeadColumns(hidden: readonly LeadColumnId[], group?: Group): LeadColumnDef[] {
  return LEAD_COLUMNS.filter((c) => {
    if (group === 'USER' && c.internal) return false;
    return c.pinned || !hidden.includes(c.id);
  });
}

/** Columns-menu layout actually offered: USER never gets a section/entry for an internal column. */
export function getVisibleMenuSections(group?: Group): ColumnMenuSection[] {
  if (group !== 'USER') return COLUMN_MENU_SECTIONS.map((s) => ({ ...s }));
  const internalIds = new Set(LEAD_COLUMNS.filter((c) => c.internal).map((c) => c.id));
  return COLUMN_MENU_SECTIONS
    .map((section) => ({ ...section, ids: section.ids.filter((id) => !internalIds.has(id)) }))
    .filter((section) => section.ids.length > 0);
}

export type ResolvedColumn =
  | { kind: 'lead'; id: LeadColumnId }
  | { kind: 'period'; index: number }
  | { kind: 'total'; id: TotalColumnId }
  | { kind: 'none' };

/**
 * The ONLY place that turns a grid column index into meaning. Every handler must go
 * through this instead of comparing indices to literals. `totalColumns` must be the
 * SAME array actually rendered (see getVisibleTotalColumns) so a dropped Cost column
 * doesn't shift the meaning of the remaining indices.
 */
export function resolveColumn(
  colIndex: number,
  visibleLead: readonly LeadColumnDef[],
  periodCount: number,
  totalColumns: readonly { id: TotalColumnId }[] = TOTAL_COLUMNS
): ResolvedColumn {
  if (colIndex < 0) return { kind: 'none' };
  if (colIndex < visibleLead.length) return { kind: 'lead', id: visibleLead[colIndex].id };

  const periodIndex = colIndex - visibleLead.length;
  if (periodIndex < periodCount) return { kind: 'period', index: periodIndex };

  const totalIndex = periodIndex - periodCount;
  if (totalIndex < totalColumns.length) return { kind: 'total', id: totalColumns[totalIndex].id };

  return { kind: 'none' };
}
