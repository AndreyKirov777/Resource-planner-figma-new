import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoadmapEditorPanel } from './RoadmapEditorPanel';
import { RoadmapItem, RoadmapLaneWithItems, ResourcePlan, WbsItem } from '../../services/api';
import { RoadmapLinkRecord } from '../../utils/roadmap';
import { buildRoadmapLoad, RoadmapLoadItemInput } from '../../utils/roadmapLoad';

const lanes: RoadmapLaneWithItems[] = [
  { id: 1, name: 'Backend', displayOrder: 0, projectId: 1, createdAt: '', updatedAt: '', items: [] },
];

function makeItem(overrides: Partial<RoadmapItem> & { id: number }): RoadmapItem {
  return {
    name: 'API',
    kind: 'bar',
    startPeriod: 1,
    periodCount: 4,
    displayOrder: 0,
    color: '#8f4f8f',
    laneId: 1,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    wbsItemIds: [],
    ...overrides,
  };
}

function renderPanel({
  item,
  wbsItems,
  loadItems,
  links,
  resourcePlans = [],
}: {
  item: RoadmapItem;
  wbsItems: WbsItem[];
  loadItems: RoadmapLoadItemInput[];
  links: RoadmapLinkRecord[];
  resourcePlans?: ResourcePlan[];
}) {
  const onUpdate = vi.fn(() => Promise.resolve());
  const roadmapLoad = buildRoadmapLoad({
    wbsItems,
    roadmapItems: loadItems,
    links,
    resourcePlans,
    rateCards: [],
    phases: [{ name: 'Phase 1', periodCount: 8, color: '#fff' }],
    planningMode: 'weekly',
    daysInFTE: 20,
  });

  render(
    <RoadmapEditorPanel
      item={item}
      lanes={lanes}
      wbsItems={wbsItems}
      allLinks={links}
      itemNames={new Map(loadItems.map((i) => [i.id, i.name]))}
      np={8}
      planningMode="weekly"
      roadmapLoad={roadmapLoad}
      roadmapItems={loadItems}
      hrsPerPeriod={40}
      onUpdate={onUpdate}
      onReplaceLinks={vi.fn(() => Promise.resolve())}
      onClose={vi.fn()}
    />
  );

  return { onUpdate };
}

describe('RoadmapEditorPanel — read-only demand block (CAP-11)', () => {
  it('is absent for a milestone (no scope) and for an item with no linked scope', () => {
    const item = makeItem({ id: 10, kind: 'milestone', periodCount: 0, wbsItemIds: [] });
    renderPanel({ item, wbsItems: [], loadItems: [{ id: 10, name: 'Launch', kind: 'milestone', startPeriod: 1, periodCount: 0 }], links: [] });
    expect(screen.queryByTestId('roadmap-editor-demand')).not.toBeInTheDocument();
  });

  it('shows total effort/FTE and a per-role demand-vs-plan line', () => {
    const wbsItems: WbsItem[] = [
      {
        id: 1,
        name: 'Leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [{ id: 1, discipline: 'Engineering', role: 'Backend Developer', hours: 160, wbsItemId: 1, createdAt: '', updatedAt: '' }],
      },
    ];
    const item = makeItem({ id: 10, startPeriod: 1, periodCount: 4, wbsItemIds: [1] });
    const loadItems: RoadmapLoadItemInput[] = [{ id: 10, name: 'API', kind: 'bar', startPeriod: 1, periodCount: 4 }];
    renderPanel({
      item,
      wbsItems,
      loadItems,
      links: [{ wbsItemId: 1, roadmapItemId: 10 }],
      resourcePlans: [
        {
          id: 1,
          role: 'Backend Developer',
          intHourlyRate: 0,
          clientHourlyRate: 0,
          displayOrder: 0,
          projectId: 1,
          createdAt: '',
          updatedAt: '',
          allocations: [1, 2, 3, 4].map((p) => ({ id: p, periodNumber: p, allocation: 50, resourcePlanId: 1, createdAt: '', updatedAt: '' })),
        },
      ],
    });

    const block = screen.getByTestId('roadmap-editor-demand');
    // 160h / (4 periods * 40h) = 1.0 FTE total; demand FTE == plan FTE (50% = 0.5 FTE), no shortfall styling asserted here.
    expect(block).toHaveTextContent('160 h total');
    expect(block).toHaveTextContent('1.0 FTE');
    expect(block).toHaveTextContent('Backend Developer');
  });

  it('states feasible duration naming the limiting role, using the residual-supply figure', () => {
    const wbsItems: WbsItem[] = [
      {
        id: 1,
        name: 'Leaf',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [{ id: 1, discipline: 'Engineering', role: 'Backend Developer', hours: 700, wbsItemId: 1, createdAt: '', updatedAt: '' }],
      },
    ];
    const item = makeItem({ id: 10, startPeriod: 1, periodCount: 4, wbsItemIds: [1] });
    const loadItems: RoadmapLoadItemInput[] = [{ id: 10, name: 'API', kind: 'bar', startPeriod: 1, periodCount: 4 }];
    renderPanel({
      item,
      wbsItems,
      loadItems,
      links: [{ wbsItemId: 1, roadmapItemId: 10 }],
      resourcePlans: [
        {
          id: 1,
          role: 'Backend Developer',
          intHourlyRate: 0,
          clientHourlyRate: 0,
          displayOrder: 0,
          projectId: 1,
          createdAt: '',
          updatedAt: '',
          allocations: [1, 2, 3, 4].map((p) => ({ id: p, periodNumber: p, allocation: 250, resourcePlanId: 1, createdAt: '', updatedAt: '' })),
        },
      ],
    });

    // ceil(700 / 100h) = 7 weeks, Backend Developer is the only (and thus limiting) role.
    expect(screen.getByTestId('roadmap-editor-feasible')).toHaveTextContent('cannot take fewer than 7 weeks');
    expect(screen.getByTestId('roadmap-editor-feasible')).toHaveTextContent('Backend Developer is the limit');
  });

  it('states a concrete conflict naming the overloaded period, role and contributing items', () => {
    const wbsItems: WbsItem[] = [
      {
        id: 1,
        name: 'Leaf A',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [{ id: 1, discipline: 'Engineering', role: 'Backend Developer', hours: 400, wbsItemId: 1, createdAt: '', updatedAt: '' }],
      },
      {
        id: 2,
        name: 'Leaf B',
        parentId: null,
        phaseName: null,
        displayOrder: 0,
        projectId: 1,
        createdAt: '',
        updatedAt: '',
        estimates: [{ id: 2, discipline: 'Engineering', role: 'Backend Developer', hours: 400, wbsItemId: 2, createdAt: '', updatedAt: '' }],
      },
    ];
    const item = makeItem({ id: 10, name: 'Platform', startPeriod: 1, periodCount: 4, wbsItemIds: [1] });
    const otherItem = makeItem({ id: 11, name: 'Mobile', startPeriod: 1, periodCount: 4, wbsItemIds: [2] });
    const loadItems: RoadmapLoadItemInput[] = [
      { id: 10, name: 'Platform', kind: 'bar', startPeriod: 1, periodCount: 4 },
      { id: 11, name: 'Mobile', kind: 'bar', startPeriod: 1, periodCount: 4 },
    ];
    void otherItem;
    renderPanel({
      item,
      wbsItems,
      loadItems,
      links: [
        { wbsItemId: 1, roadmapItemId: 10 },
        { wbsItemId: 2, roadmapItemId: 11 },
      ],
      resourcePlans: [], // no supply at all -> both items conflict fully
    });

    const conflict = screen.getByTestId('roadmap-editor-conflict');
    expect(conflict).toHaveTextContent('W1 is overloaded');
    expect(conflict).toHaveTextContent('Backend Developer needed');
    expect(conflict).toHaveTextContent('across Platform and Mobile');
    expect(conflict).toHaveTextContent('0.0 planned');
  });
});

describe('RoadmapEditorPanel — color swatches', () => {
  it('shows a labeled swatch grid and PATCHes color on click', async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: 10 });
    const { onUpdate } = renderPanel({
      item,
      wbsItems: [],
      loadItems: [{ id: 10, name: 'API', kind: 'bar', startPeriod: 1, periodCount: 4 }],
      links: [],
    });

    expect(screen.getByTestId('roadmap-item-color-swatches')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Color #5D6E85' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Color #E6514C' })).toHaveAttribute('aria-selected', 'false');

    await user.click(screen.getByRole('option', { name: 'Color #417B9E' }));
    expect(onUpdate).toHaveBeenCalledWith(10, { color: '#417B9E' });
  });
});
