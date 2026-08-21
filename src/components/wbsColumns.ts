/**
 * Single source of truth for the WBS grid's columns. Modelled on
 * `planningColumns.ts` — the WBS tab had no columns-visibility menu before
 * the roadmap feature (all five columns were hardcoded and always visible;
 * see `Wbs.tsx`'s old `COLUMN_COUNT = 5`). This file adds exactly one
 * optional, hidden-by-default column (`Roadmap`, CAP-5) without disturbing
 * the other five, which stay `pinned` (cannot be hidden — there was never a
 * menu for them, and there still isn't).
 *
 * Column identity is an `id`, never a grid index — mirrors `planningColumns.ts`'s
 * own rationale: the grid index of a column shifts the moment one is hidden.
 */

export type WbsColumnId = 'outline' | 'name' | 'phase' | 'roles' | 'hours' | 'roadmap';

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
}

/** In grid order. The five original columns are unchanged in id, title, width and order. */
export const WBS_COLUMNS: readonly WbsColumnDef[] = [
  { id: 'outline', title: 'WBS', width: 80, pinned: true },
  { id: 'name', title: 'Task Description', width: 360, grow: 1, pinned: true },
  { id: 'phase', title: 'Phase', width: 160, pinned: true },
  { id: 'roles', title: 'Roles', width: 320, pinned: true },
  { id: 'hours', title: 'Hours', width: 100, pinned: true },
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
 * With the default hidden set (`roadmap` hidden), this returns EXACTLY the
 * five original columns in their original order — see `wbsColumns.test.ts`
 * for the pixel-parity proof.
 */
export function getVisibleWbsColumns(hidden: readonly WbsColumnId[]): WbsColumnDef[] {
  return WBS_COLUMNS.filter((c) => c.pinned || !hidden.includes(c.id));
}
