import { describe, it, expect } from 'vitest';
import { buildReorder, orderSnapshot, applyRoadmapReorder, ItemReorderCommit, LaneReorderCommit } from './roadmapOrder';
import { RoadmapRowLane, RoadmapRowItem } from './roadmap';
import { RoadmapLaneWithItems, RoadmapItem } from '../services/api';

const lanes: RoadmapRowLane[] = [
  { id: 1, name: 'Backend', displayOrder: 0 },
  { id: 2, name: 'Frontend', displayOrder: 1 },
  { id: 3, name: 'QA', displayOrder: 2 },
];

function makeItems(): RoadmapRowItem[] {
  return [
    { id: 10, laneId: 1, name: 'A', kind: 'bar', startPeriod: 1, periodCount: 3, displayOrder: 0, wbsItemIds: [] },
    { id: 11, laneId: 1, name: 'B', kind: 'bar', startPeriod: 4, periodCount: 2, displayOrder: 1, wbsItemIds: [] },
    { id: 12, laneId: 1, name: 'C', kind: 'bar', startPeriod: 6, periodCount: 1, displayOrder: 2, wbsItemIds: [] },
    { id: 20, laneId: 2, name: 'D', kind: 'bar', startPeriod: 1, periodCount: 1, displayOrder: 0, wbsItemIds: [] },
  ];
}

describe('buildReorder — item, same lane', () => {
  it('moves an item earlier in its own lane and renumbers contiguously', () => {
    const commit: ItemReorderCommit = { entity: 'item', itemId: 12, laneId: 1, index: 0 };
    const payload = buildReorder(lanes, makeItems(), commit);
    expect(payload).toEqual({
      items: [
        { id: 12, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 1 },
        { id: 11, laneId: 1, displayOrder: 2 },
      ],
    });
  });

  it('drop on own position is a no-op -> null (no request)', () => {
    const commit: ItemReorderCommit = { entity: 'item', itemId: 11, laneId: 1, index: 1 };
    expect(buildReorder(lanes, makeItems(), commit)).toBeNull();
  });
});

describe('buildReorder — item, cross-lane', () => {
  it('writes laneId + displayOrder for the dragged item and renumbers BOTH lanes', () => {
    const commit: ItemReorderCommit = { entity: 'item', itemId: 10, laneId: 2, index: 1 };
    const payload = buildReorder(lanes, makeItems(), commit);
    expect(payload).toEqual({
      items: [
        { id: 20, laneId: 2, displayOrder: 0 },
        { id: 10, laneId: 2, displayOrder: 1 },
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 12, laneId: 1, displayOrder: 1 },
      ],
    });
  });

  it('lands at index 0 of an empty lane', () => {
    const commit: ItemReorderCommit = { entity: 'item', itemId: 10, laneId: 3, index: 0 };
    const payload = buildReorder(lanes, makeItems(), commit);
    expect(payload!.items).toContainEqual({ id: 10, laneId: 3, displayOrder: 0 });
    // Source lane (1) renumbered without the dragged item.
    expect(payload!.items).toContainEqual({ id: 11, laneId: 1, displayOrder: 0 });
    expect(payload!.items).toContainEqual({ id: 12, laneId: 1, displayOrder: 1 });
  });

  it('carries the window ONLY on the dragged item, only when it actually changed', () => {
    const commit: ItemReorderCommit = {
      entity: 'item',
      itemId: 10,
      laneId: 2,
      index: 0,
      window: { startPeriod: 5, periodCount: 2 },
    };
    const payload = buildReorder(lanes, makeItems(), commit);
    expect(payload!.items).toContainEqual({
      id: 10,
      laneId: 2,
      displayOrder: 0,
      startPeriod: 5,
      periodCount: 2,
    });
    // The bumped sibling never carries window fields.
    expect(payload!.items).toContainEqual({ id: 20, laneId: 2, displayOrder: 1 });
  });

  it('omits the window when the "window" passed in matches the item\'s current one exactly', () => {
    const commit: ItemReorderCommit = {
      entity: 'item',
      itemId: 10,
      laneId: 2,
      index: 0,
      window: { startPeriod: 1, periodCount: 3 }, // same as item 10's current window
    };
    const payload = buildReorder(lanes, makeItems(), commit);
    const draggedEntry = payload!.items!.find((i) => i.id === 10)!;
    expect(draggedEntry).toEqual({ id: 10, laneId: 2, displayOrder: 0 });
  });
});

describe('buildReorder — lane', () => {
  it('reorders lanes and renumbers all of them contiguously', () => {
    const commit: LaneReorderCommit = { entity: 'lane', laneId: 3, index: 0 };
    const payload = buildReorder(lanes, makeItems(), commit);
    expect(payload).toEqual({
      lanes: [
        { id: 3, displayOrder: 0 },
        { id: 1, displayOrder: 1 },
        { id: 2, displayOrder: 2 },
      ],
    });
  });

  it('dropping a lane back at its own position is a no-op -> null', () => {
    const commit: LaneReorderCommit = { entity: 'lane', laneId: 1, index: 0 };
    expect(buildReorder(lanes, makeItems(), commit)).toBeNull();
  });
});

describe('buildReorder — milestone/spread (window never touched unless explicitly asked)', () => {
  it('reordering a spread item vertically never emits window fields (none passed in)', () => {
    const items: RoadmapRowItem[] = [
      ...makeItems(),
      { id: 30, laneId: 1, name: 'Spread', kind: 'spread', startPeriod: 1, periodCount: 0, displayOrder: 3, wbsItemIds: [] },
    ];
    const commit: ItemReorderCommit = { entity: 'item', itemId: 30, laneId: 2, index: 0 };
    const payload = buildReorder(lanes, items, commit);
    const draggedEntry = payload!.items!.find((i) => i.id === 30)!;
    expect(draggedEntry).toEqual({ id: 30, laneId: 2, displayOrder: 0 });
    expect(draggedEntry.startPeriod).toBeUndefined();
    expect(draggedEntry.periodCount).toBeUndefined();
  });
});

describe('orderSnapshot', () => {
  it('captures displayOrder for the given lanes and every item inside them, no window fields', () => {
    const snapshot = orderSnapshot(lanes, makeItems(), [1, 2]);
    expect(snapshot.lanes).toEqual([
      { id: 1, displayOrder: 0 },
      { id: 2, displayOrder: 1 },
    ]);
    expect(snapshot.items).toEqual([
      { id: 10, laneId: 1, displayOrder: 0 },
      { id: 11, laneId: 1, displayOrder: 1 },
      { id: 12, laneId: 1, displayOrder: 2 },
      { id: 20, laneId: 2, displayOrder: 0 },
    ]);
    snapshot.items!.forEach((entry) => {
      expect(entry).not.toHaveProperty('startPeriod');
      expect(entry).not.toHaveProperty('periodCount');
    });
  });

  it('omits empty lanes/items arrays entirely rather than sending []', () => {
    const snapshot = orderSnapshot(lanes, makeItems(), [3]); // lane 3 has no items
    expect(snapshot.lanes).toEqual([{ id: 3, displayOrder: 2 }]);
    expect(snapshot.items).toBeUndefined();
  });

  it('round-trips: applying a commit then restoring the snapshot reproduces the original order', () => {
    const items = makeItems();
    const commit: ItemReorderCommit = { entity: 'item', itemId: 10, laneId: 2, index: 1 };
    const snapshot = orderSnapshot(lanes, items, [1, 2]); // taken BEFORE the commit is applied
    const forward = buildReorder(lanes, items, commit)!;
    expect(forward.items).not.toEqual(snapshot.items);

    // Simulate applying the forward payload, then restoring from the snapshot.
    const patched = new Map(items.map((i) => [i.id, { ...i }]));
    forward.items!.forEach((p) => {
      const item = patched.get(p.id)!;
      item.laneId = p.laneId;
      item.displayOrder = p.displayOrder;
    });
    snapshot.items!.forEach((p) => {
      const item = patched.get(p.id)!;
      item.laneId = p.laneId;
      item.displayOrder = p.displayOrder;
    });
    const restored = Array.from(patched.values());
    const restoredLane1 = restored.filter((i) => i.laneId === 1).sort((a, b) => a.displayOrder - b.displayOrder);
    const restoredLane2 = restored.filter((i) => i.laneId === 2).sort((a, b) => a.displayOrder - b.displayOrder);
    expect(restoredLane1.map((i) => i.id)).toEqual([10, 11, 12]);
    expect(restoredLane2.map((i) => i.id)).toEqual([20]);
  });
});

describe('applyRoadmapReorder', () => {
  function makeLane(id: number, displayOrder: number, items: RoadmapItem[]): RoadmapLaneWithItems {
    return { id, name: `Lane ${id}`, displayOrder, projectId: 1, createdAt: '', updatedAt: '', items };
  }
  function makeApiItem(id: number, laneId: number, displayOrder: number): RoadmapItem {
    return {
      id,
      name: `Item ${id}`,
      kind: 'bar',
      startPeriod: 1,
      periodCount: 1,
      displayOrder,
      laneId,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    };
  }

  it('reorders items within the same lane', () => {
    const apiLanes = [makeLane(1, 0, [makeApiItem(10, 1, 0), makeApiItem(11, 1, 1)])];
    const result = applyRoadmapReorder(apiLanes, {
      items: [
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 1 },
      ],
    });
    expect(result[0].items.map((i) => i.id)).toEqual([11, 10]);
    expect(result[0].items.map((i) => i.displayOrder)).toEqual([0, 1]);
  });

  it('moves an item to another lane, sorted into place among its new siblings (not pull/insertion order)', () => {
    const apiLanes = [makeLane(1, 0, [makeApiItem(10, 1, 0)]), makeLane(2, 1, [makeApiItem(20, 2, 0)])];
    // 10 is pulled first (lane 1 is processed before lane 2) but lands AFTER 20
    // in the payload -- proves the result is sorted by displayOrder, not by
    // pull/insertion order.
    const result = applyRoadmapReorder(apiLanes, {
      items: [
        { id: 10, laneId: 2, displayOrder: 1 },
        { id: 20, laneId: 2, displayOrder: 0 },
      ],
    });
    const lane1 = result.find((l) => l.id === 1)!;
    const lane2 = result.find((l) => l.id === 2)!;
    expect(lane1.items).toEqual([]);
    expect(lane2.items.map((i) => i.id)).toEqual([20, 10]);
    expect(lane2.items.every((i) => i.laneId === 2)).toBe(true);
  });

  it('patches lane displayOrder without touching their items', () => {
    const apiLanes = [makeLane(1, 0, [makeApiItem(10, 1, 0)]), makeLane(2, 1, [])];
    const result = applyRoadmapReorder(apiLanes, {
      lanes: [
        { id: 1, displayOrder: 1 },
        { id: 2, displayOrder: 0 },
      ],
    });
    expect(result.find((l) => l.id === 1)!.displayOrder).toBe(1);
    expect(result.find((l) => l.id === 2)!.displayOrder).toBe(0);
    expect(result.find((l) => l.id === 1)!.items.map((i) => i.id)).toEqual([10]);
  });

  it('is a no-op copy when the payload is empty', () => {
    const apiLanes = [makeLane(1, 0, [makeApiItem(10, 1, 0)])];
    const result = applyRoadmapReorder(apiLanes, {});
    expect(result).toEqual(apiLanes);
  });

  it('sort falls back to id when displayOrder ties (defensive)', () => {
    // Lane's items are pulled in [11, 10] order (their position in the lane's
    // own items array) but BOTH tie at displayOrder 0 after the patch -- the
    // id tie-break must still produce a deterministic [10, 11].
    const apiLanes = [makeLane(1, 0, [makeApiItem(11, 1, 1), makeApiItem(10, 1, 0)])];
    const result = applyRoadmapReorder(apiLanes, {
      items: [
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 0 },
      ],
    });
    expect(result[0].items.map((i) => i.id)).toEqual([10, 11]);
  });
});
