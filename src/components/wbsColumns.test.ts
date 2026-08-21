import { describe, it, expect, beforeEach } from 'vitest';
import {
  WBS_COLUMNS,
  DEFAULT_HIDDEN_WBS_COLUMNS,
  loadHiddenWbsColumns,
  saveHiddenWbsColumns,
  getVisibleWbsColumns,
  wbsColumnStorageKey,
} from './wbsColumns';

/** The exact five columns `Wbs.tsx` hardcoded before the roadmap column existed. */
const ORIGINAL_FIVE = [
  { title: 'WBS', id: 'wbs', width: 80 },
  { title: 'Task Description', id: 'name', width: 360, grow: 1 },
  { title: 'Phase', id: 'phase', width: 160 },
  { title: 'Roles', id: 'roles', width: 320 },
  { title: 'Hours', id: 'hours', width: 100 },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe('wbsColumns pixel parity', () => {
  it('the default hidden set reproduces the exact original five columns, in order and index', () => {
    const visible = getVisibleWbsColumns(DEFAULT_HIDDEN_WBS_COLUMNS);
    expect(visible).toHaveLength(5);
    visible.forEach((col, index) => {
      expect(col.title).toBe(ORIGINAL_FIVE[index].title);
      expect(col.width).toBe(ORIGINAL_FIVE[index].width);
      expect(col.grow).toBe(ORIGINAL_FIVE[index].grow);
    });
  });

  it('COLUMN_COUNT (derived as visible.length) is 5 by default, matching the old hardcoded constant', () => {
    const visible = getVisibleWbsColumns(DEFAULT_HIDDEN_WBS_COLUMNS);
    expect(visible.length).toBe(5);
  });

  it('the Roadmap column is the 6th and last when shown, never displacing the original five', () => {
    const visible = getVisibleWbsColumns([]);
    expect(visible).toHaveLength(6);
    expect(visible[5].id).toBe('roadmap');
    visible.slice(0, 5).forEach((col, index) => {
      expect(col.id).toBe(WBS_COLUMNS[index].id);
    });
  });

  it('the five original columns are pinned — cannot be hidden even if asked', () => {
    const visible = getVisibleWbsColumns(['outline', 'name', 'phase', 'roles', 'hours', 'roadmap'] as any);
    expect(visible).toHaveLength(5);
    expect(visible.map((c) => c.id)).toEqual(['outline', 'name', 'phase', 'roles', 'hours']);
  });

  it('loadHiddenWbsColumns defaults to hiding Roadmap when nothing is stored', () => {
    expect(loadHiddenWbsColumns(1)).toEqual([...DEFAULT_HIDDEN_WBS_COLUMNS]);
  });

  it('saveHiddenWbsColumns / loadHiddenWbsColumns round-trip a choice to show Roadmap', () => {
    saveHiddenWbsColumns(1, []);
    expect(loadHiddenWbsColumns(1)).toEqual([]);
  });

  it('an unknown stored column id is dropped rather than breaking the grid', () => {
    window.localStorage.setItem(wbsColumnStorageKey(1), JSON.stringify(['roadmap', 'bogus']));
    expect(loadHiddenWbsColumns(1)).toEqual(['roadmap']);
  });

  it('storage is scoped per project', () => {
    saveHiddenWbsColumns(1, []);
    expect(loadHiddenWbsColumns(2)).toEqual([...DEFAULT_HIDDEN_WBS_COLUMNS]);
  });
});
