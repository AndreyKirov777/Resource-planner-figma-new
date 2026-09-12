import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wbs } from './Wbs';
import type { Project, RateCard, ResourceList, WbsItem } from '../services/api';

/**
 * Glide draws into a canvas, so its cells are unreachable from Testing
 * Library. Rather than stub the grid away (which would let the component be
 * gutted with every test still green), this harness renders through the
 * component's REAL `getCellContent`, `onCellEdited`, `onGridSelectionChange`,
 * `getRowThemeOverride` and chevron callback — the whole adapter surface —
 * exposing each as ordinary DOM.
 */
vi.mock('@glideapps/glide-data-grid', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@glideapps/glide-data-grid');
  const React = await import('react');

  const cellText = (cell: any): string =>
    cell.kind === actual.GridCellKind.Custom ? cell.copyData : (cell.displayData ?? '');

  const fireKey = (props: any, partial: Record<string, unknown>) => {
    props.onKeyDown?.({
      key: 'Enter',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      cancel: () => undefined,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      ...partial,
    });
  };

  const Harness = React.forwardRef((props: any, _ref: React.Ref<unknown>) => {
    const {
      rows,
      columns,
      getCellContent,
      onCellEdited,
      onGridSelectionChange,
      getRowThemeOverride,
      gridSelection,
      onWbsDrop,
    } = props;
    const [draft, setDraft] = React.useState('');
    const [outsideClick, setOutsideClick] = React.useState('');
    const selectedRow = gridSelection?.current?.cell[1];
    const selectedCell =
      gridSelection?.current === undefined
        ? 'none'
        : `${gridSelection.current.cell[0]},${gridSelection.current.cell[1]}`;
    // Cells captured when an "overlay" opened, so a commit can be replayed
    // after the visible row set has shifted underneath it.
    const captured = React.useRef<{ col: number; row: number; cell: any } | null>(null);

    // Evaluate the real `isOutsideClick` guard against a target of the given
    // shape. `missing` proves the prop was never handed to DataEditor at all.
    const probeOutsideClick = (className: string) => {
      if (typeof props.isOutsideClick !== 'function') {
        setOutsideClick('missing');
        return;
      }
      const target = document.createElement('div');
      target.className = className;
      document.body.appendChild(target);
      setOutsideClick(String(props.isOutsideClick({ target } as unknown as MouseEvent)));
      target.remove();
    };

    return (
      <div data-testid="glide-grid">
        <input
          aria-label="harness edit value"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span data-testid="grid-columns">
          {columns.map((c: { title: string }) => c.title).join('|')}
        </span>
        <button
          onClick={() =>
            props.onItemHovered?.({
              kind: 'header',
              location: [columns.findIndex((c: { id?: string }) => String(c.id ?? '').startsWith('role:')), 0],
            })
          }
        >
          hover first role header
        </button>
        <button
          onClick={() =>
            props.onItemHovered?.({
              kind: 'header',
              location: [columns.findIndex((c: { id?: string }) => c.id === 'total'), 0],
            })
          }
        >
          hover total header
        </button>
        <button onClick={() => props.onItemHovered?.({ kind: 'out-of-bounds', location: [0, 0] })}>
          leave grid
        </button>
        <span data-testid="grid-selection">{selectedCell}</span>
        <span data-testid="is-outside-click">{outsideClick}</span>
        <button onClick={() => probeOutsideClick('click-outside-ignore')}>
          probe portaled menu click
        </button>
        <button onClick={() => probeOutsideClick('somewhere-else')}>probe plain click</button>
        <button onClick={() => fireKey(props, { key: 'Enter' })}>key Enter</button>
        <button onClick={() => fireKey(props, { key: 'Enter', metaKey: true })}>key Cmd+Enter</button>
        <button onClick={() => fireKey(props, { key: 'Tab' })}>key Tab</button>
        <button onClick={() => fireKey(props, { key: 'Tab', shiftKey: true })}>key Shift+Tab</button>
        <button onClick={() => fireKey(props, { key: 'Delete' })}>key Delete</button>
        <button onClick={() => fireKey(props, { key: 'Backspace' })}>key Backspace</button>
        <button
          onClick={() => {
            if (captured.current === null) return;
            const { col, row, cell } = captured.current;
            onCellEdited(
              [col, row],
              col === 1
                ? { ...cell, copyData: draft, data: { ...cell.data, name: draft } }
                : { ...cell, data: { ...cell.data, ownPhaseName: draft === '' ? null : draft } }
            );
          }}
        >
          commit captured edit
        </button>
        {Array.from({ length: rows }, (_unused, r) => {
          const cells = columns.map((_c: unknown, ci: number) => getCellContent([ci, r]));
          const taskData = cells[1].data;
          const phaseData = cells[2].data;
          return (
            <div
              key={r}
              data-testid={`row-${r}`}
              data-selected={String(r === selectedRow)}
              data-section={String(getRowThemeOverride?.(r) !== undefined)}
              data-depth={String(taskData.depth)}
              data-phase-inherited={String(phaseData.inherited)}
            >
              {cells.map((cell: any, ci: number) => (
                <React.Fragment key={ci}>
                  <span
                    data-testid={`cell-${ci}-${r}`}
                    data-readonly={String(cell.readonly)}
                    data-bg={cell.themeOverride?.bgCell ?? ''}
                    data-text={cell.themeOverride?.textDark ?? ''}
                  >
                    {cellText(cell)}
                  </span>
                  {columns[ci].id?.startsWith('role:') && (
                    <button
                      onClick={() =>
                        onCellEdited([ci, r], {
                          ...cell,
                          data: draft,
                          displayData: draft,
                        })
                      }
                    >
                      {`set ${columns[ci].id} row ${r}`}
                    </button>
                  )}
                </React.Fragment>
              ))}
              <button
                onClick={() =>
                  onGridSelectionChange({
                    current: {
                      cell: [0, r],
                      range: { x: 0, y: r, width: 1, height: 1 },
                      rangeStack: [],
                    },
                    columns: actual.CompactSelection.empty(),
                    rows: actual.CompactSelection.empty(),
                  })
                }
              >
                {`select row ${r}`}
              </button>
              <button onClick={() => taskData.onToggle(taskData.itemId)}>{`toggle row ${r}`}</button>
              <button onClick={() => taskData.onOpenMenu(taskData.itemId, 0, 0)}>{`open menu row ${r}`}</button>
              <button
                onClick={() => {
                  captured.current = { col: 1, row: r, cell: cells[1] };
                }}
              >{`capture name row ${r}`}</button>
              <button
                onClick={() => {
                  captured.current = { col: 2, row: r, cell: cells[2] };
                }}
              >{`capture phase row ${r}`}</button>
              <button
                onClick={() =>
                  onCellEdited([1, r], {
                    ...cells[1],
                    copyData: draft,
                    data: { ...taskData, name: draft },
                  })
                }
              >
                {`rename row ${r}`}
              </button>
              {/* One user action delivering the same edit twice: Glide's own
                  outside-click commit plus the input's native blur, in the same
                  turn of the event loop. */}
              <button
                onClick={() => {
                  const edited = {
                    ...cells[1],
                    copyData: draft,
                    data: { ...taskData, name: draft },
                  };
                  onCellEdited([1, r], edited);
                  onCellEdited([1, r], edited);
                }}
              >
                {`double-rename row ${r}`}
              </button>
              <button
                onClick={() =>
                  onCellEdited([2, r], {
                    ...cells[2],
                    data: { ...phaseData, ownPhaseName: draft === '' ? null : draft },
                  })
                }
              >
                {`set phase row ${r}`}
              </button>
            </div>
          );
        })}
        {rows > 0 &&
          rows <= 16 &&
          Array.from({ length: rows }, (_unused, source) => {
            const draggedId = getCellContent([1, source]).data.itemId as number;
            return Array.from({ length: rows }, (_inner, dest) => {
              const targetId = getCellContent([1, dest]).data.itemId as number;
              return (['before', 'after', 'child', 'first-child'] as const).map((zone) => (
                <button
                  key={`${draggedId}-${targetId}-${zone}`}
                  onClick={() => onWbsDrop?.(draggedId, targetId, zone)}
                >
                  {`drop ${draggedId} onto ${targetId} ${zone}`}
                </button>
              ));
            });
          })}
      </div>
    );
  });
  Harness.displayName = 'GlideHarness';

  return { ...actual, default: Harness };
});

function wbsItem(overrides: Partial<WbsItem>): WbsItem {
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

function rateCard(overrides: Partial<RateCard>): RateCard {
  return {
    id: 1,
    role: 'Role',
    namingInPM: 'Role',
    discipline: 'Engineering',
    ukraine: 0,
    easternEurope: 0,
    asiaGE: 0,
    asiaARMKZ: 0,
    latam: 0,
    mexico: 0,
    india: 0,
    newYork: 0,
    london: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function resourceList(overrides: Partial<ResourceList>): ResourceList {
  return {
    id: 1,
    role: 'Role',
    intRate: 0,
    hourlyRate: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const mockProject: Project = {
  id: 1,
  name: 'Test Project',
  description: '',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  status: 'active',
  phases: JSON.stringify([
    { name: 'Phase 1', periodCount: 4, color: '#E3F2FD' },
    { name: 'Phase 2', periodCount: 4, color: '#E8F5E9' },
  ]),
  createdAt: '',
  updatedAt: '',
};

function defaultProps(wbsItems: WbsItem[]) {
  return {
    project: mockProject,
    resourcePlans: [],
    resourceLists: [
      resourceList({ id: 1, role: 'BA', clientRole: 'BA' }),
      resourceList({ id: 2, role: 'UX', clientRole: 'UX' }),
    ],
    rateCards: [] as RateCard[],
    wbsItems,
    onAddWbsItem: vi.fn().mockResolvedValue(wbsItem({ id: 999 })),
    onUpdateWbsItem: vi.fn().mockResolvedValue(undefined),
    onDeleteWbsItem: vi.fn().mockResolvedValue(undefined),
    onReplaceWbsEstimates: vi.fn().mockResolvedValue(undefined),
  };
}

const threeLevelTree: WbsItem[] = [
  wbsItem({ id: 1, name: 'Discovery', parentId: null, phaseName: 'Phase 1' }),
  wbsItem({
    id: 2,
    name: 'Interviews',
    parentId: 1,
    phaseName: null,
    estimates: [
      { id: 1, discipline: 'Analysis', role: 'BA', hours: 16, wbsItemId: 2, createdAt: '', updatedAt: '' },
    ],
  }),
  wbsItem({
    id: 3,
    name: 'Notes',
    parentId: 2,
    phaseName: null,
    estimates: [
      { id: 2, discipline: 'Design', role: 'UX', hours: 8, wbsItemId: 3, createdAt: '', updatedAt: '' },
    ],
  }),
  wbsItem({ id: 4, name: 'Build', parentId: null, phaseName: 'Phase 2', displayOrder: 1 }),
];

describe('Wbs — rendering', () => {
  it('renders an empty state with an Add root item button when there are no items', () => {
    render(<Wbs {...defaultProps([])} />);
    expect(screen.getByText(/no wbs items yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add root item/i })).toBeInTheDocument();
  });

  it('renders TOTAL and one numeric column per Resource List role', () => {
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    // WBS column: outline numbers derived from tree position.
    expect(screen.getByTestId('cell-0-0')).toHaveTextContent('1');
    expect(screen.getByTestId('cell-0-1')).toHaveTextContent('1.1');
    expect(screen.getByTestId('cell-0-2')).toHaveTextContent('1.1.1');
    expect(screen.getByTestId('cell-0-3')).toHaveTextContent('2');

    // Task Description, with depth driving the indent.
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Interviews');
    expect(screen.getByTestId('row-0')).toHaveAttribute('data-depth', '0');
    expect(screen.getByTestId('row-1')).toHaveAttribute('data-depth', '1');
    expect(screen.getByTestId('row-2')).toHaveAttribute('data-depth', '2');

    // TOTAL ignores estimates owned by parents and sums visible role columns.
    expect(screen.getByTestId('cell-3-0')).toHaveTextContent('8');
    expect(screen.getByTestId('cell-3-1')).toHaveTextContent('8');
    expect(screen.getByTestId('cell-3-2')).toHaveTextContent('8');
    expect(screen.getByTestId('cell-3-0')).toHaveAttribute('data-bg', '#dfe3ea');
    expect(screen.getByTestId('cell-3-1')).toHaveAttribute('data-bg', '#eceef2');

    // BA is parent-owned on row 1, so it is ignored; UX belongs to the leaf.
    expect(screen.getByTestId('cell-4-1')).toHaveTextContent('0');
    expect(screen.getByTestId('cell-5-0')).toHaveTextContent('8');
    expect(screen.getByTestId('cell-5-2')).toHaveTextContent('8');
    expect(screen.getByTestId('cell-4-1')).toHaveAttribute('data-text', '#737373');
  });

  it('renders fixed columns plus first-seen Resource List client roles', () => {
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    // Asserted on the real column titles, not on how many spans the harness
    // happened to render: counting alone passes for any five columns at all.
    expect(screen.getByTestId('grid-columns')).toHaveTextContent(
      'WBS|Task Description|Phase|TOTAL|BA|UX'
    );
    expect(screen.queryByTestId('cell-6-0')).not.toBeInTheDocument();
  });

  it('abbreviates a long Resource List client role in the header and tooltips the full name', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 1, name: 'Root' })];
    render(
      <Wbs
        {...defaultProps(items)}
        resourceLists={[
          resourceList({
            id: 1,
            role: 'Principal Software Developer, Core Technologies',
            clientRole: 'Senior Developer',
          }),
          resourceList({ id: 2, role: 'BA', clientRole: 'Middle Business Analyst' }),
        ]}
      />
    );

    expect(screen.getByTestId('grid-columns').textContent).toBe(
      'WBS|Task Description|Phase|TOTAL|Sr\nDev|Md\nBA'
    );
    expect(screen.queryByTestId('wbs-role-header-tip')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'hover first role header' }));
    expect(screen.getByTestId('wbs-role-header-tip')).toHaveTextContent('Senior Developer');

    await user.click(screen.getByRole('button', { name: 'hover total header' }));
    expect(screen.queryByTestId('wbs-role-header-tip')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'hover first role header' }));
    expect(screen.getByTestId('wbs-role-header-tip')).toHaveTextContent('Senior Developer');

    await user.click(screen.getByRole('button', { name: 'leave grid' }));
    expect(screen.queryByTestId('wbs-role-header-tip')).not.toBeInTheDocument();
  });

  it('inherits a phase down the tree and marks the inherited ones', () => {
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    expect(screen.getByTestId('cell-2-0')).toHaveTextContent('Phase 1');
    expect(screen.getByTestId('row-0')).toHaveAttribute('data-phase-inherited', 'false');
    expect(screen.getByTestId('cell-2-1')).toHaveTextContent('Phase 1');
    expect(screen.getByTestId('row-1')).toHaveAttribute('data-phase-inherited', 'true');
    // A sibling with its own phase overrides its own subtree.
    expect(screen.getByTestId('cell-2-3')).toHaveTextContent('Phase 2');
    expect(screen.getByTestId('row-3')).toHaveAttribute('data-phase-inherited', 'false');
  });

  it('renders a stale phase name as Unassigned rather than verbatim', () => {
    const items = [wbsItem({ id: 1, name: 'Root', phaseName: 'Deleted phase' })];
    render(<Wbs {...defaultProps(items)} />);

    expect(screen.getByTestId('cell-2-0')).toHaveTextContent('Unassigned');
  });

  it('applies the section row theme to depth-0 rows only', () => {
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    expect(screen.getByTestId('row-0')).toHaveAttribute('data-section', 'true');
    expect(screen.getByTestId('row-1')).toHaveAttribute('data-section', 'false');
    expect(screen.getByTestId('row-3')).toHaveAttribute('data-section', 'true');
  });

  it('clamps the container height instead of growing without bound', () => {
    const many = Array.from({ length: 500 }, (_unused, i) =>
      wbsItem({ id: i + 1, name: `Item ${i}`, parentId: null, displayOrder: i })
    );
    render(<Wbs {...defaultProps(many)} />);

    // Targeted by test id: `[style*="height"]` grabs the first element with any
    // inline height at all, so it would pass just as happily on `height: 0`.
    const height = gridHeight();
    expect(height).toBeLessThanOrEqual(640);
    expect(height).toBeGreaterThan(0);
  });
});

/** The grid container's computed pixel height. */
function gridHeight(): number {
  return parseInt(screen.getByTestId('wbs-grid-container').style.height, 10);
}

describe('Wbs — collapse', () => {
  it('hides descendants when a row is collapsed, leaving numbers and siblings alone', async () => {
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));

    // Descendants gone; the sibling root stays and keeps its outline number.
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('cell-0-1')).toHaveTextContent('2');
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Build');
  });

  it('shrinks the container height to match the visible row count', async () => {
    const user = userEvent.setup();
    const wide: WbsItem[] = [
      wbsItem({ id: 1, name: 'Root', parentId: null }),
      ...Array.from({ length: 10 }, (_unused, i) =>
        wbsItem({ id: i + 2, name: `Child ${i}`, parentId: 1, displayOrder: i })
      ),
    ];
    render(<Wbs {...defaultProps(wide)} />);
    const before = gridHeight();

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));

    expect(gridHeight()).toBeLessThan(before);
  });

  it('re-expands on a second toggle', async () => {
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.queryByTestId('row-3')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.getByTestId('cell-1-3')).toHaveTextContent('Build');
  });
});

describe('Wbs — structure editing from the table', () => {
  it('keeps Add root item only on an empty WBS and hides the old toolbar once rows exist', () => {
    const { rerender } = render(<Wbs {...defaultProps([])} />);
    expect(screen.getByRole('button', { name: /add root item/i })).toBeInTheDocument();
    expect(screen.queryByTestId('wbs-structure-hint')).not.toBeInTheDocument();

    rerender(<Wbs {...defaultProps(threeLevelTree)} />);
    expect(screen.queryByRole('button', { name: /add root item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ child/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('wbs-structure-hint')).toHaveTextContent(/drag to move/);
  });

  it('adds a child from the row menu and expands a collapsed parent', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'open menu row 0' }));
    await user.click(screen.getByRole('menuitem', { name: /add child/i }));

    expect(props.onAddWbsItem).toHaveBeenCalledWith(expect.objectContaining({ parentId: 1 }));
    expect(screen.getByTestId('cell-1-2')).toHaveTextContent('Notes');
  });

  it('adds a sibling immediately below from the menu or Enter', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'open menu row 0' }));
    await user.click(screen.getByRole('menuitem', { name: /add sibling below/i }));
    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(4, { displayOrder: 2 });
    expect(props.onAddWbsItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New item', parentId: null, displayOrder: 1 })
    );

    await user.click(screen.getByRole('button', { name: 'select row 3' }));
    await user.click(screen.getByRole('button', { name: 'key Enter' }));
    expect(props.onAddWbsItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentId: null, displayOrder: 2 })
    );
  });

  it('adds a child with Cmd+Enter', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 1' }));
    await user.click(screen.getByRole('button', { name: 'key Cmd+Enter' }));
    expect(props.onAddWbsItem).toHaveBeenCalledWith(expect.objectContaining({ parentId: 2 }));
  });

  it('selects the created item so the next shortcut targets it', async () => {
    const user = userEvent.setup();
    const created = wbsItem({ id: 999, name: 'New item', parentId: 1, displayOrder: 1 });
    const props = defaultProps(threeLevelTree);
    props.onAddWbsItem.mockResolvedValue(created);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 0' }));
    await user.click(screen.getByRole('button', { name: 'key Cmd+Enter' }));

    rerender(<Wbs {...props} wbsItems={[...threeLevelTree, created]} />);

    const newRow = screen.getByText('New item').closest('[data-testid^="row-"]');
    expect(newRow).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('grid-selection').textContent).toMatch(/^1,/);

    await user.click(screen.getByRole('button', { name: 'key Enter' }));
    expect(props.onAddWbsItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentId: 1, displayOrder: 2 })
    );
  });

  it('selects the first root item after adding it to an empty WBS', async () => {
    const user = userEvent.setup();
    const created = wbsItem({ id: 999, name: 'New item', parentId: null, displayOrder: 0 });
    const props = defaultProps([]);
    props.onAddWbsItem.mockResolvedValue(created);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: /add root item/i }));
    rerender(<Wbs {...props} wbsItems={[created]} />);

    expect(screen.getByTestId('row-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('grid-selection')).toHaveTextContent('1,0');
  });

  it('indents and outdents from Tab / Shift+Tab', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 3' }));
    await user.click(screen.getByRole('button', { name: 'key Tab' }));
    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(4, expect.objectContaining({ parentId: 1 }));

    await user.click(screen.getByRole('button', { name: 'select row 2' }));
    await user.click(screen.getByRole('button', { name: 'key Shift+Tab' }));
    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ parentId: 1, displayOrder: 1 })
    );
  });

  it('confirms a delete naming the descendant count, then deletes', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'open menu row 0' }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 descendant items'));
    expect(props.onDeleteWbsItem).toHaveBeenCalledWith(1);

    vi.unstubAllGlobals();
  });

  it('selects the item above after delete', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 2' }));
    expect(screen.getByTestId('cell-1-2')).toHaveTextContent('Notes');
    await user.click(screen.getByRole('button', { name: 'key Delete' }));

    rerender(<Wbs {...props} wbsItems={threeLevelTree.filter((item) => item.id !== 3)} />);

    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Interviews');
    expect(screen.getByTestId('row-1')).toHaveAttribute('data-selected', 'true');

    vi.unstubAllGlobals();
  });

  it('selects the next surviving row when the first item is deleted', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 0' }));
    await user.click(screen.getByRole('button', { name: 'key Delete' }));

    rerender(<Wbs {...props} wbsItems={threeLevelTree.filter((item) => item.id === 4)} />);

    expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Build');
    expect(screen.getByTestId('row-0')).toHaveAttribute('data-selected', 'true');

    vi.unstubAllGlobals();
  });

  it('makes no call when the delete confirm is cancelled', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 0' }));
    await user.click(screen.getByRole('button', { name: 'key Delete' }));

    expect(props.onDeleteWbsItem).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('does not fire structure keys while a cell overlay is open', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    const portal = document.createElement('div');
    portal.id = 'portal';
    const clip = document.createElement('div');
    clip.className = 'gdg-clip-region';
    portal.appendChild(clip);
    document.body.appendChild(portal);

    await user.click(screen.getByRole('button', { name: 'select row 0' }));
    await user.click(screen.getByRole('button', { name: 'key Enter' }));
    await user.click(screen.getByRole('button', { name: 'key Delete' }));

    expect(props.onAddWbsItem).not.toHaveBeenCalled();
    expect(props.onDeleteWbsItem).not.toHaveBeenCalled();

    portal.remove();
  });

  it('invalidates the selection when the visible row set changes', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'select row 1' }));
    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Build');
    await user.click(screen.getByRole('button', { name: 'key Delete' }));
    expect(props.onDeleteWbsItem).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('Wbs — drag-and-drop from the outline column', () => {
  it('moves a sibling after another leaf via the same handler the grid uses', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'drop 1 onto 4 after' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(1, { parentId: null, displayOrder: 2 });
  });

  it('moves a sibling before another and bumps the target', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'drop 4 onto 1 before' }));

    expect(props.onUpdateWbsItem).toHaveBeenNthCalledWith(1, 1, { displayOrder: 1 });
    expect(props.onUpdateWbsItem).toHaveBeenNthCalledWith(2, 4, { parentId: null, displayOrder: 0 });
  });

  it('nests as the last child and expands a collapsed parent', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'drop 4 onto 1 child' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(4, { parentId: 1, displayOrder: 1 });
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Interviews');
    expect(screen.getByTestId('cell-1-2')).toHaveTextContent('Notes');
  });

  it('inserts as the first child of an expanded parent', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'drop 4 onto 1 first-child' }));

    expect(props.onUpdateWbsItem).toHaveBeenNthCalledWith(1, 2, { displayOrder: 1 });
    expect(props.onUpdateWbsItem).toHaveBeenNthCalledWith(2, 4, { parentId: 1, displayOrder: 0 });
  });

  it('reparents across branches without rewriting the dragged subtree', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'drop 1 onto 4 after' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(1, { parentId: null, displayOrder: 2 });
    expect(props.onUpdateWbsItem).not.toHaveBeenCalledWith(2, expect.anything());
    expect(props.onUpdateWbsItem).not.toHaveBeenCalledWith(3, expect.anything());
  });

  it('does not mutate when dropping on a descendant or on self', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'drop 1 onto 2 child' }));
    await user.click(screen.getByRole('button', { name: 'drop 1 onto 1 after' }));

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();
  });

  it('does not mutate when a name overlay is open', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    const portal = document.createElement('div');
    portal.id = 'portal';
    const clip = document.createElement('div');
    clip.className = 'gdg-clip-region';
    portal.appendChild(clip);
    document.body.appendChild(portal);

    await user.click(screen.getByRole('button', { name: 'drop 4 onto 1 child' }));

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();

    portal.remove();
  });
});

describe('Wbs — cell edits', () => {
  it('commits a valid leaf role edit through the estimate committer', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), '32');
    await user.click(screen.getByRole('button', { name: 'set role:BA row 2' }));

    await waitFor(() =>
      expect(props.onReplaceWbsEstimates).toHaveBeenCalledWith(3, [
        { discipline: 'Design', role: 'UX', hours: 8 },
        { discipline: 'BA', role: 'BA', hours: 32 },
      ])
    );
  });

  it('does not edit parent role cells or send invalid leaf values', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    expect(screen.getByTestId('cell-4-1')).toHaveAttribute('data-readonly', 'true');
    await user.type(screen.getByLabelText('harness edit value'), '-1');
    await user.click(screen.getByRole('button', { name: 'set role:BA row 1' }));
    await user.click(screen.getByRole('button', { name: 'set role:BA row 2' }));

    expect(props.onReplaceWbsEstimates).not.toHaveBeenCalled();
  });

  it('renames an item through the real onCellEdited path', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'rename row 1' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(2, { name: 'Renamed' });
  });

  it('reverts a blank name without calling the API', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'rename row 1' }));

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();
  });

  it('sets a phase through the real onCellEdited path', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Phase 2');
    await user.click(screen.getByRole('button', { name: 'set phase row 1' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(2, { phaseName: 'Phase 2' });
  });

  it('clears a phase to Unassigned', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    // Empty harness draft means "Unassigned" on row 0, which sets Phase 1.
    await user.click(screen.getByRole('button', { name: 'set phase row 0' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(1, { phaseName: null });
  });

  it('makes no call when the phase did not change', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Phase 1');
    await user.click(screen.getByRole('button', { name: 'set phase row 0' }));

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();
  });

  // A stale stored phase renders as Unassigned and reports `ownPhaseName: null`,
  // so comparing the pick against it made "Unassigned" a no-op on exactly the
  // rows that needed clearing — the dead name would live in the DB forever.
  it('actually clears a stale phase name when Unassigned is picked', async () => {
    const user = userEvent.setup();
    const props = defaultProps([wbsItem({ id: 1, name: 'Root', phaseName: 'Deleted phase' })]);
    render(<Wbs {...props} />);

    expect(screen.getByTestId('cell-2-0')).toHaveTextContent('Unassigned');
    // Empty harness draft means Unassigned.
    await user.click(screen.getByRole('button', { name: 'set phase row 0' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(1, { phaseName: null });
  });

  // Glide's own outside-click commit and the editor input's native blur can
  // both deliver the same edit for one user action.
  it('issues one write when the same edit arrives twice', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'double-rename row 1' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledTimes(1);
    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(2, { name: 'Renamed' });
  });

  it('does not swallow a genuine repeat once the first write has landed', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    render(<Wbs {...props} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'rename row 1' }));
    await user.click(screen.getByRole('button', { name: 'rename row 1' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledTimes(2);
  });
});

describe('Wbs — an edit lands on the item its overlay opened on', () => {
  // `rows[row]` is only valid while the row set holds still. A `+ Child` or
  // delete round-trip resolving while an overlay is open re-points that index
  // at a different item, and the edit lands on the wrong row.
  const shifted: WbsItem[] = [
    wbsItem({ id: 9, name: 'Inserted', parentId: null, displayOrder: -1 }),
    ...threeLevelTree,
  ];

  it('renames the captured item, not whatever now sits at that row index', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    // The overlay opens on row 1 — "Interviews", id 2.
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Interviews');
    await user.click(screen.getByRole('button', { name: 'capture name row 1' }));

    // A new root item lands while the overlay is open: row 1 is now "Discovery".
    rerender(<Wbs {...props} wbsItems={shifted} />);
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Discovery');

    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'commit captured edit' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(2, { name: 'Renamed' });
    expect(props.onUpdateWbsItem).not.toHaveBeenCalledWith(1, expect.anything());
  });

  it('sets the phase on the captured item, not on whatever now sits at that row index', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'capture phase row 1' }));
    rerender(<Wbs {...props} wbsItems={shifted} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Phase 2');
    await user.click(screen.getByRole('button', { name: 'commit captured edit' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(2, { phaseName: 'Phase 2' });
    expect(props.onUpdateWbsItem).not.toHaveBeenCalledWith(1, expect.anything());
  });

  it('writes nothing at all when the captured item has been deleted', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'capture name row 1' }));
    // "Interviews" (id 2) and its subtree are gone; row 1 is "Build" now.
    rerender(<Wbs {...props} wbsItems={threeLevelTree.filter((i) => ![2, 3].includes(i.id))} />);

    await user.type(screen.getByLabelText('harness edit value'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'commit captured edit' }));

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();
  });
});

describe('Wbs — overlay dismissal guard', () => {
  // A probe deleting `isOutsideClick={isOutsideClick}` from DataEditor passed
  // the suite: without it, Glide's capture-phase mousedown tears the overlay
  // down before a portaled menu can turn a click into `onValueChange`.
  it('hands DataEditor an isOutsideClick guard that spares a portaled menu', async () => {
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    await user.click(screen.getByRole('button', { name: 'probe portaled menu click' }));

    expect(screen.getByTestId('is-outside-click')).toHaveTextContent('false');
  });

  it('still treats a click anywhere else as a genuine outside click', async () => {
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    await user.click(screen.getByRole('button', { name: 'probe plain click' }));

    expect(screen.getByTestId('is-outside-click')).toHaveTextContent('true');
  });
});

describe('Wbs — collapsed ids are pruned with their items', () => {
  it('does not start a recycled id collapsed', async () => {
    const user = userEvent.setup();
    const props = defaultProps(threeLevelTree);
    const { rerender } = render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: 'toggle row 0' }));
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();

    // Id 1's subtree is deleted, then the database hands id 1 to a new item.
    rerender(<Wbs {...props} wbsItems={[wbsItem({ id: 4, name: 'Build', displayOrder: 1 })]} />);
    rerender(
      <Wbs
        {...props}
        wbsItems={[
          wbsItem({ id: 1, name: 'Recycled', parentId: null }),
          wbsItem({ id: 5, name: 'Its child', parentId: 1 }),
          wbsItem({ id: 4, name: 'Build', displayOrder: 1 }),
        ]}
      />
    );

    // The new row's child is visible: the stale collapsed id did not carry over.
    expect(screen.getByTestId('cell-1-0')).toHaveTextContent('Recycled');
    expect(screen.getByTestId('cell-1-1')).toHaveTextContent('Its child');
  });
});

describe('Wbs — reconciliation strip', () => {
  it('starts collapsed with a WBS/plan/variance summary on the trigger', () => {
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    expect(screen.getByRole('button', { name: /WBS 24 h .* Plan 0 h .* \+24/ })).toBeInTheDocument();
    expect(screen.queryByText('By discipline')).not.toBeInTheDocument();
  });

  it('expands to the full panel on click', async () => {
    const user = userEvent.setup();
    render(<Wbs {...defaultProps(threeLevelTree)} />);

    await user.click(screen.getByRole('button', { name: /WBS 24 h/ }));

    await waitFor(() => expect(screen.getByText('By discipline')).toBeInTheDocument());
  });

  it('attributes an inheriting child hours to its ancestor phase, not to Unassigned', async () => {
    const user = userEvent.setup();
    // Only "Interviews" (id 2, inherits Phase 1, discipline "Analysis", 16h) and
    // "Notes" (id 3, inherits Phase 1 too via Interviews, discipline "Design", 8h)
    // carry hours.
    render(<Wbs {...defaultProps(threeLevelTree)} rateCards={[rateCard({ role: 'BA' })]} />);

    // Collapsed: the Unassigned chip stays clear (nothing fell into Unassigned)...
    expect(screen.getByTitle('Unassigned: none')).toBeInTheDocument();

    // ...but that alone would also pass if the hours were simply dropped rather
    // than correctly attributed. Expand and confirm they actually landed under
    // the ancestor phase ("Phase 1"), not just that they went missing from
    // Unassigned.
    await user.click(screen.getByRole('button', { name: /WBS 24 h/ }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Phase 1' })).toBeInTheDocument());
    expect(screen.getAllByRole('cell', { name: 'Analysis' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('cell', { name: 'Design' }).length).toBeGreaterThan(0);
    // Full 24h (16 + 8) shows up as phase-attributed variance (plan is 0 here).
    expect(screen.getAllByText('+16').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+8').length).toBeGreaterThan(0);
  });
});
