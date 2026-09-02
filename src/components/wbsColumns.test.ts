import { describe, it, expect, beforeEach } from 'vitest';
import {
  WBS_COLUMNS,
  DEFAULT_HIDDEN_WBS_COLUMNS,
  loadHiddenWbsColumns,
  saveHiddenWbsColumns,
  getVisibleWbsColumns,
  wbsColumnStorageKey,
} from './wbsColumns';

beforeEach(() => {
  window.localStorage.clear();
});

describe('wbsColumns', () => {
  it('abbreviates long client-role titles but keeps the full role as identity', () => {
    const visible = getVisibleWbsColumns(DEFAULT_HIDDEN_WBS_COLUMNS, [
      'Senior Developer',
      'Middle Business Analyst',
    ]);
    expect(visible.map((column) => column.title)).toEqual([
      'WBS',
      'Task Description',
      'Phase',
      'TOTAL',
      'Sr\nDev',
      'Md\nBA',
    ]);
    expect(visible.map((column) => column.role)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'Senior Developer',
      'Middle Business Analyst',
    ]);
  });

  it('renders TOTAL followed by first-seen client-role columns', () => {
    const visible = getVisibleWbsColumns(DEFAULT_HIDDEN_WBS_COLUMNS, [
      'Junior QA Engineer',
      'Strong Junior Developer',
      'QA',
    ]);
    expect(visible.map((column) => column.title)).toEqual([
      'WBS',
      'Task Description',
      'Phase',
      'TOTAL',
      'Jr\nQA',
      'StJr\nDev',
      'QA',
    ]);
    expect(visible.map((column) => column.role)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'Junior QA Engineer',
      'Strong Junior Developer',
      'QA',
    ]);
  });

  it('shows TOTAL even when the Resource List is empty', () => {
    const visible = getVisibleWbsColumns(DEFAULT_HIDDEN_WBS_COLUMNS);
    expect(visible.map((column) => column.id)).toEqual(['outline', 'name', 'phase', 'total']);
  });

  it('puts Roadmap last when shown', () => {
    const visible = getVisibleWbsColumns([], ['SA', 'QA']);
    expect(visible.map((column) => column.id)).toEqual([
      'outline',
      'name',
      'phase',
      'total',
      'role:SA',
      'role:QA',
      'roadmap',
    ]);
  });

  it('only Roadmap is toggleable', () => {
    const visible = getVisibleWbsColumns(
      ['outline', 'name', 'phase', 'total', 'role:SA', 'roadmap'] as any,
      ['SA']
    );
    expect(visible.map((column) => column.id)).toEqual([
      'outline',
      'name',
      'phase',
      'total',
      'role:SA',
    ]);
    expect(WBS_COLUMNS.filter((column) => !column.pinned).map((column) => column.id)).toEqual([
      'roadmap',
    ]);
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
