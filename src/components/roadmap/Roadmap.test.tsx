import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Roadmap } from './Roadmap';
import { Project, RoadmapLaneWithItems, WbsItem } from '../../services/api';
import { snapDrag, ZOOM_LADDER, DEFAULT_ZOOM_INDEX, periodX } from '../../utils/roadmapGeometry';
import { buildRoadmapLoad, buildByPeriodMatrix, demandHours, supplyHours } from '../../utils/roadmapLoad';
import { ReconciliationPanel } from '../ReconciliationPanel';

/**
 * Drives the KEYBOARD path, not the pointer path — no pointer harness needed,
 * and it exercises the exact same `snapDrag` + commit function the pointer
 * drag in `useRoadmapDrag.ts` calls. Per `timeline-component.md`'s testing
 * contract: "every one of the six gestures produces the same snapDrag result
 * and the same single PATCH."
 */

// Radix Select/DropdownMenu rely on pointer-capture / scrollIntoView APIs jsdom
// doesn't implement — both the "Add item" lane picker and the grid's row menus
// need this, per RolesEditor.test.tsx's precedent.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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

beforeEach(() => {
  installMemoryLocalStorage();
});

const PERIOD_WIDTH = ZOOM_LADDER[DEFAULT_ZOOM_INDEX];
const NP = 20; // one 20-period phase

const project: Project = {
  id: 1,
  name: 'Test project',
  daysInFTE: 20,
  clientCurrency: 'EUR',
  exchangeRate: 0.89,
  planningMode: 'weekly',
  phases: JSON.stringify([{ name: 'Phase 1', periodCount: NP, color: '#E3F2FD' }]),
  startDate: null,
  createdAt: '',
  updatedAt: '',
};

const wbsItems: WbsItem[] = [];

function makeLanes(): RoadmapLaneWithItems[] {
  return [
    {
      id: 1,
      name: 'Backend',
      displayOrder: 0,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      items: [
        {
          id: 10,
          name: 'API',
          kind: 'bar',
          startPeriod: 5,
          periodCount: 4,
          displayOrder: 0,
          laneId: 1,
          projectId: 1,
          createdAt: '',
          updatedAt: '',
          wbsItemIds: [],
        },
      ],
    },
    {
      id: 2,
      name: 'Frontend',
      displayOrder: 1,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      items: [],
    },
  ];
}

function renderRoadmap(lanes = makeLanes()) {
  const handlers = {
    onAddLane: vi.fn(() => Promise.resolve()),
    onUpdateLane: vi.fn(() => Promise.resolve()),
    onDeleteLane: vi.fn(() => Promise.resolve()),
    onAddItem: vi.fn(() =>
      Promise.resolve({
        id: 999,
        name: 'New item',
        kind: 'bar' as const,
        startPeriod: 1,
        periodCount: 1,
        displayOrder: 0,
        laneId: 1,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        wbsItemIds: [],
      })
    ),
    onUpdateItem: vi.fn(() => Promise.resolve()),
    onDeleteItem: vi.fn(() => Promise.resolve()),
    onReorderRoadmap: vi.fn(() => Promise.resolve()),
    onReplaceItemLinks: vi.fn(() => Promise.resolve()),
    onBootstrap: vi.fn(() => Promise.resolve()),
    onSetStartDate: vi.fn(() => Promise.resolve()),
    onGenerateDraftPlan: vi.fn(() => Promise.resolve()),
  };
  const utils = render(
    <Roadmap
      project={project}
      wbsItems={wbsItems}
      roadmapLanes={lanes}
      resourcePlans={[]}
      rateCards={[]}
      onAddLane={handlers.onAddLane}
      onUpdateLane={handlers.onUpdateLane}
      onDeleteLane={handlers.onDeleteLane}
      onAddItem={handlers.onAddItem}
      onUpdateItem={handlers.onUpdateItem}
      onDeleteItem={handlers.onDeleteItem}
      onReorderRoadmap={handlers.onReorderRoadmap}
      onReplaceItemLinks={handlers.onReplaceItemLinks}
      onBootstrap={handlers.onBootstrap}
      onSetStartDate={handlers.onSetStartDate}
      onGenerateDraftPlan={handlers.onGenerateDraftPlan}
    />
  );
  return { ...handlers, ...utils };
}

const ORIGIN = { startPeriod: 5, periodCount: 4 };

describe('Roadmap keyboard parity (CAP-4)', () => {
  it('ArrowRight moves by one period — same snapDrag result as the pointer path would produce', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowRight' });

    const expected = snapDrag('move', ORIGIN, PERIOD_WIDTH, PERIOD_WIDTH, NP);
    expect(handlers.onUpdateItem).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      startPeriod: expected.startPeriod,
      periodCount: expected.periodCount,
    });
  });

  it('ArrowLeft moves by one period the other way', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });

    const expected = snapDrag('move', ORIGIN, -PERIOD_WIDTH, PERIOD_WIDTH, NP);
    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      startPeriod: expected.startPeriod,
      periodCount: expected.periodCount,
    });
  });

  it('Shift+ArrowRight resizes the finish edge by one period', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowRight', shiftKey: true });

    const expected = snapDrag('resizeEnd', ORIGIN, PERIOD_WIDTH, PERIOD_WIDTH, NP);
    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      startPeriod: expected.startPeriod,
      periodCount: expected.periodCount,
    });
    expect(expected.startPeriod).toBe(ORIGIN.startPeriod); // resizeEnd never moves the start
  });

  it('Alt+ArrowLeft resizes the start edge by one period, keeping the finish fixed', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowLeft', altKey: true });

    const expected = snapDrag('resizeStart', ORIGIN, -PERIOD_WIDTH, PERIOD_WIDTH, NP);
    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      startPeriod: expected.startPeriod,
      periodCount: expected.periodCount,
    });
    const finish = expected.startPeriod + expected.periodCount - 1;
    expect(finish).toBe(ORIGIN.startPeriod + ORIGIN.periodCount - 1);
  });

  it('Ctrl+ArrowDown moves the item to the next lane at an explicit tail index, window unchanged, via ONE atomic reorder request', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowDown', ctrlKey: true });

    // The vertical placement changed -> routes through the atomic reorder
    // endpoint, not the single-item PATCH (spec-roadmap-vertical-drag.md).
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
    expect(handlers.onReorderRoadmap).toHaveBeenCalledTimes(1);
    // Lane 2 (Frontend) is empty -> tail index 0, matching server append semantics.
    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      items: [{ id: 10, laneId: 2, displayOrder: 0 }],
    });
  });

  it('Ctrl+ArrowDown appends after the destination lane\'s EXISTING items, not always at index 0', () => {
    // Regression guard: the empty-lane-2 fixture above can't distinguish
    // "append at the destination's current item count" from "always insert
    // at index 0" -- give lane 2 an item first.
    const lanes = makeLanes();
    lanes[1].items.push({
      id: 20,
      name: 'Design',
      kind: 'bar',
      startPeriod: 1,
      periodCount: 2,
      displayOrder: 0,
      laneId: 2,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    });
    const handlers = renderRoadmap(lanes);
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowDown', ctrlKey: true });

    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      items: [
        { id: 20, laneId: 2, displayOrder: 0 },
        { id: 10, laneId: 2, displayOrder: 1 }, // appended AFTER item 20, not at index 0
      ],
    });
  });

  it('Ctrl+ArrowUp is a no-op when already the first lane', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowUp', ctrlKey: true });
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
    expect(handlers.onReorderRoadmap).not.toHaveBeenCalled();
  });

  it('Alt+ArrowDown reorders within the lane through the same atomic commit path', () => {
    const handlers = renderRoadmap();
    handlers.unmount();
    const lanes = makeLanes();
    lanes[0].items.push({
      id: 11,
      name: 'Design',
      kind: 'bar',
      startPeriod: 1,
      periodCount: 2,
      displayOrder: 1,
      laneId: 1,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    });
    // renderRoadmap already rendered once above; render fresh with the two-item lane.
    const utils2 = render(
      <Roadmap
        project={project}
        wbsItems={wbsItems}
        roadmapLanes={lanes}
        resourcePlans={[]}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={handlers.onReorderRoadmap}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );
    handlers.onReorderRoadmap.mockClear();
    const firstBar = utils2.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(firstBar, { key: 'ArrowDown', altKey: true });

    expect(handlers.onReorderRoadmap).toHaveBeenCalledTimes(1);
    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      items: [
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 1 },
      ],
    });
  });

  it('Space opens the editor panel for the focused item', () => {
    renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: ' ' });
    expect(screen.getByTestId('roadmap-editor-panel')).toBeInTheDocument();
  });

  it('Escape deselects (cancels) without issuing a write', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.click(bar);
    expect(bar).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(bar).toHaveAttribute('aria-selected', 'false');
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
  });

  it('a plain arrow key without modifiers is a MOVE, not a resize', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    const call = handlers.onUpdateItem.mock.calls[0] as unknown as [number, { periodCount: number }];
    expect(call[1].periodCount).toBe(ORIGIN.periodCount); // move never changes duration
  });
});

describe('RoadmapGrid keyboard parity (grid rows take the same bindings as bars)', () => {
  it('a plain ArrowRight on a grid row moves the window, same as a bar', () => {
    const handlers = renderRoadmap();
    const row = screen.getByTestId('roadmap-grid-item-10');
    fireEvent.keyDown(row, { key: 'ArrowRight' });

    const expected = snapDrag('move', ORIGIN, PERIOD_WIDTH, PERIOD_WIDTH, NP);
    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      startPeriod: expected.startPeriod,
      periodCount: expected.periodCount,
    });
  });

  it('Alt+ArrowDown on a grid row reorders within the lane through the same atomic commit path as a bar', () => {
    const lanes = makeLanes();
    lanes[0].items.push({
      id: 11,
      name: 'Design',
      kind: 'bar',
      startPeriod: 1,
      periodCount: 2,
      displayOrder: 1,
      laneId: 1,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    });
    const handlers = renderRoadmap(lanes);
    const row = screen.getByTestId('roadmap-grid-item-10');
    fireEvent.keyDown(row, { key: 'ArrowDown', altKey: true });

    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      items: [
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 1 },
      ],
    });
  });

  it('Enter on a focused (collapsed) lane row toggles it, same as a click', () => {
    renderRoadmap();
    const laneRow = screen.getByTestId('roadmap-grid-lane-1');
    expect(laneRow).toHaveTextContent('▾');
    fireEvent.keyDown(laneRow, { key: 'Enter' });
    expect(laneRow).toHaveTextContent('▸');
  });
});

describe('Row menu Move up / Move down route through the same atomic reorder path', () => {
  it('lane menu "Move down" calls onReorderRoadmap with the swapped lane order, not onUpdateLane', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Backend lane menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));

    expect(handlers.onUpdateLane).not.toHaveBeenCalled();
    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      lanes: [
        { id: 2, displayOrder: 0 },
        { id: 1, displayOrder: 1 },
      ],
    });
  });

  it('item menu "Move down" calls onReorderRoadmap with the renumbered lane, not onUpdateItem', async () => {
    const user = userEvent.setup();
    const lanes = makeLanes();
    lanes[0].items.push({
      id: 11,
      name: 'Design',
      kind: 'bar',
      startPeriod: 1,
      periodCount: 2,
      displayOrder: 1,
      laneId: 1,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    });
    const handlers = renderRoadmap(lanes);

    await user.click(screen.getByRole('button', { name: 'API item menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));

    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
    expect(handlers.onReorderRoadmap).toHaveBeenCalledWith({
      items: [
        { id: 11, laneId: 1, displayOrder: 0 },
        { id: 10, laneId: 1, displayOrder: 1 },
      ],
    });
  });
});

describe('Roadmap empty state and bootstrap', () => {
  it('shows the empty state with Create-from-WBS disabled when the WBS is empty', () => {
    renderRoadmap([]);
    expect(screen.getByText('No roadmap yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create from WBS' })).toBeDisabled();
  });
});

describe('column grid alignment', () => {
  it('the phase band left edge lands exactly on the period column it starts at', () => {
    renderRoadmap();
    // Phase 1 is the only phase and starts at period 1 -> left 0.
    const bands = screen.getByTestId('roadmap-phase-bands');
    const firstBand = bands.firstElementChild as HTMLElement;
    expect(firstBand.style.left).toBe(`${periodX(1, PERIOD_WIDTH)}px`);
  });

  it('every period column has the same width as periodWidth used by the bar geometry', () => {
    renderRoadmap();
    const col1 = screen.getByTestId('roadmap-period-col-1');
    expect(col1.style.width).toBe(`${PERIOD_WIDTH}px`);
  });

  it('the load strip cell for period p shares a left edge and width with the header/row column (third grid)', () => {
    renderRoadmap();
    const headerCol = screen.getByTestId('roadmap-period-col-3');
    const loadCell = screen.getByTestId('roadmap-load-cell-3');
    // Same fixed-width flow layout as the header/period columns -> same width,
    // and the same DOM order from period 1 gives it the same left edge.
    expect(loadCell.style.width).toBe(headerCol.style.width);
    expect(loadCell.style.width).toBe(`${PERIOD_WIDTH}px`);

    const stripScroll = screen.getByTestId('roadmap-load-strip-scroll');
    const cellsInOrder = Array.from(stripScroll.querySelectorAll('[data-testid^="roadmap-load-cell-"]'));
    expect(cellsInOrder[2]).toBe(loadCell); // period 3 is the 3rd cell, same as the header's 3rd column
  });
});

describe('CAP-9 over-demand stripe (roadmapLoad wiring)', () => {
  it('renders a stripe on a bar whose linked demand exceeds zero supply over its whole window', () => {
    const overDemandWbsItems: WbsItem[] = [
      {
        id: 500,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [
          { id: 1, discipline: 'Engineering', role: 'Backend Developer', hours: 400, wbsItemId: 500, createdAt: '', updatedAt: '' },
        ],
      },
    ];
    const lanes = makeLanes();
    lanes[0].items[0].wbsItemIds = [500];

    render(
      <Roadmap
        project={project}
        wbsItems={overDemandWbsItems}
        roadmapLanes={lanes}
        resourcePlans={[]}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );

    // Item 10 (W5-W8) has 400h of Backend demand and zero resource-plan supply
    // anywhere -> every period in its window is over-demand.
    expect(screen.getByTestId('roadmap-stripe-10')).toBeInTheDocument();
  });

  it('draws no stripe when supply covers demand across the whole window', () => {
    const coveredWbsItems: WbsItem[] = [
      {
        id: 501,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [
          { id: 2, discipline: 'Engineering', role: 'Backend Developer', hours: 40, wbsItemId: 501, createdAt: '', updatedAt: '' },
        ],
      },
    ];
    const lanes = makeLanes();
    lanes[0].items[0].wbsItemIds = [501];
    const resourcePlans = [
      {
        id: 1,
        role: 'Backend Developer',
        intHourlyRate: 0,
        clientHourlyRate: 0,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        allocations: [5, 6, 7, 8].map((p) => ({
          id: p,
          periodNumber: p,
          allocation: 100,
          resourcePlanId: 1,
          createdAt: '',
          updatedAt: '',
        })),
      },
    ];

    render(
      <Roadmap
        project={project}
        wbsItems={coveredWbsItems}
        roadmapLanes={lanes}
        resourcePlans={resourcePlans}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );

    expect(screen.queryByTestId('roadmap-stripe-10')).not.toBeInTheDocument();
  });
});

describe('CAP-9 load strip', () => {
  it("a cell's demand/supply figures match a direct roadmapLoad.ts call for the same period", () => {
    const loadWbsItems: WbsItem[] = [
      {
        id: 502,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [
          { id: 3, discipline: 'Engineering', role: 'Backend Developer', hours: 200, wbsItemId: 502, createdAt: '', updatedAt: '' },
        ],
      },
    ];
    const lanes = makeLanes();
    lanes[0].items[0].wbsItemIds = [502];
    const resourcePlans = [
      {
        id: 1,
        role: 'Backend Developer',
        intHourlyRate: 0,
        clientHourlyRate: 0,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        allocations: [{ id: 1, periodNumber: 6, allocation: 50, resourcePlanId: 1, createdAt: '', updatedAt: '' }],
      },
    ];

    render(
      <Roadmap
        project={project}
        wbsItems={loadWbsItems}
        roadmapLanes={lanes}
        resourcePlans={resourcePlans}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );

    // Item 10 (W5-W8), 200h Backend Developer -> 50h/period demand.
    // Period 6 supply: 50% allocation * 40h/period = 20h.
    const expectedLoad = buildRoadmapLoad({
      wbsItems: loadWbsItems,
      roadmapItems: [{ id: 10, name: 'API', kind: 'bar', startPeriod: 5, periodCount: 4 }],
      links: [{ wbsItemId: 502, roadmapItemId: 10 }],
      resourcePlans,
      rateCards: [],
      phases: JSON.parse(project.phases as string),
      planningMode: 'weekly',
      daysInFTE: project.daysInFTE,
    });
    const expectedDemand = Math.round(demandHours(expectedLoad, 'role', 'Backend Developer', 6));
    const expectedSupply = Math.round(supplyHours(expectedLoad, 'role', 'Backend Developer', 6));
    expect(expectedDemand).toBe(50);
    expect(expectedSupply).toBe(20);

    const cell = screen.getByTestId('roadmap-load-cell-6');
    expect(cell).toHaveAccessibleName(`Period 6: ${expectedDemand} of ${expectedSupply} hours`);
  });
});

describe('CAP-13 draft plan from the roadmap (feature frozen)', () => {
  it('stays disabled even when the roadmap has demand', () => {
    const draftWbsItems: WbsItem[] = [
      {
        id: 503,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [
          { id: 4, discipline: 'Engineering', role: 'Backend Developer', hours: 160, wbsItemId: 503, createdAt: '', updatedAt: '' },
        ],
      },
    ];
    const lanes = makeLanes();
    lanes[0].items[0].wbsItemIds = [503];

    render(
      <Roadmap
        project={project}
        wbsItems={draftWbsItems}
        roadmapLanes={lanes}
        resourcePlans={[]}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );

    // Frozen: unlike the other toolbar buttons, this one no longer keys off
    // roadmap state — it stays disabled regardless of demand until unfrozen.
    expect(screen.getByRole('button', { name: 'Draft plan from roadmap' })).toBeDisabled();
  });

  it('is disabled when the roadmap has no demand anywhere', () => {
    renderRoadmap(); // default fixture: empty wbsItems, no linked scope
    expect(screen.getByRole('button', { name: 'Draft plan from roadmap' })).toBeDisabled();
  });
});

describe('Done-means cross-check: stripe, load strip and by-period matrix agree cell-for-cell', () => {
  it('a deliberately over-committed fixture reads identically in all three places, because all three call buildRoadmapLoad', () => {
    // One Backend Developer, 700h, over periods 1-4 (175h/period demand) against
    // 100h/period supply — every period in the window is over-demand.
    const overCommittedWbsItems: WbsItem[] = [
      {
        id: 900,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [{ id: 90, discipline: 'Engineering', role: 'Backend Developer', hours: 700, wbsItemId: 900, createdAt: '', updatedAt: '' }],
      },
    ];
    const lanes = makeLanes();
    lanes[0].items[0].startPeriod = 1;
    lanes[0].items[0].periodCount = 4;
    lanes[0].items[0].wbsItemIds = [900];
    const resourcePlans = [
      {
        id: 1,
        role: 'Backend Developer',
        intHourlyRate: 0,
        clientHourlyRate: 0,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        allocations: [1, 2, 3, 4].map((p) => ({ id: p, periodNumber: p, allocation: 250, resourcePlanId: 1, createdAt: '', updatedAt: '' })), // 250% = 100h/period
      },
    ];

    // The ONE engine call every reader is supposed to share.
    const sharedLoad = buildRoadmapLoad({
      wbsItems: overCommittedWbsItems,
      roadmapItems: [{ id: 10, name: 'API', kind: 'bar', startPeriod: 1, periodCount: 4 }],
      links: [{ wbsItemId: 900, roadmapItemId: 10 }],
      resourcePlans,
      rateCards: [],
      phases: JSON.parse(project.phases as string),
      planningMode: 'weekly',
      daysInFTE: project.daysInFTE,
    });
    const expectedDemandP2 = demandHours(sharedLoad, 'role', 'Backend Developer', 2);
    const expectedSupplyP2 = supplyHours(sharedLoad, 'role', 'Backend Developer', 2);
    expect(expectedDemandP2).toBe(175);
    expect(expectedSupplyP2).toBe(100);

    // 1) The bar's stripe (RoadmapTimeline, via <Roadmap>): covers the whole window.
    render(
      <Roadmap
        project={project}
        wbsItems={overCommittedWbsItems}
        roadmapLanes={lanes}
        resourcePlans={resourcePlans}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn(() => Promise.resolve())}
      />
    );
    expect(screen.getByTestId('roadmap-stripe-10')).toBeInTheDocument();

    // 2) The load strip's period-2 cell (same render tree): "175/100".
    const loadCell = screen.getByTestId('roadmap-load-cell-2');
    expect(loadCell).toHaveAccessibleName(
      `Period 2: ${Math.round(expectedDemandP2)} of ${Math.round(expectedSupplyP2)} hours`
    );

    // 3) The by-period matrix (ReconciliationPanel, mounted separately as Wbs.tsx
    // does): the SAME period-2 cell for the SAME role, from the SAME engine call.
    const matrix = buildByPeriodMatrix(sharedLoad, 'role');
    render(
      <ReconciliationPanel
        report={{
          projectTotal: { wbsHours: 0, planHours: 0, varianceHours: 0 },
          byDiscipline: [],
          byPhaseDiscipline: [],
          phaseLevelAvailable: false,
          unassignedWbs: { totalHours: 0, byDiscipline: [] },
          unmappedPlan: { totalHours: 0, rows: [] },
        }}
        byPeriodRoleMatrix={matrix}
        byPeriodDisciplineMatrix={buildByPeriodMatrix(sharedLoad, 'discipline')}
      />
    );
    const matrixRow = matrix.rows.find((r) => r.key === 'Backend Developer')!;
    expect(matrixRow.cells[1].demand).toBe(expectedDemandP2); // index 1 -> period 2
    expect(matrixRow.cells[1].supply).toBe(expectedSupplyP2);
    expect(screen.getAllByText(`${Math.round(expectedDemandP2)}/${Math.round(expectedSupplyP2)}`).length).toBeGreaterThan(0);
  });
});

describe('Roadmap modals replace native browser prompts', () => {
  it('never calls window.prompt, confirm, or alert across add/rename/delete', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const confirmSpy = vi.spyOn(window, 'confirm');
    const alertSpy = vi.spyOn(window, 'alert');
    const user = userEvent.setup();
    renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Add lane' }));
    await user.type(screen.getByLabelText('Lane name'), 'QA');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    await user.click(screen.getByRole('button', { name: 'Backend lane menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    await user.click(screen.getByRole('button', { name: 'API item menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(promptSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('Add lane opens a modal and calls onAddLane with the trimmed name', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Add lane' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Add lane')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(screen.getByLabelText('Lane name'), '  QA  ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(handlers.onAddLane).toHaveBeenCalledWith('QA');
  });

  it('Rename lane (from the grid row menu) calls onUpdateLane with the new name', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Backend lane menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByLabelText('Lane name');
    expect(input).toHaveValue('Backend');
    await user.clear(input);
    await user.type(input, 'Platform');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(handlers.onUpdateLane).toHaveBeenCalledWith(1, { name: 'Platform' });
    // Regression: a menu item click is a React-tree descendant of the row (via
    // Radix's portal), so without stopPropagation on the menu content, this
    // click would also bubble up and fire the row's own onClick (toggleLane).
    expect(screen.getByTestId('roadmap-grid-lane-1')).toHaveTextContent('▾');
  });

  it('Delete lane shows a confirm modal; Cancel is a no-op, Delete calls onDeleteLane', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Backend lane menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete lane' }));
    const alertDialog = screen.getByRole('alertdialog');
    expect(within(alertDialog).getByText(/Delete "Backend" and its 1 item\?/)).toBeInTheDocument();

    await user.click(within(alertDialog).getByRole('button', { name: 'Cancel' }));
    expect(handlers.onDeleteLane).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Backend lane menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete lane' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete lane' }));
    expect(handlers.onDeleteLane).toHaveBeenCalledWith(1);
  });

  it('Delete item shows a confirm modal and calls onDeleteItem, clearing selection', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();
    fireEvent.click(screen.getByTestId('roadmap-bar-10'));
    expect(screen.getByTestId('roadmap-bar-10')).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'API item menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    expect(handlers.onDeleteItem).toHaveBeenCalledWith(10);
  });

  it('Add bar opens a modal with Name + Lane and calls onAddItem with the picked lane', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Add bar' }));
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Design review');
    await user.click(within(dialog).getByRole('button', { name: 'Add bar' }));

    expect(handlers.onAddItem).toHaveBeenCalledWith(1, {
      name: 'Design review',
      kind: 'bar',
      startPeriod: 1,
      periodCount: 1,
    });
  });

  it('Add milestone and Add spread create zero-width items of the picked kind', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Add milestone' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add milestone' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add milestone' }));
    expect(handlers.onAddItem).toHaveBeenCalledWith(1, {
      name: 'New milestone',
      kind: 'milestone',
      startPeriod: 1,
      periodCount: 0,
    });

    await user.click(screen.getByRole('button', { name: 'Add spread' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add spread' }));
    expect(handlers.onAddItem).toHaveBeenCalledWith(1, {
      name: 'New spread',
      kind: 'spread',
      startPeriod: 1,
      periodCount: 0,
    });
  });

  it('Set start date opens a modal; Clear is hidden until a date is set', async () => {
    const user = userEvent.setup();
    const handlers = renderRoadmap();

    await user.click(screen.getByRole('button', { name: 'Set start date' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Project start date'), {
      target: { value: '2026-09-01' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(handlers.onSetStartDate).toHaveBeenCalledWith('2026-09-01');
  });
});

describe('zoom persistence', () => {
  it('restores a stored zoom level across unmount/remount (survives a tab switch)', () => {
    const zoomedIndex = DEFAULT_ZOOM_INDEX + 1;
    window.localStorage.setItem(`roadmap-zoom:${project.id}`, String(zoomedIndex));
    const zoomedWidth = ZOOM_LADDER[zoomedIndex];

    const first = renderRoadmap();
    expect(screen.getByTestId('roadmap-period-col-1').style.width).toBe(`${zoomedWidth}px`);
    first.unmount();

    renderRoadmap();
    expect(screen.getByTestId('roadmap-period-col-1').style.width).toBe(`${zoomedWidth}px`);
  });
});

function makeLanesWithTwoBars(): RoadmapLaneWithItems[] {
  return [
    {
      id: 1,
      name: 'Backend',
      displayOrder: 0,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      items: [
        {
          id: 10,
          name: 'API',
          kind: 'bar',
          startPeriod: 3,
          periodCount: 4, // W3-6
          displayOrder: 0,
          laneId: 1,
          projectId: 1,
          createdAt: '',
          updatedAt: '',
          wbsItemIds: [],
        },
        {
          id: 11,
          name: 'Rollout',
          kind: 'bar',
          startPeriod: 9,
          periodCount: 4, // W9-12
          displayOrder: 1,
          laneId: 1,
          projectId: 1,
          createdAt: '',
          updatedAt: '',
          wbsItemIds: [],
        },
      ],
    },
    { id: 2, name: 'Frontend', displayOrder: 1, projectId: 1, createdAt: '', updatedAt: '', items: [] },
  ];
}

describe('bar edge resize cursor', () => {
  it('a bar exposes both resize handles with ew-resize; the bar itself stays grab', () => {
    renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    expect(bar).toHaveClass('cursor-grab');
    const start = screen.getByTestId('roadmap-bar-10-resize-start');
    const end = screen.getByTestId('roadmap-bar-10-resize-end');
    expect(start).toHaveClass('cursor-ew-resize');
    expect(end).toHaveClass('cursor-ew-resize');
  });

  it('milestone and spread rows do not render resize handles', () => {
    const lanes: RoadmapLaneWithItems[] = [
      {
        id: 1,
        name: 'Backend',
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        items: [
          {
            id: 20,
            name: 'Go-live',
            kind: 'milestone',
            startPeriod: 8,
            periodCount: 0,
            displayOrder: 0,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
          {
            id: 21,
            name: 'Support',
            kind: 'spread',
            startPeriod: 1,
            periodCount: 0,
            displayOrder: 1,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
        ],
      },
    ];
    renderRoadmap(lanes);
    expect(screen.getByTestId('roadmap-bar-20')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-bar-21')).toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-bar-20-resize-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-bar-20-resize-end')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-bar-21-resize-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-bar-21-resize-end')).not.toBeInTheDocument();
  });
});

describe('milestone name label', () => {
  it('renders the item name to the right of the diamond; bars and spreads stay unlabeled', () => {
    const lanes: RoadmapLaneWithItems[] = [
      {
        id: 1,
        name: 'Backend',
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        items: [
          {
            id: 20,
            name: 'Go-live',
            kind: 'milestone',
            startPeriod: 8,
            periodCount: 0,
            displayOrder: 0,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
          {
            id: 21,
            name: 'Support',
            kind: 'spread',
            startPeriod: 1,
            periodCount: 0,
            displayOrder: 1,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
          {
            id: 22,
            name: 'API',
            kind: 'bar',
            startPeriod: 2,
            periodCount: 3,
            displayOrder: 2,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
        ],
      },
    ];
    renderRoadmap(lanes);
    const label = screen.getByTestId('roadmap-milestone-label-20');
    expect(label).toHaveTextContent('Go-live');
    const diamond = screen.getByTestId('roadmap-bar-20');
    const diamondRight =
      parseFloat(diamond.style.left) + parseFloat(diamond.style.width);
    expect(parseFloat(label.style.left)).toBeGreaterThan(diamondRight);
    expect(screen.queryByTestId('roadmap-milestone-label-21')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-milestone-label-22')).not.toBeInTheDocument();
  });
});

describe('bar drag preview', () => {
  it('resizing shows stretch follow + snapped preview, not the move floating ghost', () => {
    renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    // jsdom defaults getBoundingClientRect to zeros; stub a 100px bar so the
    // right edge maps to resizeEnd (same rule as production hit-testing).
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 18,
      width: 100,
      height: 18,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(bar, { clientX: 96, clientY: 9, button: 0 });
    fireEvent.pointerMove(bar, { clientX: 96 + PERIOD_WIDTH, clientY: 9 });
    expect(screen.getByTestId('roadmap-resize-follow')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-resize-snapped')).toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-drag-follow')).not.toBeInTheDocument();
    fireEvent.pointerUp(bar, { clientX: 96 + PERIOD_WIDTH, clientY: 9 });
  });

  it('moving shows the floating drag ghost, not the resize stretch layer', () => {
    renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 100,
      top: 0,
      bottom: 18,
      width: 100,
      height: 18,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(bar, { clientX: 50, clientY: 9, button: 0 });
    fireEvent.pointerMove(bar, { clientX: 50 + PERIOD_WIDTH, clientY: 9 });
    expect(screen.getByTestId('roadmap-drag-follow')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-drag-snapped')).toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-resize-follow')).not.toBeInTheDocument();
    fireEvent.pointerUp(bar, { clientX: 50 + PERIOD_WIDTH, clientY: 9 });
  });
});

describe('lane summary bars', () => {
  it('draws one summary bar spanning the union window, edges matching the first/last item bars to the pixel', () => {
    renderRoadmap(makeLanesWithTwoBars());
    const laneBar = screen.getByTestId('roadmap-lane-bar-1');
    const item10 = screen.getByTestId('roadmap-bar-10');
    const item11 = screen.getByTestId('roadmap-bar-11');
    expect(laneBar.style.left).toBe(item10.style.left);
    const laneRight = parseFloat(laneBar.style.left) + parseFloat(laneBar.style.width);
    const item11Right = parseFloat(item11.style.left) + parseFloat(item11.style.width);
    expect(laneRight).toBe(item11Right);
    expect(screen.queryByTestId('roadmap-lane-label-1')).not.toBeInTheDocument();
  });

  it('an empty lane draws no bar', () => {
    renderRoadmap(makeLanesWithTwoBars());
    expect(screen.queryByTestId('roadmap-lane-bar-2')).not.toBeInTheDocument();
  });

  it('a lane with only spread items draws no bar', () => {
    const lanes: RoadmapLaneWithItems[] = [
      {
        id: 1,
        name: 'PMO',
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        items: [
          {
            id: 12,
            name: 'PM',
            kind: 'spread',
            startPeriod: 1,
            periodCount: 0,
            displayOrder: 0,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
        ],
      },
    ];
    renderRoadmap(lanes);
    expect(screen.queryByTestId('roadmap-lane-bar-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-lane-spread-chip-1')).not.toBeInTheDocument();
  });

  it('a spread item never widens the lane bar', () => {
    const lanes = makeLanesWithTwoBars();
    lanes[0].items.push({
      id: 12,
      name: 'PM',
      kind: 'spread',
      startPeriod: 1,
      periodCount: 0,
      displayOrder: 2,
      laneId: 1,
      projectId: 1,
      createdAt: '',
      updatedAt: '',
      wbsItemIds: [],
    });
    renderRoadmap(lanes);
    const laneBar = screen.getByTestId('roadmap-lane-bar-1');
    const item10 = screen.getByTestId('roadmap-bar-10');
    expect(laneBar.style.left).toBe(item10.style.left);
    expect(screen.queryByTestId('roadmap-lane-spread-chip-1')).not.toBeInTheDocument();
  });

  it('clicking the lane bar toggles collapse and issues no request', () => {
    const handlers = renderRoadmap(makeLanesWithTwoBars());
    const laneBar = screen.getByTestId('roadmap-lane-bar-1');
    fireEvent.click(laneBar);
    expect(screen.queryByTestId('roadmap-bar-10')).not.toBeInTheDocument(); // items now hidden
    expect(screen.getByTestId('roadmap-lane-bar-1')).toBeInTheDocument(); // the bar itself is still drawn
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
    expect(handlers.onUpdateLane).not.toHaveBeenCalled();
  });

  it('a drag attempt on the lane bar does nothing — no ghost, no request', () => {
    const handlers = renderRoadmap(makeLanesWithTwoBars());
    const laneBar = screen.getByTestId('roadmap-lane-bar-1');
    expect(laneBar).toHaveClass('cursor-pointer');
    expect(laneBar).not.toHaveClass('cursor-grab');
    fireEvent.pointerDown(laneBar, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(laneBar, { clientX: 100, clientY: 0 });
    fireEvent.pointerUp(laneBar, { clientX: 100, clientY: 0 });
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
  });

  it('Enter/Space on a focused lane bar toggles collapse, matching the pointer behaviour', () => {
    renderRoadmap(makeLanesWithTwoBars());
    const laneBar = screen.getByTestId('roadmap-lane-bar-1');
    fireEvent.keyDown(laneBar, { key: 'Enter' });
    expect(screen.queryByTestId('roadmap-bar-10')).not.toBeInTheDocument();
    fireEvent.keyDown(laneBar, { key: ' ' });
    expect(screen.getByTestId('roadmap-bar-10')).toBeInTheDocument();
  });
});

describe('collapsed lane rollups', () => {
  it('shows a rolled-up milestone tick and the union over-demand stripe only while collapsed', () => {
    const overDemandWbsItems: WbsItem[] = [
      {
        id: 500,
        name: 'Backend leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [
          { id: 1, discipline: 'Engineering', role: 'Backend Developer', hours: 400, wbsItemId: 500, createdAt: '', updatedAt: '' },
        ],
      },
    ];
    const lanes: RoadmapLaneWithItems[] = [
      {
        id: 1,
        name: 'Backend',
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        items: [
          {
            id: 10,
            name: 'API',
            kind: 'bar',
            startPeriod: 5,
            periodCount: 4, // W5-8, over-demand: zero resource-plan supply anywhere
            displayOrder: 0,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [500],
          },
          {
            id: 11,
            name: 'Launch',
            kind: 'milestone',
            startPeriod: 8,
            periodCount: 0,
            displayOrder: 1,
            laneId: 1,
            projectId: 1,
            createdAt: '',
            updatedAt: '',
            wbsItemIds: [],
          },
        ],
      },
    ];

    render(
      <Roadmap
        project={project}
        wbsItems={overDemandWbsItems}
        roadmapLanes={lanes}
        resourcePlans={[]}
        rateCards={[]}
        onAddLane={vi.fn()}
        onUpdateLane={vi.fn()}
        onDeleteLane={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn(() => Promise.resolve())}
        onDeleteItem={vi.fn()}
        onReorderRoadmap={vi.fn(() => Promise.resolve())}
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
        onGenerateDraftPlan={vi.fn()}
      />
    );

    // Expanded: the item rows own the tick and stripe, the lane bar draws neither.
    expect(screen.queryByTestId('roadmap-lane-milestone-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-lane-stripe-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('roadmap-lane-bar-1'));

    // Collapsed: item rows are gone, the lane bar carries the rollups instead.
    expect(screen.queryByTestId('roadmap-bar-10')).not.toBeInTheDocument();
    expect(screen.getByTestId('roadmap-lane-milestone-1')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-lane-stripe-1')).toBeInTheDocument();
  });
});

describe('Lane bars toggle', () => {
  it('is on by default, so the feature is discoverable', () => {
    renderRoadmap(makeLanesWithTwoBars());
    expect(screen.getByTestId('roadmap-lane-bar-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lane bars/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pressing the toggle hides the whole summary layer in one render; item rows, grid and load strip are untouched', () => {
    renderRoadmap(makeLanesWithTwoBars());
    fireEvent.click(screen.getByRole('button', { name: /Lane bars/ }));

    expect(screen.queryByTestId('roadmap-lane-bar-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-lane-spread-chip-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('roadmap-row-lane-1')).toBeInTheDocument(); // the plain tinted row remains
    expect(screen.getByTestId('roadmap-bar-10')).toBeInTheDocument(); // item rows untouched
    expect(screen.getByTestId('roadmap-grid-lane-1')).toBeInTheDocument(); // left grid untouched
  });

  it('persists to localStorage and restores across unmount/remount for the same project', () => {
    const first = renderRoadmap(makeLanesWithTwoBars());
    fireEvent.click(screen.getByRole('button', { name: /Lane bars/ }));
    expect(screen.queryByTestId('roadmap-lane-bar-1')).not.toBeInTheDocument();
    first.unmount();

    renderRoadmap(makeLanesWithTwoBars());
    expect(screen.queryByTestId('roadmap-lane-bar-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lane bars/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to on when localStorage throws, with nothing surfaced to the user', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      renderRoadmap(makeLanesWithTwoBars());
      expect(screen.getByTestId('roadmap-lane-bar-1')).toBeInTheDocument();
    } finally {
      installMemoryLocalStorage();
    }
  });
});
