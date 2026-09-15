import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LEAD_COLUMNS,
  COLUMN_MENU_SECTIONS,
  TOTAL_COLUMNS,
  getVisibleLeadColumns,
  getVisibleMenuSections,
  getVisibleTotalColumns,
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
    expect(resolveColumn(4, visible, 8)).toEqual({ kind: 'lead', id: 'location' });
    expect(resolveColumn(9, visible, 8)).toEqual({ kind: 'lead', id: 'margin' });
    expect(resolveColumn(10, visible, 8)).toEqual({ kind: 'period', index: 0 });
    expect(resolveColumn(17, visible, 8)).toEqual({ kind: 'period', index: 7 });
    expect(resolveColumn(18, visible, 8)).toEqual({ kind: 'total', id: 'cost' });
    expect(resolveColumn(20, visible, 8)).toEqual({ kind: 'total', id: 'efforts' });
    expect(resolveColumn(21, visible, 8)).toEqual({ kind: 'none' });
  });

  it('shifts the period and total columns left when lead columns are hidden', () => {
    const visible = getVisibleLeadColumns(['name', 'location', 'intDaily']);
    expect(visible).toHaveLength(7);
    expect(resolveColumn(3, visible, 8)).toEqual({ kind: 'lead', id: 'intHourly' });
    expect(resolveColumn(7, visible, 8)).toEqual({ kind: 'period', index: 0 });
    expect(resolveColumn(15, visible, 8)).toEqual({ kind: 'total', id: 'cost' });
  });

  it('still resolves periods when every toggleable column is hidden', () => {
    const hidden = LEAD_COLUMNS.filter((c) => !c.pinned).map((c) => c.id);
    const visible = getVisibleLeadColumns(hidden);
    expect(visible).toHaveLength(1);
    expect(resolveColumn(1, visible, 4)).toEqual({ kind: 'period', index: 0 });
  });

  it('hides Internal and Client daily columns when nothing is stored', () => {
    expect(loadHiddenColumns(1)).toEqual(['intDaily', 'clientDaily']);
  });

  it('round-trips hidden columns per project id', () => {
    saveHiddenColumns(1, ['name']);
    saveHiddenColumns(2, ['margin', 'clientDaily']);
    expect(loadHiddenColumns(1)).toEqual(['name']);
    expect(loadHiddenColumns(2)).toEqual(['margin', 'clientDaily']);
    expect(loadHiddenColumns(3)).toEqual(['intDaily', 'clientDaily']);
    saveHiddenColumns(3, []);
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
    expect(loadHiddenColumns(2)).toEqual(['intDaily', 'clientDaily']);

    window.localStorage.setItem(columnStorageKey(3), JSON.stringify({ name: true }));
    expect(loadHiddenColumns(3)).toEqual(['intDaily', 'clientDaily']);
  });

  it('treats persist failures as non-fatal', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveHiddenColumns(1, ['name'])).not.toThrow();
    setItem.mockRestore();
  });

  describe('USER visibility ceiling', () => {
    it('drops every internal lead column for USER, even when nothing is hidden', () => {
      const visible = getVisibleLeadColumns([], 'USER');
      expect(visible.map((c) => c.id)).not.toContain('intHourly');
      expect(visible.map((c) => c.id)).not.toContain('intDaily');
      expect(visible.map((c) => c.id)).not.toContain('margin');
      expect(visible.map((c) => c.id)).toContain('clientHourly');
    });

    it('keeps internal columns visible for MANAGER and ADMIN by default', () => {
      for (const group of ['MANAGER', 'ADMIN'] as const) {
        const visible = getVisibleLeadColumns([], group);
        expect(visible.map((c) => c.id)).toContain('intHourly');
        expect(visible.map((c) => c.id)).toContain('margin');
      }
    });

    it('a USER never gets an internal column back even if it was named in storage as visible', () => {
      // storage says "show everything" (hidden = []) — USER still never sees intHourly/intDaily/margin.
      const visible = getVisibleLeadColumns([], 'USER');
      const internalIds = LEAD_COLUMNS.filter((c) => c.internal).map((c) => c.id);
      for (const id of internalIds) {
        expect(visible.some((c) => c.id === id)).toBe(false);
      }
    });

    it('drops the Internal menu section (and the lone margin section) entirely for USER, keeps Client and the rest', () => {
      const sections = getVisibleMenuSections('USER');
      expect(sections.some((s) => s.label === 'Internal')).toBe(false);
      expect(sections.flatMap((s) => s.ids)).toEqual([
        'role', 'clientRole', 'name', 'location', 'clientHourly', 'clientDaily',
      ]);
    });

    it('keeps every menu section for MANAGER and ADMIN', () => {
      for (const group of ['MANAGER', 'ADMIN'] as const) {
        expect(getVisibleMenuSections(group)).toEqual(COLUMN_MENU_SECTIONS);
      }
    });

    it('drops the Cost total for USER, keeps Price and Efforts', () => {
      const totals = getVisibleTotalColumns('USER');
      expect(totals.map((t) => t.id)).toEqual(['price', 'efforts']);
    });

    it('keeps every total column for MANAGER and ADMIN', () => {
      for (const group of ['MANAGER', 'ADMIN', undefined] as const) {
        expect(getVisibleTotalColumns(group)).toEqual(TOTAL_COLUMNS);
      }
    });

    it('resolveColumn total index tracks whatever totalColumns array is actually rendered', () => {
      const visible = getVisibleLeadColumns([], 'USER');
      const totals = getVisibleTotalColumns('USER');
      // 5 non-internal frozen lead cols + clientHourly + clientDaily = 7, then 8 periods, then totals.
      const totalsStart = visible.length + 8;
      expect(resolveColumn(totalsStart, visible, 8, totals)).toEqual({ kind: 'total', id: 'price' });
      expect(resolveColumn(totalsStart + 1, visible, 8, totals)).toEqual({ kind: 'total', id: 'efforts' });
      expect(resolveColumn(totalsStart + 2, visible, 8, totals)).toEqual({ kind: 'none' });
    });
  });
});
