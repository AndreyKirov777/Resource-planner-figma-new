import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LEAD_COLUMNS,
  COLUMN_MENU_SECTIONS,
  getVisibleLeadColumns,
  resolveColumn,
  loadHiddenColumns,
  saveHiddenColumns,
  columnStorageKey,
  type LeadColumnId,
} from './planningColumns';

/** Node 25+ exposes a stub `localStorage` without Storage methods unless `--localstorage-file` is set. */
function installMemoryLocalStorage() {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(String(key), String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
}

describe('planningColumns', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('keeps every column visible when nothing is hidden', () => {
    expect(getVisibleLeadColumns([])).toHaveLength(LEAD_COLUMNS.length);
  });

  it('never hides a pinned column', () => {
    const visible = getVisibleLeadColumns(['actions' as LeadColumnId, 'name']);
    expect(visible.some((c) => c.id === 'actions')).toBe(true);
    expect(visible.some((c) => c.id === 'name')).toBe(false);
  });

  it('resolves lead, period and total columns with all columns visible', () => {
    const visible = getVisibleLeadColumns([]);
    expect(resolveColumn(0, visible, 8)).toEqual({ kind: 'lead', id: 'actions' });
    expect(resolveColumn(8, visible, 8)).toEqual({ kind: 'lead', id: 'margin' });
    expect(resolveColumn(9, visible, 8)).toEqual({ kind: 'period', index: 0 });
    expect(resolveColumn(16, visible, 8)).toEqual({ kind: 'period', index: 7 });
    expect(resolveColumn(17, visible, 8)).toEqual({ kind: 'total', index: 0 });
    expect(resolveColumn(19, visible, 8)).toEqual({ kind: 'total', index: 2 });
    expect(resolveColumn(20, visible, 8)).toEqual({ kind: 'none' });
  });

  it('shifts the period and total columns left when lead columns are hidden', () => {
    const visible = getVisibleLeadColumns(['name', 'intDaily']);
    expect(visible).toHaveLength(7);
    expect(resolveColumn(3, visible, 8)).toEqual({ kind: 'lead', id: 'intHourly' });
    expect(resolveColumn(7, visible, 8)).toEqual({ kind: 'period', index: 0 });
    expect(resolveColumn(15, visible, 8)).toEqual({ kind: 'total', index: 0 });
  });

  it('still resolves periods when every toggleable column is hidden', () => {
    const hidden = LEAD_COLUMNS.filter((c) => !c.pinned).map((c) => c.id);
    const visible = getVisibleLeadColumns(hidden);
    expect(visible).toHaveLength(1);
    expect(resolveColumn(1, visible, 4)).toEqual({ kind: 'period', index: 0 });
  });

  it('round-trips hidden columns per project id', () => {
    saveHiddenColumns(1, ['name']);
    saveHiddenColumns(2, ['margin', 'clientDaily']);
    expect(loadHiddenColumns(1)).toEqual(['name']);
    expect(loadHiddenColumns(2)).toEqual(['margin', 'clientDaily']);
    expect(loadHiddenColumns(3)).toEqual([]);
  });

  it('lists every toggleable column in the menu exactly once', () => {
    const toggleable = LEAD_COLUMNS.filter((c) => !c.pinned).map((c) => c.id);
    const listed = COLUMN_MENU_SECTIONS.flatMap((s) => s.ids);
    expect(listed).toEqual(toggleable);
  });

  it('drops unknown, pinned and malformed entries when loading', () => {
    window.localStorage.setItem(columnStorageKey(1), JSON.stringify(['name', 'actions', 'nope', 42]));
    expect(loadHiddenColumns(1)).toEqual(['name']);

    window.localStorage.setItem(columnStorageKey(4), JSON.stringify(['name', 'name', 'margin']));
    expect(loadHiddenColumns(4)).toEqual(['name', 'margin']);

    window.localStorage.setItem(columnStorageKey(2), 'not json');
    expect(loadHiddenColumns(2)).toEqual([]);

    window.localStorage.setItem(columnStorageKey(3), JSON.stringify({ name: true }));
    expect(loadHiddenColumns(3)).toEqual([]);
  });

  it('treats persist failures as non-fatal', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveHiddenColumns(1, ['name'])).not.toThrow();
    setItem.mockRestore();
  });
});
