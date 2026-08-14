import { describe, it, expect } from 'vitest';
import {
  buildWbsTree,
  flattenVisibleTree,
  rollupHours,
  descendantIds,
  outlineNumbers,
  effectivePhases,
  withEffectivePhases,
  wouldCreateCycle,
  WbsTreeNode,
} from './wbsTree';
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

  it('surfaces a closed cycle as roots instead of hiding it', () => {
    const items: WbsItem[] = [
      item({ id: 1, name: 'A', parentId: 2 }),
      item({ id: 2, name: 'B', parentId: 1 }),
    ];

    const tree = buildWbsTree(items);

    expect(tree.map((n) => n.name).sort()).toEqual(['A', 'B']);
    expect(tree.every((n) => n.children)).toBeTruthy();
    expect(flattenVisibleTree(tree).map((r) => r.node.id).sort()).toEqual([1, 2]);
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

  it('does not under-count when the target sits in a closed cycle', () => {
    const cyclic: WbsItem[] = [
      item({ id: 1, name: 'A', parentId: 2 }),
      item({ id: 2, name: 'B', parentId: 1 }),
    ];
    expect(descendantIds(cyclic, 1)).toEqual([]);
    expect(buildWbsTree(cyclic).map((n) => n.id).sort()).toEqual([1, 2]);
  });
});

describe('cycle walkers', () => {
  it('does not stack-overflow on a cycle hanging off a root', () => {
    const items: WbsItem[] = [
      item({ id: 1, name: 'A', parentId: null }),
      item({ id: 2, name: 'B', parentId: 1 }),
      item({ id: 3, name: 'C', parentId: 2 }),
    ];
    // C → B is the back-edge; keep it in the assembled children by mutating.
    const tree = buildWbsTree(items);
    const b = tree[0].children[0];
    const c = b.children[0];
    c.children.push(b);

    expect(() => flattenVisibleTree(tree)).not.toThrow();
    expect(flattenVisibleTree(tree).map((r) => r.node.id)).toEqual([1, 2, 3]);
    expect(() => outlineNumbers(tree)).not.toThrow();
    expect(() => effectivePhases(tree)).not.toThrow();
    expect(() => rollupHours(tree[0])).not.toThrow();
    expect(() => descendantIds(items, 1)).not.toThrow();
  });
});

describe('wouldCreateCycle', () => {
  const items: WbsItem[] = [
    item({ id: 1, name: 'Root', parentId: null }),
    item({ id: 2, name: 'Child', parentId: 1 }),
    item({ id: 3, name: 'Grand', parentId: 2 }),
  ];

  it('is false when reparenting to null or to a non-descendant', () => {
    expect(wouldCreateCycle(items, 3, null)).toBe(false);
    expect(wouldCreateCycle(items, 3, 1)).toBe(false);
  });

  it('is true for self-parent and for a descendant parent', () => {
    expect(wouldCreateCycle(items, 1, 1)).toBe(true);
    expect(wouldCreateCycle(items, 1, 2)).toBe(true);
    expect(wouldCreateCycle(items, 1, 3)).toBe(true);
  });

  it('does not walk forever when the existing data already cycles', () => {
    const cyclic = [
      item({ id: 1, parentId: 2 }),
      item({ id: 2, parentId: 1 }),
    ];
    expect(wouldCreateCycle(cyclic, 3, 1)).toBe(false);
  });
});

describe('outlineNumbers', () => {
  // Matrix row "Outline numbering": 3-level tree, siblings by displayOrder.
  const items: WbsItem[] = [
    item({ id: 1, name: 'A', parentId: null, displayOrder: 0 }),
    item({ id: 2, name: 'A.1', parentId: 1, displayOrder: 0 }),
    item({ id: 3, name: 'A.1.1', parentId: 2, displayOrder: 0 }),
    item({ id: 4, name: 'A.2', parentId: 1, displayOrder: 1 }),
    item({ id: 5, name: 'B', parentId: null, displayOrder: 1 }),
  ];

  it('numbers depth-first, 1-based and dot-joined', () => {
    const numbers = outlineNumbers(buildWbsTree(items));

    expect(numbers.get(1)).toBe('1');
    expect(numbers.get(2)).toBe('1.1');
    expect(numbers.get(3)).toBe('1.1.1');
    expect(numbers.get(4)).toBe('1.2');
    expect(numbers.get(5)).toBe('2');
  });

  it('follows displayOrder, not insertion order', () => {
    const reordered: WbsItem[] = [
      item({ id: 5, name: 'B', parentId: null, displayOrder: 1 }),
      item({ id: 1, name: 'A', parentId: null, displayOrder: 0 }),
    ];
    const numbers = outlineNumbers(buildWbsTree(reordered));

    expect(numbers.get(1)).toBe('1');
    expect(numbers.get(5)).toBe('2');
  });

  it('is unaffected by which rows are currently visible', () => {
    // Numbering comes from the whole tree, so collapsing never renumbers.
    const numbers = outlineNumbers(buildWbsTree(items));
    expect(numbers.get(5)).toBe('2');
    expect(flattenVisibleTree(buildWbsTree(items), new Set([1])).map((r) => r.node.id)).toEqual([1, 5]);
  });

  it('returns an empty map for an empty forest', () => {
    expect(outlineNumbers([]).size).toBe(0);
  });
});

describe('effectivePhases', () => {
  // Matrix row "Phase resolution": root "Phase 1", child null, sibling "Phase 2".
  const items: WbsItem[] = [
    item({ id: 1, name: 'Root', parentId: null, phaseName: 'Phase 1' }),
    item({ id: 2, name: 'Child', parentId: 1, phaseName: null }),
    item({ id: 3, name: 'Grandchild', parentId: 2, phaseName: null }),
    item({ id: 4, name: 'Override', parentId: 1, phaseName: 'Phase 2', displayOrder: 1 }),
    item({ id: 5, name: 'Under override', parentId: 4, phaseName: null }),
  ];
  const phaseNames = ['Phase 1', 'Phase 2'];

  it('inherits from the nearest ancestor and marks it inherited', () => {
    const resolved = effectivePhases(buildWbsTree(items), phaseNames);

    expect(resolved.get(1)).toEqual({ phaseName: 'Phase 1', inherited: false });
    expect(resolved.get(2)).toEqual({ phaseName: 'Phase 1', inherited: true });
    expect(resolved.get(3)).toEqual({ phaseName: 'Phase 1', inherited: true });
  });

  it('lets an explicit phase override its own subtree', () => {
    const resolved = effectivePhases(buildWbsTree(items), phaseNames);

    expect(resolved.get(4)).toEqual({ phaseName: 'Phase 2', inherited: false });
    expect(resolved.get(5)).toEqual({ phaseName: 'Phase 2', inherited: true });
  });

  // Matrix row "Phase absent or stale".
  it('resolves a root with no phase to Unassigned', () => {
    const orphaned = [item({ id: 9, name: 'Lonely', parentId: null, phaseName: null })];
    const resolved = effectivePhases(buildWbsTree(orphaned), phaseNames);

    expect(resolved.get(9)).toEqual({ phaseName: null, inherited: false });
  });

  it('treats a stale phase name as unset rather than rendering it verbatim', () => {
    const stale = [
      item({ id: 1, name: 'Root', parentId: null, phaseName: 'Deleted phase' }),
      item({ id: 2, name: 'Child', parentId: 1, phaseName: null }),
    ];
    const resolved = effectivePhases(buildWbsTree(stale), phaseNames);

    expect(resolved.get(1)).toEqual({ phaseName: null, inherited: false });
    // ...and it must not propagate down the subtree either.
    expect(resolved.get(2)).toEqual({ phaseName: null, inherited: false });
  });

  it('honours every non-null name when no phase list is supplied', () => {
    const stale = [item({ id: 1, name: 'Root', parentId: null, phaseName: 'Anything' })];
    const resolved = effectivePhases(buildWbsTree(stale));

    expect(resolved.get(1)).toEqual({ phaseName: 'Anything', inherited: false });
  });
});

describe('withEffectivePhases', () => {
  it('replaces each item phaseName with the phase actually in force', () => {
    const items: WbsItem[] = [
      item({ id: 1, name: 'Root', parentId: null, phaseName: 'Phase 1' }),
      item({ id: 2, name: 'Child', parentId: 1, phaseName: null }),
      item({ id: 3, name: 'Stale', parentId: null, phaseName: 'Gone' }),
    ];

    const resolved = withEffectivePhases(items, ['Phase 1']);

    expect(resolved.map((i) => [i.id, i.phaseName])).toEqual([
      [1, 'Phase 1'],
      [2, 'Phase 1'],
      [3, null],
    ]);
  });

  it('leaves every other field, including estimates, untouched', () => {
    const items: WbsItem[] = [
      item({
        id: 1,
        name: 'Root',
        parentId: null,
        phaseName: 'Phase 1',
        estimates: [
          { id: 1, discipline: 'Engineering', role: 'BA', hours: 4, wbsItemId: 1, createdAt: '', updatedAt: '' },
        ],
      }),
    ];

    const [resolved] = withEffectivePhases(items, ['Phase 1']);

    expect(resolved).toEqual(items[0]);
  });
});
