import { describe, it, expect } from 'vitest';
import { buildWbsTree, flattenVisibleTree, rollupHours, descendantIds, WbsTreeNode } from './wbsTree';
import { WbsItem } from '../services/api';

function item(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: 1,
    name: 'Item',
    parentId: null,
    phaseName: null,
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    estimates: [],
    ...overrides,
  };
}

describe('buildWbsTree', () => {
  it('assembles a multi-level tree via parentId', () => {
    const items: WbsItem[] = [
      item({ id: 1, name: 'Root', parentId: null }),
      item({ id: 2, name: 'Child', parentId: 1 }),
      item({ id: 3, name: 'Grandchild', parentId: 2 }),
    ];

    const tree = buildWbsTree(items);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('Child');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe('Grandchild');
  });

  it('orders siblings by displayOrder, then id', () => {
    const items: WbsItem[] = [
      item({ id: 3, name: 'C', parentId: null, displayOrder: 2 }),
      item({ id: 1, name: 'A', parentId: null, displayOrder: 0 }),
      item({ id: 2, name: 'B', parentId: null, displayOrder: 0 }),
    ];

    const tree = buildWbsTree(items);

    expect(tree.map((n) => n.name)).toEqual(['A', 'B', 'C']);
  });

  it('surfaces items with a missing/orphaned parentId as roots', () => {
    const items: WbsItem[] = [
      item({ id: 1, name: 'Root', parentId: null }),
      item({ id: 2, name: 'Orphan', parentId: 999 }), // 999 does not exist in this list
    ];

    const tree = buildWbsTree(items);

    expect(tree.map((n) => n.name).sort()).toEqual(['Orphan', 'Root']);
    expect(tree.find((n) => n.name === 'Orphan')?.children).toEqual([]);
  });

  it('returns an empty forest for an empty item list', () => {
    expect(buildWbsTree([])).toEqual([]);
  });
});

describe('flattenVisibleTree', () => {
  const items: WbsItem[] = [
    item({ id: 1, name: 'Root', parentId: null }),
    item({ id: 2, name: 'Child A', parentId: 1 }),
    item({ id: 3, name: 'Grandchild', parentId: 2 }),
    item({ id: 4, name: 'Child B', parentId: 1 }),
  ];

  it('flattens in pre-order with correct depths when nothing is collapsed', () => {
    const tree = buildWbsTree(items);
    const rows = flattenVisibleTree(tree);

    expect(rows.map((r) => [r.node.name, r.depth])).toEqual([
      ['Root', 0],
      ['Child A', 1],
      ['Grandchild', 2],
      ['Child B', 1],
    ]);
  });

  it('marks hasChildren correctly', () => {
    const tree = buildWbsTree(items);
    const rows = flattenVisibleTree(tree);

    const byName = Object.fromEntries(rows.map((r) => [r.node.name, r.hasChildren]));
    expect(byName['Root']).toBe(true);
    expect(byName['Child A']).toBe(true);
    expect(byName['Grandchild']).toBe(false);
    expect(byName['Child B']).toBe(false);
  });

  it('collapsing a node hides only its descendants, not the node itself or its siblings', () => {
    const tree = buildWbsTree(items);
    const rows = flattenVisibleTree(tree, new Set([2])); // collapse "Child A"

    expect(rows.map((r) => r.node.name)).toEqual(['Root', 'Child A', 'Child B']);
  });

  it('defaults to nothing collapsed when collapsedIds is omitted', () => {
    const tree = buildWbsTree(items);
    expect(flattenVisibleTree(tree)).toHaveLength(4);
  });
});

describe('rollupHours', () => {
  it('merges same-discipline hours across the subtree (own + all descendants)', () => {
    const root: WbsTreeNode = {
      ...item({ id: 1, name: 'Root', estimates: [{ id: 1, discipline: 'Engineering', role: '', hours: 5, wbsItemId: 1, createdAt: '', updatedAt: '' }] }),
      children: [
        {
          ...item({ id: 2, name: 'Child', estimates: [{ id: 2, discipline: 'Engineering', role: '', hours: 3, wbsItemId: 2, createdAt: '', updatedAt: '' }] }),
          children: [
            {
              ...item({ id: 3, name: 'Grandchild', estimates: [{ id: 3, discipline: 'Design', role: '', hours: 2, wbsItemId: 3, createdAt: '', updatedAt: '' }] }),
              children: [],
            },
          ],
        },
      ],
    };

    const totals = rollupHours(root);

    expect(totals.get('Engineering')).toBe(8); // 5 (own) + 3 (child)
    expect(totals.get('Design')).toBe(2); // grandchild only
  });

  it('returns an empty map for a leaf node with no estimates', () => {
    const leaf: WbsTreeNode = { ...item({ id: 1 }), children: [] };
    expect(rollupHours(leaf).size).toBe(0);
  });

  it('does not include a sibling subtree\'s hours', () => {
    const root: WbsTreeNode = {
      ...item({ id: 1, name: 'Root' }),
      children: [
        { ...item({ id: 2, name: 'A', estimates: [{ id: 1, discipline: 'Eng', role: '', hours: 10, wbsItemId: 2, createdAt: '', updatedAt: '' }] }), children: [] },
        { ...item({ id: 3, name: 'B', estimates: [{ id: 2, discipline: 'Eng', role: '', hours: 4, wbsItemId: 3, createdAt: '', updatedAt: '' }] }), children: [] },
      ],
    };

    const aOnly = rollupHours(root.children[0]);
    expect(aOnly.get('Eng')).toBe(10);

    const wholeTree = rollupHours(root);
    expect(wholeTree.get('Eng')).toBe(14);
  });
});

describe('descendantIds', () => {
  const items: WbsItem[] = [
    item({ id: 1, name: 'Root', parentId: null }),
    item({ id: 2, name: 'Child A', parentId: 1 }),
    item({ id: 3, name: 'Grandchild', parentId: 2 }),
    item({ id: 4, name: 'Child B', parentId: 1 }),
    item({ id: 5, name: 'Unrelated root', parentId: null }),
  ];

  it('returns every descendant id, not just direct children', () => {
    expect(descendantIds(items, 1).sort()).toEqual([2, 3, 4]);
  });

  it('returns an empty array for a leaf item', () => {
    expect(descendantIds(items, 3)).toEqual([]);
  });

  it('returns an empty array for an id not present in the list', () => {
    expect(descendantIds(items, 999)).toEqual([]);
  });

  it('does not include unrelated roots or their subtrees', () => {
    expect(descendantIds(items, 1)).not.toContain(5);
  });
});
