import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataEditor, {
  CompactSelection,
  CustomCell,
  CustomRenderer,
  EditableGridCell,
  GridCell,
  GridCellKind,
  GridColumn,
  GridSelection,
  Item,
  Theme,
  getMiddleCenterBias,
  measureTextCached,
  roundedRect,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { ChevronDown } from 'lucide-react';
import {
  Project,
  ResourcePlan as ResourcePlanType,
  RateCard as RateCardType,
  ResourceList as ResourceListType,
  WbsItem,
  WbsEstimate,
} from '../services/api';
import { parsePhases } from '../utils/phases';
import { hoursPerPeriod } from '../utils/calculations';
import { buildReconciliationReport } from '../utils/wbs';
import { withEffectivePhases } from '../utils/wbsTree';
import {
  CELL_PAD,
  CHEVRON_SIZE,
  CHIP_HEIGHT,
  CHIP_PAD,
  EstimateCommitter,
  RolePair,
  buildGridRows,
  createEstimateCommitter,
  deleteConfirmMessage,
  formatHours,
  hitsChevron,
  indentFor,
  layoutChips,
  nameEditFor,
  nextDisplayOrder,
  pairsSummary,
  phaseEditFor,
  phaseLabel,
  pruneCollapsedIds,
} from '../utils/wbsGrid';
import { GRID_THEME } from './gridTheme';
import { ReconciliationPanel, reconciliationSummary } from './ReconciliationPanel';
import { NameEditor, PhaseEditor, RolesEditor, isInsidePortaledMenu } from './RolesEditor';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

type WbsCreatePayload = Omit<Partial<WbsItem>, 'estimates'> & { estimates?: Partial<WbsEstimate>[] };

interface WbsProps {
  project: Project;
  resourcePlans: ResourcePlanType[];
  resourceLists: ResourceListType[];
  rateCards: RateCardType[];
  wbsItems: WbsItem[];
  onAddWbsItem: (data: WbsCreatePayload) => Promise<WbsItem>;
  onUpdateWbsItem: (id: number, data: Partial<WbsItem>) => Promise<void>;
  onDeleteWbsItem: (id: number) => Promise<void>;
  onReplaceWbsEstimates: (wbsItemId: number, estimates: Partial<WbsEstimate>[]) => Promise<void>;
}

const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 34;
const GRID_PADDING = 20;
const MIN_GRID_HEIGHT = 200;
/**
 * Hard ceiling on the container. The height is f(row count); left unbounded it
 * eventually exceeds the browser's maximum canvas dimension and the grid
 * renders blank. Past this the grid scrolls internally instead.
 */
const MAX_GRID_HEIGHT = 640;

// Indent, chevron-hit and chip geometry live in `wbsGrid.ts`: they are pure
// arithmetic, and inside a canvas renderer they are unobservable from a test.

// ---------------------------------------------------------------------------
// Custom cells
//
// NOTE: deliberately not modelled on `ResourcePlan.tsx`'s `RoleCellRenderer`,
// which is dead code that has never executed. Its draws mutate ctx state
// without save/restore (bleeding font/alignment into neighbouring cells) and
// its editor puts a portaled Radix menu inside the overlay with none of the
// guards that makes it actually work. See the spec's "Overlay editor
// semantics".
// ---------------------------------------------------------------------------

interface TaskCellData {
  readonly kind: 'wbs-task';
  readonly itemId: number;
  readonly name: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly collapsed: boolean;
  readonly isSection: boolean;
  readonly onToggle: (itemId: number) => void;
}

interface PhaseCellData {
  readonly kind: 'wbs-phase';
  readonly itemId: number;
  /** The row's own phase — what the picker shows, so it is always an option. */
  readonly ownPhaseName: string | null;
  /** The phase in force, own or inherited. */
  readonly label: string;
  readonly inherited: boolean;
  readonly phaseOptions: string[];
}

interface RolesCellData {
  readonly kind: 'wbs-roles';
  readonly itemId: number;
  readonly pairs: RolePair[];
  readonly resourceLists: ResourceListType[];
  readonly rateCards: RateCardType[];
  readonly committer: EstimateCommitter;
}

type TaskCell = CustomCell<TaskCellData>;
type PhaseCell = CustomCell<PhaseCellData>;
type RolesCell = CustomCell<RolesCellData>;

/**
 * Clip every draw to its own cell so wide text and chips can never paint over a
 * neighbour.
 *
 * NOT UNIT-TESTABLE: jsdom has no canvas, so `ctx.clip()` is a no-op under the
 * test harness and a mutation probe that deletes it passes the whole suite.
 * Verified manually — see the manual checks in the spec's Verification section
 * ("a role chip wider than the Roles column is cut at the column edge, not
 * painted over Hours").
 */
function clipToCell(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  draw: () => void
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

const TaskCellRenderer: CustomRenderer<TaskCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TaskCell =>
    (cell.data as { kind?: string })?.kind === 'wbs-task',
  needsHoverPosition: false,
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { x, y, width, height } = rect;
    const { name, depth, hasChildren, collapsed, isSection } = cell.data;

    clipToCell(ctx, rect, () => {
      const indent = indentFor(depth, width);
      const font = isSection ? `600 ${theme.baseFontStyle} ${theme.fontFamily}` : theme.baseFontFull;
      ctx.font = font;
      const bias = getMiddleCenterBias(ctx, font);
      const midY = y + height / 2 + bias;

      let textX = x + CELL_PAD + indent;
      if (hasChildren) {
        // Chevron: a filled triangle pointing right (collapsed) or down.
        const cx = textX + CHEVRON_SIZE / 2;
        const cy = y + height / 2;
        ctx.fillStyle = theme.textMedium;
        ctx.beginPath();
        if (collapsed) {
          ctx.moveTo(cx - 3, cy - 5);
          ctx.lineTo(cx + 4, cy);
          ctx.lineTo(cx - 3, cy + 5);
        } else {
          ctx.moveTo(cx - 5, cy - 3);
          ctx.lineTo(cx + 5, cy - 3);
          ctx.lineTo(cx, cy + 4);
        }
        ctx.closePath();
        ctx.fill();
      }
      textX += CHEVRON_SIZE + 4;

      ctx.fillStyle = theme.textDark;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(name, textX, midY);
    });
    return true;
  },
  // Renderer-level onClick: posX/posY are already cell-local, so the chevron
  // hit test needs no bounds math of its own — but it must use BOTH axes.
  // Testing posX alone gives the chevron the full row height, so clicking
  // anywhere down a parent row's left edge toggles instead of selecting, and
  // selection is what enables the toolbar.
  onClick: (args) => {
    const { cell, posX, posY, bounds, preventDefault } = args;
    if (!cell.data.hasChildren) return undefined;
    if (hitsChevron(cell.data.depth, bounds.width, bounds.height, posX, posY)) {
      preventDefault();
      cell.data.onToggle(cell.data.itemId);
    }
    return undefined;
  },
  provideEditor: () => ({
    disablePadding: true,
    editor: (p) => {
      const cell = p.value;
      const withName = (name: string): TaskCell => ({
        ...cell,
        copyData: name,
        data: { ...cell.data, name },
      });
      return (
        <NameEditor
          value={cell.data.name}
          onDraftChange={(name) => p.onChange(withName(name))}
          onCommit={(name, movement) => p.onFinishedEditing(withName(name), movement)}
          // Escape is an explicit cancel: hand Glide `undefined` so no cell
          // edit is emitted at all and the row keeps its stored name.
          onCancel={() => p.onFinishedEditing(undefined, [0, 0])}
        />
      );
    },
  }),
};

const PhaseCellRenderer: CustomRenderer<PhaseCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is PhaseCell =>
    (cell.data as { kind?: string })?.kind === 'wbs-phase',
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    clipToCell(ctx, rect, () => {
      ctx.font = theme.baseFontFull;
      const bias = getMiddleCenterBias(ctx, theme.baseFontFull);
      // Inherited phases render de-emphasised; explicit ones render normally.
      ctx.fillStyle = cell.data.inherited ? theme.textLight : theme.textDark;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(cell.data.label, rect.x + CELL_PAD, rect.y + rect.height / 2 + bias);
    });
    return true;
  },
  provideEditor: () => ({
    disablePadding: true,
    editor: (p) => {
      const cell = p.value;
      return (
        <PhaseEditor
          value={cell.data.ownPhaseName}
          phaseOptions={cell.data.phaseOptions}
          onCommit={(ownPhaseName) =>
            p.onFinishedEditing({ ...cell, data: { ...cell.data, ownPhaseName } }, [0, 0])
          }
          onClose={() => p.onFinishedEditing(undefined, [0, 0])}
        />
      );
    },
  }),
};

const RolesCellRenderer: CustomRenderer<RolesCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is RolesCell =>
    (cell.data as { kind?: string })?.kind === 'wbs-roles',
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    clipToCell(ctx, rect, () => {
      ctx.font = theme.baseFontFull;
      const bias = getMiddleCenterBias(ctx, theme.baseFontFull);
      const chipY = rect.y + (rect.height - CHIP_HEIGHT) / 2;
      const midY = rect.y + rect.height / 2 + bias;

      // Layout is pure and lives in `wbsGrid.ts`; only the measurement needs a
      // canvas. Anything that does not fit becomes a `+N` badge, so a cell can
      // never quietly look as though it holds fewer roles than it does.
      const layout = layoutChips(
        cell.data.pairs,
        rect.width,
        (label) => measureTextCached(label, ctx, theme.baseFontFull).width
      );

      const drawChip = (label: string, x: number, width: number, muted: boolean) => {
        ctx.fillStyle = theme.bgBubble;
        ctx.strokeStyle = theme.borderColor;
        ctx.beginPath();
        roundedRect(ctx, rect.x + x, chipY, width, CHIP_HEIGHT, CHIP_HEIGHT / 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = muted ? theme.textMedium : theme.textDark;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, rect.x + x + CHIP_PAD, midY);
      };

      for (const chip of layout.chips) {
        drawChip(chip.label, chip.x, chip.width, false);
      }
      if (layout.overflow > 0) {
        drawChip(layout.overflowLabel, layout.overflowX, layout.overflowWidth, true);
      }

      if (cell.data.pairs.length === 0) {
        ctx.fillStyle = theme.textLight;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Add roles', rect.x + CELL_PAD, midY);
      }
    });
    return true;
  },
  provideEditor: () => ({
    disablePadding: true,
    editor: (p) => {
      const cell = p.value;
      return (
        <RolesEditor
          itemId={cell.data.itemId}
          pairs={cell.data.pairs}
          resourceLists={cell.data.resourceLists}
          rateCards={cell.data.rateCards}
          committer={cell.data.committer}
          // The editor persists through the committer, not through a cell
          // edit, so it closes without handing Glide a new value.
          onClose={() => p.onFinishedEditing(undefined, [0, 0])}
        />
      );
    },
  }),
};

// `CustomRenderer<T>` is invariant in T under `strictFunctionTypes` (its `draw`
// is a function-typed property, not a method), so a heterogeneous renderer list
// can only be handed to `customRenderers` through a widening cast. Each
// renderer's own `isMatch` is what keeps the runtime types honest.
const CUSTOM_RENDERERS = [
  TaskCellRenderer,
  PhaseCellRenderer,
  RolesCellRenderer,
] as unknown as readonly CustomRenderer[];

/** Depth-0 rows read as document sections. */
const SECTION_ROW_THEME: Partial<Theme> = {
  bgCell: '#f6f6f6',
  bgCellMedium: '#f1f1f1',
  textDark: '#1f1f1f',
};

const EMPTY_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

export function Wbs({
  project,
  resourcePlans,
  resourceLists,
  rateCards,
  wbsItems,
  onAddWbsItem,
  onUpdateWbsItem,
  onDeleteWbsItem,
  onReplaceWbsEstimates,
}: WbsProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_SELECTION);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);

  const phases = useMemo(
    () => parsePhases(project.phases, resourcePlans),
    [project.phases, resourcePlans]
  );
  // De-duplicated: `parsePhases` does not enforce unique names, and two phases
  // sharing one would otherwise render two picker options with the same React
  // key. Downstream (inheritance, staleness) only ever asks for membership.
  const phaseNames = useMemo(
    () => Array.from(new Set(phases.map((phase) => phase.name))),
    [phases]
  );

  const hrsPerPeriod = useMemo(
    () => hoursPerPeriod((project.planningMode || 'weekly') as 'weekly' | 'monthly', project.daysInFTE),
    [project.planningMode, project.daysInFTE]
  );

  // Reconciliation attributes hours to an item's OWN phaseName, so inheritance
  // has to be resolved before the call — `wbs.ts` stays reconciliation-only.
  const reconciliationReport = useMemo(
    () =>
      buildReconciliationReport(
        withEffectivePhases(wbsItems, phaseNames),
        resourcePlans,
        rateCards,
        phases,
        hrsPerPeriod
      ),
    [wbsItems, phaseNames, resourcePlans, rateCards, phases, hrsPerPeriod]
  );

  const rows = useMemo(
    () => buildGridRows(wbsItems, collapsedIds, phaseNames),
    [wbsItems, collapsedIds, phaseNames]
  );

  // The committer must outlive the overlay: `provideEditor` mounts and
  // unmounts `RolesEditor` on every open/close, so an editor-owned committer
  // would reset the per-item chain and reopen the lost-update race.
  const replaceRef = useRef(onReplaceWbsEstimates);
  replaceRef.current = onReplaceWbsEstimates;
  const committerRef = useRef<EstimateCommitter | null>(null);
  if (committerRef.current === null) {
    committerRef.current = createEstimateCommitter((id, estimates) => replaceRef.current(id, estimates));
  }
  const committer = committerRef.current;

  const toggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // `gridSelection` is a row INDEX, so any change to the visible row set
  // (collapse/expand, add, delete) silently re-points it at a different item.
  // Drop it whenever that set changes.
  const visibleRowKey = rows.map((row) => row.id).join(',');
  useEffect(() => {
    setGridSelection(EMPTY_SELECTION);
  }, [visibleRowKey]);

  // Ids are recycled by the database, so a collapsed id left behind by a
  // deleted item would silently start an unrelated new row collapsed.
  // `pruneCollapsedIds` returns the same set when nothing changed, so this
  // cannot loop.
  useEffect(() => {
    setCollapsedIds((prev) => pruneCollapsedIds(prev, wbsItems));
  }, [wbsItems]);

  const selectedIndex = gridSelection.current?.cell[1];
  const selectedRow = selectedIndex === undefined ? undefined : rows[selectedIndex];

  const columns = useMemo(
    (): GridColumn[] => [
      { title: 'WBS', id: 'wbs', width: 80 },
      { title: 'Task Description', id: 'name', width: 360, grow: 1 },
      { title: 'Phase', id: 'phase', width: 160 },
      { title: 'Roles', id: 'roles', width: 320 },
      { title: 'Hours', id: 'hours', width: 100 },
    ],
    []
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const gridRow = rows[row];
      if (gridRow === undefined) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      switch (col) {
        case 0:
          return {
            kind: GridCellKind.Text,
            data: gridRow.outline,
            displayData: gridRow.outline,
            allowOverlay: false,
            readonly: true,
          };
        case 1: {
          const cell: TaskCell = {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: gridRow.name,
            data: {
              kind: 'wbs-task',
              itemId: gridRow.id,
              name: gridRow.name,
              depth: gridRow.depth,
              hasChildren: gridRow.hasChildren,
              collapsed: gridRow.collapsed,
              isSection: gridRow.isSection,
              onToggle: toggleCollapse,
            },
          };
          return cell;
        }
        case 2: {
          const cell: PhaseCell = {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: phaseLabel(gridRow),
            data: {
              kind: 'wbs-phase',
              itemId: gridRow.id,
              ownPhaseName: gridRow.ownPhaseName,
              label: phaseLabel(gridRow),
              inherited: gridRow.phaseInherited,
              phaseOptions: phaseNames,
            },
          };
          return cell;
        }
        case 3: {
          const cell: RolesCell = {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: pairsSummary(gridRow.pairs),
            data: {
              kind: 'wbs-roles',
              itemId: gridRow.id,
              pairs: gridRow.pairs,
              resourceLists,
              rateCards,
              committer,
            },
          };
          return cell;
        }
        default: {
          const hours = formatHours(gridRow.totalHours);
          return {
            kind: GridCellKind.Text,
            data: hours,
            displayData: hours,
            allowOverlay: false,
            readonly: true,
            contentAlign: 'right',
          };
        }
      }
    },
    [rows, phaseNames, resourceLists, rateCards, committer, toggleCollapse]
  );

  /**
   * One user action can reach here twice: Glide's own outside-click handler
   * calls `onFinishEditing` with the overlay's mirrored value, and the editor's
   * input fires a native `blur` that commits as well. Both carry the same
   * payload, so issuing both means two writes for one edit. Suppress a repeat
   * of an edit that is still in flight.
   */
  const inFlightEditsRef = useRef(new Set<string>());
  const issueUpdate = useCallback(
    (id: number, edit: Partial<WbsItem>) => {
      const key = `${id}:${JSON.stringify(edit)}`;
      if (inFlightEditsRef.current.has(key)) return;
      inFlightEditsRef.current.add(key);
      const release = () => {
        inFlightEditsRef.current.delete(key);
      };
      onUpdateWbsItem(id, edit).then(release, release);
    },
    [onUpdateWbsItem]
  );

  const onCellEdited = useCallback(
    ([, row]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Custom) return;
      const data = newValue.data as TaskCellData | PhaseCellData | RolesCellData;

      // The cell carries the id it was opened on. The row INDEX does not
      // survive a shifting row set — a `+ Child` or delete round-trip landing
      // while the overlay is open re-points it at a different item — so the
      // captured id is the source of truth, and the index only a fallback for
      // a cell that carries none. An id that no longer resolves means the item
      // is gone: the right answer is to write nothing, not to write elsewhere.
      const itemId = (data as { itemId?: number }).itemId;
      const gridRow = itemId === undefined ? rows[row] : rows.find((r) => r.id === itemId);
      if (gridRow === undefined) return;

      if (data.kind === 'wbs-task') {
        const edit = nameEditFor(gridRow, data.name);
        // Blank or unchanged: revert locally, no request.
        if (edit !== null) issueUpdate(gridRow.id, edit);
      } else if (data.kind === 'wbs-phase') {
        const edit = phaseEditFor(gridRow, data.ownPhaseName);
        if (edit !== null) issueUpdate(gridRow.id, edit);
      }
      // Roles persist through the committer, never through a cell edit.
    },
    [rows, issueUpdate]
  );

  const getRowThemeOverride = useCallback(
    (row: number) => (rows[row]?.isSection === true ? SECTION_ROW_THEME : undefined),
    [rows]
  );

  /**
   * Glide's `ClickOutsideContainer` dismisses the overlay from a CAPTURE-phase
   * document `mousedown`, before a portaled Radix menu can turn a click on an
   * option into `onValueChange`. Returning false here is one of its two escape
   * hatches (the other, the `click-outside-ignore` class, is on the menu
   * itself) and is what makes the role and phase pickers work at all.
   */
  const isOutsideClick = useCallback(
    (event: MouseEvent | TouchEvent) => !isInsidePortaledMenu(event.target),
    []
  );

  function handleAddRootItem() {
    onAddWbsItem({
      name: 'New item',
      parentId: null,
      phaseName: null,
      displayOrder: nextDisplayOrder(wbsItems, null),
    }).catch(() => {
      // Failure surfaces via the shared app-level error banner.
    });
  }

  function handleAddChild() {
    if (selectedRow === undefined) return;
    const parentId = selectedRow.id;
    // Expand the parent first, or the new row lands inside a collapsed subtree
    // and is invisible — at which point the user just adds it again.
    setCollapsedIds((prev) => {
      if (!prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
    onAddWbsItem({
      name: 'New item',
      parentId,
      phaseName: null,
      displayOrder: nextDisplayOrder(wbsItems, parentId),
    }).catch(() => {});
  }

  function handleDelete() {
    if (selectedRow === undefined) return;
    if (!window.confirm(deleteConfirmMessage(wbsItems, selectedRow.id, selectedRow.name))) return;
    onDeleteWbsItem(selectedRow.id).catch(() => {});
  }

  const gridHeight = Math.max(
    MIN_GRID_HEIGHT,
    Math.min(MAX_GRID_HEIGHT, HEADER_HEIGHT + rows.length * ROW_HEIGHT + GRID_PADDING)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Work Breakdown Structure</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleAddChild} disabled={selectedRow === undefined}>
            + Child
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={selectedRow === undefined}
            className="text-red-600 hover:text-red-700"
          >
            Delete
          </Button>
          <Button onClick={handleAddRootItem}>Add root item</Button>
        </div>
      </div>

      {wbsItems.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No WBS items yet. Add a root item to get started.
        </div>
      ) : (
        <div
          data-testid="wbs-grid-container"
          style={{ height: `${gridHeight}px`, width: '100%', position: 'relative' }}
          className="rounded-lg overflow-hidden border border-gray-200"
        >
          <DataEditor
            columns={columns}
            rows={rows.length}
            getCellContent={getCellContent}
            onCellEdited={onCellEdited}
            customRenderers={CUSTOM_RENDERERS}
            getRowThemeOverride={getRowThemeOverride}
            gridSelection={gridSelection}
            onGridSelectionChange={setGridSelection}
            isOutsideClick={isOutsideClick}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            rowMarkers="none"
            smoothScrollX={true}
            smoothScrollY={true}
            overscrollX={0}
            overscrollY={0}
            theme={GRID_THEME}
          />
        </div>
      )}

      <div className="border-t pt-4">
        <Collapsible open={reconciliationOpen} onOpenChange={setReconciliationOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${reconciliationOpen ? '' : '-rotate-90'}`}
              />
              {reconciliationSummary(reconciliationReport)}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4">
              <ReconciliationPanel report={reconciliationReport} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
