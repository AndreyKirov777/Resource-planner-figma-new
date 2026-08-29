/**
 * Single source of truth for the WBS grid's columns. Modelled on
 * `planningColumns.ts` — the WBS tab had no columns-visibility menu before
 * the roadmap feature (all five columns were hardcoded and always visible;
 * see `Wbs.tsx`'s old `COLUMN_COUNT = 5`). This file adds exactly one
 * optional, hidden-by-default column (`Roadmap`, CAP-5). TOTAL and generated
 * Resource List role columns stay pinned.
 *
 * Column identity is an `id`, never a grid index — mirrors `planningColumns.ts`'s
 * own rationale: the grid index of a column shifts the moment one is hidden.
 */

export type WbsColumnId = 'outline' | 'name' | 'phase' | 'total' | 'roadmap' | `role:${string}`;

export interface WbsColumnDef {
  id: WbsColumnId;
  title: string;
  width: number;
  /** Glide's `grow` — only `name` uses this, to fill remaining width. */
  grow?: number;
  /** Always visible; never shown in the columns menu. */
  pinned?: boolean;
  /** Label in the columns-visibility menu. */
  menuLabel?: string;
  /** Resource List role represented by a generated numeric column. */
  role?: string;
}

/** Static columns; generated role columns are inserted before Roadmap. */
export const WBS_COLUMNS: readonly WbsColumnDef[] = [
  { id: 'outline', title: 'WBS', width: 80, pinned: true },
  { id: 'name', title: 'Task Description', width: 360, grow: 1, pinned: true },
  { id: 'phase', title: 'Phase', width: 160, pinned: true },
  { id: 'total', title: 'TOTAL', width: 80, pinned: true },
  { id: 'roadmap', title: 'Roadmap', width: 180, menuLabel: 'Roadmap' },
];

/** Hidden until the user saves a choice for the project. */
export const DEFAULT_HIDDEN_WBS_COLUMNS: readonly WbsColumnId[] = ['roadmap'];

const TOGGLEABLE_IDS = new Set<string>(WBS_COLUMNS.filter((c) => !c.pinned).map((c) => c.id));

export const wbsColumnStorageKey = (projectId: number) => `wbs-columns:${projectId}`;

/** Reads hidden column ids for a project. Unknown or pinned ids are dropped. */
export function loadHiddenWbsColumns(projectId: number): WbsColumnId[] {
  try {
    const raw = window.localStorage.getItem(wbsColumnStorageKey(projectId));
    if (!raw) return [...DEFAULT_HIDDEN_WBS_COLUMNS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_HIDDEN_WBS_COLUMNS];
    const valid = parsed.filter(
      (id): id is WbsColumnId => typeof id === 'string' && TOGGLEABLE_IDS.has(id)
    );
    return [...new Set(valid)];
  } catch {
    return [...DEFAULT_HIDDEN_WBS_COLUMNS];
  }
}

/** Persists hidden column ids. Storage failures are non-fatal — the view still works. */
export function saveHiddenWbsColumns(projectId: number, hidden: readonly WbsColumnId[]): void {
  try {
    window.localStorage.setItem(wbsColumnStorageKey(projectId), JSON.stringify(hidden));
  } catch {
    /* private mode / quota — the choice simply won't survive a reload */
  }
}

/**
 * Columns actually rendered, in grid order. Pinned columns always survive.
 * Resource List roles are expected in their already de-duplicated first-seen
 * order.
 */
export function getVisibleWbsColumns(
  hidden: readonly WbsColumnId[],
  roles: readonly string[] = []
): WbsColumnDef[] {
  const roleColumns: WbsColumnDef[] = roles.map((role) => ({
    id: `role:${encodeURIComponent(role)}`,
    title: role.replace(' ', '\n'),
    width: 72,
    pinned: true,
    role,
  }));
  const roadmap = WBS_COLUMNS.find((column) => column.id === 'roadmap');
  const base = WBS_COLUMNS.filter((column) => column.id !== 'roadmap');
  return [
    ...base,
    ...roleColumns,
    ...(roadmap !== undefined && !hidden.includes('roadmap') ? [roadmap] : []),
  ];
}
