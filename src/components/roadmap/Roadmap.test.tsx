import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Roadmap } from './Roadmap';
import { Project, RoadmapLaneWithItems, WbsItem } from '../../services/api';
import { snapDrag, ZOOM_LADDER, DEFAULT_ZOOM_INDEX, periodX } from '../../utils/roadmapGeometry';

/**
 * Drives the KEYBOARD path, not the pointer path — no pointer harness needed,
 * and it exercises the exact same `snapDrag` + commit function the pointer
 * drag in `useRoadmapDrag.ts` calls. Per `timeline-component.md`'s testing
 * contract: "every one of the six gestures produces the same snapDrag result
 * and the same single PATCH."
 */

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
    onAddItem: vi.fn(),
    onUpdateItem: vi.fn(() => Promise.resolve()),
    onDeleteItem: vi.fn(() => Promise.resolve()),
    onReplaceItemLinks: vi.fn(() => Promise.resolve()),
    onBootstrap: vi.fn(() => Promise.resolve()),
    onSetStartDate: vi.fn(() => Promise.resolve()),
  };
  render(
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
      onReplaceItemLinks={handlers.onReplaceItemLinks}
      onBootstrap={handlers.onBootstrap}
      onSetStartDate={handlers.onSetStartDate}
    />
  );
  return handlers;
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

  it('Ctrl+ArrowDown moves the item to the next lane, window unchanged', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowDown', ctrlKey: true });

    expect(handlers.onUpdateItem).toHaveBeenCalledWith(10, {
      laneId: 2,
      startPeriod: ORIGIN.startPeriod,
      periodCount: ORIGIN.periodCount,
    });
  });

  it('Ctrl+ArrowUp is a no-op when already the first lane', () => {
    const handlers = renderRoadmap();
    const bar = screen.getByTestId('roadmap-bar-10');
    fireEvent.keyDown(bar, { key: 'ArrowUp', ctrlKey: true });
    expect(handlers.onUpdateItem).not.toHaveBeenCalled();
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
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
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
        onReplaceItemLinks={vi.fn()}
        onBootstrap={vi.fn()}
        onSetStartDate={vi.fn()}
      />
    );

    expect(screen.queryByTestId('roadmap-stripe-10')).not.toBeInTheDocument();
  });
});
