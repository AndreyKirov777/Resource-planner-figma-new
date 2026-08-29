import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataEditor, {
  CompactSelection,
  CustomCell,
  CustomRenderer,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  GridCellKind,
  GridColumn,
  GridSelection,
  Item,
  Theme,
  getMiddleCenterBias,
} from '@glideapps/glide-data-grid';
import type { GridMouseEventArgs, Highlight } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { ChevronDown } from 'lucide-react';
import {
  Project,
  ResourcePlan as ResourcePlanType,
  RateCard as RateCardType,
  ResourceList as ResourceListType,
  WbsItem,
  WbsEstimate,
  RoadmapLaneWithItems,
} from '../services/api';
import { parsePhases } from '../utils/phases';
import { hoursPerPeriod } from '../utils/calculations';
import { buildReconciliationReport } from '../utils/wbs';
import { buildWbsTree, withEffectivePhases } from '../utils/wbsTree';
import { effectiveRoadmapItems, coverage as buildCoverage, RoadmapLinkRecord } from '../utils/roadmap';
import { buildRoadmapLoad, buildByPeriodMatrix, RoadmapLoadItemInput } from '../utils/roadmapLoad';
import {
  WbsColumnId,
  getVisibleWbsColumns,
  loadHiddenWbsColumns,
  saveHiddenWbsColumns,
} from './wbsColumns';
import {
  CELL_PAD,
  CHEVRON_SIZE,
  EstimateCommitter,
  buildGridRows,
  createEstimateCommitter,
  deleteConfirmMessage,
  formatHours,
  hitsChevron,
  hitsKebab,
  indentFor,
  indentPlacement,
  kebabLeft,
  KEBAB_SIZE,
  firstUnseenId,
  nameEditFor,
  newWbsItemFields,
  nextDisplayOrder,
  outdentPlacement,
  phaseEditFor,
  phaseLabel,
  pruneCollapsedIds,
  resourceListRoles,
  roleEditFor,
  selectionAfterDelete,
  siblingBelowPlacement,
  structureActionFromKey,
  structureHintText,
  isMacPlatform,
  StructureAction,
  DropZone,
  dropPlacement,
  dropZone,
} from '../utils/wbsGrid';
import { wouldCreateCycle } from '../utils/wbsTree';
import { GRID_THEME } from './gridTheme';
import { ReconciliationPanel, reconciliationSummary } from './ReconciliationPanel';
import { NameEditor, PhaseEditor, RoadmapLinkEditor, isInsidePortaledMenu } from './WbsEditors';
import { WbsRowMenu } from './WbsRowMenu';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from './ui/utils';

/** Mounted overlay editors increment this so structure keys can no-op. */
let overlayMounts = 0;

function OverlayTracker({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    overlayMounts += 1;
    return () => {
      overlayMounts -= 1;
    };
  }, []);
  return <>{children}</>;
}

function isWbsOverlayOpen(): boolean {
  return overlayMounts > 0 || Boolean(document.querySelector('#portal .gdg-clip-region'));
}

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
  /** Optional: absent renders the grid exactly as before the roadmap feature (no Roadmap column, no coverage cards). */
  roadmapLanes?: RoadmapLaneWithItems[];
  onSetWbsRoadmapLink?: (wbsItemId: number, roadmapItemId: number | null) => Promise<void>;
}

const HEADER_HEIGHT = 44;
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
// NOTE: deliberately not modelled on a canvas cell renderer with a portaled
// Radix menu inside the overlay editor: draws that mutate ctx state without
// save/restore bleed font/alignment into neighbouring cells, and the overlay
// needs guards to actually work. See the spec's "Overlay editor semantics".
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
  readonly onOpenMenu: (itemId: number, x: number, y: number) => void;
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

interface RoadmapLinkCellData {
  readonly kind: 'wbs-roadmap-link';
  readonly itemId: number;
  /** This node's OWN direct link (what the picker's current value is), or null. */
  readonly ownRoadmapItemId: number | null;
  /** The effective (own or inherited) roadmap item's name, or null when unlinked. */
  readonly label: string | null;
  readonly inherited: boolean;
  readonly options: { id: number; name: string }[];
}

type TaskCell = CustomCell<TaskCellData>;
type PhaseCell = CustomCell<PhaseCellData>;
type RoadmapLinkCell = CustomCell<RoadmapLinkCellData>;

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

      const kebabX = x + kebabLeft(width);
      ctx.fillStyle = theme.textDark;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(name, textX, midY, Math.max(0, kebabX - textX - 4));

      const kebabY = y + height / 2;
      ctx.fillStyle = theme.textMedium;
      for (const dy of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.arc(kebabX + KEBAB_SIZE / 2, kebabY + dy, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    return true;
  },
  // Renderer-level onClick: posX/posY are already cell-local, so the chevron
  // hit test needs no bounds math of its own — but it must use BOTH axes.
  // Testing posX alone gives the chevron the full row height, so clicking
  // anywhere down a parent row's left edge toggles instead of selecting.
  onClick: (args) => {
    const { cell, posX, posY, bounds, preventDefault } = args;
    if (
      cell.data.hasChildren &&
      hitsChevron(cell.data.depth, bounds.width, bounds.height, posX, posY)
    ) {
      preventDefault();
      cell.data.onToggle(cell.data.itemId);
      return undefined;
    }
    if (hitsKebab(bounds.width, bounds.height, posX, posY)) {
      preventDefault();
      cell.data.onOpenMenu(cell.data.itemId, bounds.x + bounds.width, bounds.y);
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
        <OverlayTracker>
          <NameEditor
            value={cell.data.name}
            onDraftChange={(name) => p.onChange(withName(name))}
            onCommit={(name, movement) => p.onFinishedEditing(withName(name), movement)}
            // Escape is an explicit cancel: hand Glide `undefined` so no cell
            // edit is emitted at all and the row keeps its stored name.
            onCancel={() => p.onFinishedEditing(undefined, [0, 0])}
          />
        </OverlayTracker>
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
        <OverlayTracker>
          <PhaseEditor
            value={cell.data.ownPhaseName}
            phaseOptions={cell.data.phaseOptions}
            onCommit={(ownPhaseName) =>
              p.onFinishedEditing({ ...cell, data: { ...cell.data, ownPhaseName } }, [0, 0])
            }
            onClose={() => p.onFinishedEditing(undefined, [0, 0])}
          />
        </OverlayTracker>
      );
    },
  }),
};

/**
 * The optional `Roadmap` column (CAP-5), hidden by default. Normal weight
 * when this node is linked directly; muted with an `↑` prefix when the link
 * is inherited from an ancestor. A dropdown of the project's bars plus
 * `None` writes `PUT /api/wbs-items/:id/roadmap-link`.
 */
const RoadmapLinkCellRenderer: CustomRenderer<RoadmapLinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is RoadmapLinkCell =>
    (cell.data as { kind?: string })?.kind === 'wbs-roadmap-link',
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    clipToCell(ctx, rect, () => {
      ctx.font = theme.baseFontFull;
      const bias = getMiddleCenterBias(ctx, theme.baseFontFull);
      const { label, inherited } = cell.data;
      const text = label === null ? '—' : `${inherited ? '↑ ' : ''}${label}`;
      ctx.fillStyle = label === null || inherited ? theme.textLight : theme.textDark;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, rect.x + CELL_PAD, rect.y + rect.height / 2 + bias);
    });
    return true;
  },
  provideEditor: () => ({
    disablePadding: true,
    editor: (p) => {
      const cell = p.value;
      return (
        <OverlayTracker>
          <RoadmapLinkEditor
            value={cell.data.ownRoadmapItemId}
            options={cell.data.options}
            onCommit={(roadmapItemId) =>
              p.onFinishedEditing({ ...cell, data: { ...cell.data, ownRoadmapItemId: roadmapItemId } }, [0, 0])
            }
            onClose={() => p.onFinishedEditing(undefined, [0, 0])}
          />
        </OverlayTracker>
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
  RoadmapLinkCellRenderer,
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

/** Task Description — the cell a newly created row should land on. */
const NAME_COL = 1;
const OUTLINE_COL = 0;
const DRAG_THRESHOLD_PX = 4;
const NEST_HIGHLIGHT: string = 'rgba(143, 79, 143, 0.22)';

interface HoverHit {
  rowIndex: number;
  col: number;
  yInRow: number;
}

interface DropPreview {
  targetId: number;
  rowIndex: number;
  zone: DropZone;
  lineTop: number | null;
}

function selectionForCell(col: number, rowIndex: number): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: {
      cell: [col, rowIndex],
      range: { x: col, y: rowIndex, width: 1, height: 1 },
      rangeStack: [],
    },
  };
}

function parseIdKey(key: string): number[] {
  return key.length === 0 ? [] : key.split(',').map(Number);
}

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
  roadmapLanes = [],
  onSetWbsRoadmapLink,
}: WbsProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_SELECTION);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<WbsColumnId[]>(() => loadHiddenWbsColumns(project.id));
  const [gridClientWidth, setGridClientWidth] = useState(0);
  const isMac = useMemo(() => isMacPlatform(), []);
  const gridRef = useRef<DataEditorRef | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedItemIdRef = useRef<number | null>(null);
  const selectedColRef = useRef(NAME_COL);
  const selectCreatedRef = useRef(false);
  const shouldFocusRef = useRef(false);
  const knownItemIdsRef = useRef<Set<number> | null>(null);
  const hoverRef = useRef<HoverHit | null>(null);

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

  const roles = useMemo(() => resourceListRoles(resourceLists), [resourceLists]);
  const rows = useMemo(
    () => buildGridRows(wbsItems, collapsedIds, phaseNames, roles),
    [wbsItems, collapsedIds, phaseNames, roles]
  );

  // Roadmap link data (CAP-5, CAP-7) for the optional Roadmap column and the
  // coverage cards. `roadmapLanes` defaults to [] so every derivation below
  // degenerates to "no links anywhere" when the prop is omitted.
  const roadmapTree = useMemo(() => buildWbsTree(wbsItems), [wbsItems]);
  const roadmapAllItems = useMemo(() => roadmapLanes.flatMap((lane) => lane.items), [roadmapLanes]);
  const roadmapLinks: RoadmapLinkRecord[] = useMemo(
    () => roadmapAllItems.flatMap((item) => item.wbsItemIds.map((wbsItemId) => ({ wbsItemId, roadmapItemId: item.id }))),
    [roadmapAllItems]
  );
  const roadmapEffective = useMemo(
    () => effectiveRoadmapItems(roadmapTree, roadmapLinks),
    [roadmapTree, roadmapLinks]
  );
  const roadmapOwnLinkByWbsId = useMemo(
    () => new Map(roadmapLinks.map((l) => [l.wbsItemId, l.roadmapItemId])),
    [roadmapLinks]
  );
  const roadmapItemNameById = useMemo(
    () => new Map(roadmapAllItems.map((i) => [i.id, i.name])),
    [roadmapAllItems]
  );
  const roadmapBarOptions = useMemo(
    () => roadmapAllItems.filter((i) => i.kind === 'bar').map((i) => ({ id: i.id, name: i.name })),
    [roadmapAllItems]
  );

  const visibleColumns = useMemo(
    () => getVisibleWbsColumns(hiddenColumns, roles),
    [hiddenColumns, roles]
  );
  const columnCount = visibleColumns.length;
  const roadmapColumnVisible = visibleColumns.some((c) => c.id === 'roadmap');

  function toggleRoadmapColumn(show: boolean) {
    setHiddenColumns((prev) => {
      const next = show ? prev.filter((id) => id !== 'roadmap') : [...new Set([...prev, 'roadmap' as WbsColumnId])];
      saveHiddenWbsColumns(project.id, next);
      return next;
    });
  }

  // CAP-7 coverage cards — undefined (no cards rendered) when the roadmap
  // hasn't loaded at all, distinct from "loaded and empty" (roadmapLanes: []),
  // which legitimately reports every WBS hour as unplaced.
  const roadmapCoverage = useMemo(() => {
    if (roadmapLanes.length === 0) return undefined;
    const report = buildCoverage(
      wbsItems,
      roadmapLinks,
      roadmapAllItems.map((i) => ({ id: i.id, kind: i.kind, startPeriod: i.startPeriod, periodCount: i.periodCount })),
      phases
    );
    const nameOf = (id: number) => wbsItems.find((w) => w.id === id)?.name ?? `#${id}`;
    return {
      unplaced: report.unplaced.map((row) => ({ wbsItemId: row.wbsItemId, name: nameOf(row.wbsItemId), hours: row.hours })),
      unplacedHours: report.unplacedHours,
      unplacedShare: report.unplacedShare,
      empty: report.empty.map((id) => ({ roadmapItemId: id, name: roadmapItemNameById.get(id) ?? `#${id}` })),
      phaseMismatch: report.phaseMismatch.map((row) => ({
        roadmapItemId: row.roadmapItemId,
        itemName: roadmapItemNameById.get(row.roadmapItemId) ?? `#${row.roadmapItemId}`,
        wbsItemId: row.wbsItemId,
        leafName: nameOf(row.wbsItemId),
        phaseName: row.phaseName,
      })),
    };
  }, [roadmapLanes.length, wbsItems, roadmapLinks, roadmapAllItems, phases, roadmapItemNameById]);

  // CAP-10 by-period matrix — ALWAYS computed (unlike the coverage cards
  // above): it renders from the phase baseline even when the roadmap is
  // empty, per `ux-reference.md`. An empty `roadmapLanes` yields an empty
  // `loadItems`/`roadmapLinks`, so every leaf falls back to its own phase
  // baseline in `buildRoadmapLoad` — the same engine, not a special case.
  const roadmapLoadItems: RoadmapLoadItemInput[] = useMemo(
    () => roadmapAllItems.map((i) => ({ id: i.id, name: i.name, kind: i.kind, startPeriod: i.startPeriod, periodCount: i.periodCount })),
    [roadmapAllItems]
  );
  const roadmapLoad = useMemo(
    () =>
      buildRoadmapLoad({
        wbsItems,
        roadmapItems: roadmapLoadItems,
        links: roadmapLinks,
        resourcePlans,
        rateCards,
        phases,
        planningMode: (project.planningMode || 'weekly') as 'weekly' | 'monthly',
        daysInFTE: project.daysInFTE,
      }),
    [wbsItems, roadmapLoadItems, roadmapLinks, resourcePlans, rateCards, phases, project.planningMode, project.daysInFTE]
  );
  const byPeriodRoleMatrix = useMemo(() => buildByPeriodMatrix(roadmapLoad, 'role'), [roadmapLoad]);
  const byPeriodDisciplineMatrix = useMemo(() => buildByPeriodMatrix(roadmapLoad, 'discipline'), [roadmapLoad]);

  // The committer must outlive individual cell edits so rapid writes on the
  // same row share one merge basis and one serialized request chain.
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

  const expandItem = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const structureBusyRef = useRef(false);

  const openRowMenu = useCallback((id: number, x: number, y: number) => {
    if (isWbsOverlayOpen()) return;
    setRowMenu({ id, x, y });
  }, []);

  // `gridSelection` is a row INDEX. Rematch it to the selected item id when
  // the visible set changes, so collapse/add/delete cannot silently point at
  // a different row. After an add, land on the created item; after a delete,
  // land on the row above (or the next survivor if that was the first row).
  const visibleRowKey = rows.map((row) => row.id).join(',');
  const itemIdsKey = wbsItems.map((item) => item.id).join(',');
  useEffect(() => {
    hoverRef.current = null;
    const visibleIds = parseIdKey(visibleRowKey);
    const itemIds = parseIdKey(itemIdsKey);
    const known = knownItemIdsRef.current ?? new Set<number>();

    let justCreated = false;
    if (selectCreatedRef.current) {
      const createdId = firstUnseenId(known, itemIds);
      if (createdId !== undefined) {
        selectCreatedRef.current = false;
        selectedItemIdRef.current = createdId;
        selectedColRef.current = NAME_COL;
        justCreated = true;
      }
    }
    knownItemIdsRef.current = new Set(itemIds);

    const selectedId = selectedItemIdRef.current;
    if (selectedId === null) {
      setGridSelection(EMPTY_SELECTION);
      setRowMenu(null);
      shouldFocusRef.current = false;
      return;
    }
    const rowIndex = visibleIds.indexOf(selectedId);
    if (rowIndex < 0) {
      setGridSelection(EMPTY_SELECTION);
      setRowMenu(null);
      if (!itemIds.includes(selectedId)) {
        selectedItemIdRef.current = null;
      }
      shouldFocusRef.current = false;
      return;
    }
    const col = selectedColRef.current;
    setGridSelection(selectionForCell(col, rowIndex));
    setRowMenu(null);
    if (justCreated || shouldFocusRef.current) {
      shouldFocusRef.current = false;
      requestAnimationFrame(() => {
        gridRef.current?.scrollTo(col, rowIndex);
        gridRef.current?.focus();
      });
    }
  }, [visibleRowKey, itemIdsKey]);

  // Ids are recycled by the database, so a collapsed id left behind by a
  // deleted item would silently start an unrelated new row collapsed.
  // `pruneCollapsedIds` returns the same set when nothing changed, so this
  // cannot loop.
  useEffect(() => {
    setCollapsedIds((prev) => pruneCollapsedIds(prev, wbsItems));
  }, [wbsItems]);

  const selectedIndex = gridSelection.current?.cell[1];
  const selectedRow = selectedIndex === undefined ? undefined : rows[selectedIndex];

  const onGridSelectionChange = useCallback(
    (sel: GridSelection) => {
      setGridSelection(sel);
      const cell = sel.current?.cell;
      if (cell === undefined) {
        selectedItemIdRef.current = null;
        return;
      }
      selectedColRef.current = cell[0];
      selectedItemIdRef.current = rows[cell[1]]?.id ?? null;
    },
    [rows]
  );

  // Stretch Task Description to fill leftover width ourselves. Glide's `grow`
  // does the same math only after the first measure, so the column visibly
  // eases from its base 360px to the grown width on every page entry.
  useLayoutEffect(() => {
    const el = gridContainerRef.current;
    if (el === null) return;
    const sync = () => {
      const w = el.clientWidth;
      setGridClientWidth((prev) => (prev === w ? prev : w));
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wbsItems.length]);

  const columns = useMemo((): GridColumn[] => {
    const mapped: GridColumn[] = visibleColumns.map((c) => ({
      title: c.title,
      id: c.id === 'outline' ? 'wbs' : c.id, // 'wbs' matches the grid id every prior snapshot/test expects
      width: c.width,
      themeOverride:
        c.id === 'total'
          ? {
              bgHeader: '#d9dde5',
              textHeader: '#2a2a2a',
              headerFontStyle: '700 11px',
            }
          : undefined,
    }));
    const nameIdx = visibleColumns.findIndex((c) => c.id === 'name');
    if (nameIdx >= 0 && gridClientWidth > 0) {
      const rest = mapped.reduce((sum, col, i) => (i === nameIdx ? sum : sum + col.width), 0);
      mapped[nameIdx] = {
        ...mapped[nameIdx],
        width: Math.max(mapped[nameIdx].width, gridClientWidth - rest),
      };
    }
    return mapped;
  }, [visibleColumns, gridClientWidth]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const gridRow = rows[row];
      if (gridRow === undefined) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }
      const columnDef = visibleColumns[col];
      if (columnDef === undefined) {
        return { kind: GridCellKind.Loading, allowOverlay: false };
      }

      switch (columnDef.id) {
        case 'outline':
          return {
            kind: GridCellKind.Text,
            data: gridRow.outline,
            displayData: gridRow.outline,
            allowOverlay: false,
            readonly: true,
            cursor: 'grab',
          };
        case 'name': {
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
              onOpenMenu: openRowMenu,
            },
          };
          return cell;
        }
        case 'phase': {
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
        case 'roadmap': {
          const effective = roadmapEffective.get(gridRow.id);
          const effectiveId = effective?.roadmapItemId ?? null;
          const label = effectiveId != null ? (roadmapItemNameById.get(effectiveId) ?? null) : null;
          const cell: RoadmapLinkCell = {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: label ? `${effective?.inherited ? '↑ ' : ''}${label}` : '',
            data: {
              kind: 'wbs-roadmap-link',
              itemId: gridRow.id,
              ownRoadmapItemId: roadmapOwnLinkByWbsId.get(gridRow.id) ?? null,
              label,
              inherited: effective?.inherited ?? false,
              options: roadmapBarOptions,
            },
          };
          return cell;
        }
        case 'total': {
          const hours = formatHours(gridRow.totalHours);
          return {
            kind: GridCellKind.Text,
            data: hours,
            displayData: hours,
            allowOverlay: false,
            readonly: true,
            contentAlign: 'right',
            themeOverride: {
              bgCell: gridRow.isSection ? '#dfe3ea' : '#eceef2',
              baseFontStyle: '700 14px',
              textDark: '#2a2a2a',
              textMedium: '#2a2a2a',
            },
          };
        }
        default: {
          if (columnDef.role === undefined) {
            return { kind: GridCellKind.Loading, allowOverlay: false };
          }
          const value = gridRow.roleHours[columnDef.role] ?? 0;
          const hours = formatHours(value);
          return {
            kind: GridCellKind.Text,
            data: hours,
            displayData: hours,
            allowOverlay: !gridRow.hasChildren,
            readonly: gridRow.hasChildren,
            contentAlign: 'right',
            cursor: gridRow.hasChildren ? 'default' : 'text',
            themeOverride: {
              textDark: value === 0 ? '#737373' : '#313131',
            },
          };
        }
      }
    },
    [
      rows,
      visibleColumns,
      phaseNames,
      toggleCollapse,
      openRowMenu,
      roadmapEffective,
      roadmapOwnLinkByWbsId,
      roadmapItemNameById,
      roadmapBarOptions,
    ]
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
    ([col, row]: Item, newValue: EditableGridCell) => {
      const columnDef = visibleColumns[col];
      const indexedRow = rows[row];
      if (columnDef?.role !== undefined && newValue.kind === GridCellKind.Text) {
        if (indexedRow === undefined || indexedRow.hasChildren) return;
        const basis = committer.basisFor(indexedRow.id, indexedRow.pairs);
        const next = roleEditFor(columnDef.role, newValue.data, basis, rateCards);
        if (next !== null) {
          committer.commit(indexedRow.id, next).catch(() => {});
        }
        return;
      }

      if (newValue.kind !== GridCellKind.Custom) return;
      const data = newValue.data as TaskCellData | PhaseCellData | RoadmapLinkCellData;

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
      } else if (data.kind === 'wbs-roadmap-link') {
        const previousOwn = roadmapOwnLinkByWbsId.get(gridRow.id) ?? null;
        if (data.ownRoadmapItemId !== previousOwn && onSetWbsRoadmapLink !== undefined) {
          onSetWbsRoadmapLink(gridRow.id, data.ownRoadmapItemId).catch(() => {});
        }
      }
    },
    [
      visibleColumns,
      rows,
      committer,
      rateCards,
      issueUpdate,
      roadmapOwnLinkByWbsId,
      onSetWbsRoadmapLink,
    ]
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

  function applyShifts(shifts: { id: number; displayOrder: number }[]) {
    return Promise.all(
      shifts.map((shift) => onUpdateWbsItem(shift.id, { displayOrder: shift.displayOrder }).catch(() => {}))
    );
  }

  function markSelectCreated() {
    selectCreatedRef.current = true;
  }

  function handleAddRootItem() {
    markSelectCreated();
    onAddWbsItem(newWbsItemFields(null, nextDisplayOrder(wbsItems, null))).catch(() => {
      selectCreatedRef.current = false;
    });
  }

  function handleAddChild(itemId: number) {
    expandItem(itemId);
    markSelectCreated();
    return onAddWbsItem(newWbsItemFields(itemId, nextDisplayOrder(wbsItems, itemId))).catch(() => {
      selectCreatedRef.current = false;
    });
  }

  async function handleAddSibling(itemId: number) {
    const placement = siblingBelowPlacement(wbsItems, itemId);
    if (placement === null) return;
    await applyShifts(placement.shifts);
    markSelectCreated();
    await onAddWbsItem(newWbsItemFields(placement.parentId, placement.displayOrder)).catch(() => {
      selectCreatedRef.current = false;
    });
  }

  function handleIndent(itemId: number) {
    const placement = indentPlacement(wbsItems, itemId);
    if (placement === null) return;
    if (wouldCreateCycle(wbsItems, itemId, placement.parentId)) return;
    expandItem(placement.parentId);
    return onUpdateWbsItem(itemId, placement).catch(() => {});
  }

  async function handleOutdent(itemId: number) {
    const placement = outdentPlacement(wbsItems, itemId);
    if (placement === null) return;
    if (wouldCreateCycle(wbsItems, itemId, placement.parentId)) return;
    await applyShifts(placement.shifts);
    await onUpdateWbsItem(itemId, { parentId: placement.parentId, displayOrder: placement.displayOrder }).catch(
      () => {}
    );
  }

  function handleDrop(draggedId: number, targetId: number, zone: DropZone) {
    if (isWbsOverlayOpen() || structureBusyRef.current) return;
    const placement = dropPlacement(wbsItems, draggedId, targetId, zone);
    if (placement === null) return;
    structureBusyRef.current = true;
    if (zone === 'child' || zone === 'first-child') {
      expandItem(targetId);
    }
    const work = applyShifts(placement.shifts).then(() =>
      onUpdateWbsItem(draggedId, {
        parentId: placement.parentId,
        displayOrder: placement.displayOrder,
      }).catch(() => {})
    );
    void Promise.resolve(work).finally(() => {
      structureBusyRef.current = false;
    });
  }

  const dragRef = useRef<{
    draggedId: number;
    startX: number;
    startY: number;
    active: boolean;
    previousBodyCursor: string;
  } | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [outlineDragging, setOutlineDragging] = useState(false);
  const dropPreviewRef = useRef<DropPreview | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handleDropRef = useRef(handleDrop);
  handleDropRef.current = handleDrop;

  function publishPreview(preview: DropPreview | null) {
    dropPreviewRef.current = preview;
    setDropPreview(preview);
  }

  function abortDrag() {
    const previous = dragRef.current?.previousBodyCursor ?? '';
    dragRef.current = null;
    setOutlineDragging(false);
    publishPreview(null);
    document.body.style.cursor = previous;
  }

  function lineTopFor(rowIndex: number, zone: DropZone): number | null {
    const bounds = gridRef.current?.getBounds(OUTLINE_COL, rowIndex);
    const container = gridContainerRef.current?.getBoundingClientRect();
    if (bounds === undefined || container === undefined) return null;
    const y = zone === 'before' ? bounds.y : bounds.y + bounds.height;
    return y - container.top;
  }

  function previewForHit(hit: HoverHit): DropPreview | null {
    const target = rowsRef.current[hit.rowIndex];
    if (target === undefined) return null;
    const zone = dropZone(hit.yInRow, ROW_HEIGHT, target.hasChildren && !target.collapsed);
    return {
      targetId: target.id,
      rowIndex: hit.rowIndex,
      zone,
      lineTop: zone === 'child' ? null : lineTopFor(hit.rowIndex, zone),
    };
  }

  function hitTest(clientX: number, clientY: number): HoverHit | null {
    const api = gridRef.current;
    const currentRows = rowsRef.current;
    if (api?.getBounds === undefined) return hoverRef.current;
    for (let r = 0; r < currentRows.length; r++) {
      const outline = api.getBounds(OUTLINE_COL, r);
      if (outline === undefined) continue;
      if (clientY < outline.y || clientY >= outline.y + outline.height) continue;
      const yInRow = clientY - outline.y;
      for (let c = 0; c < columnCount; c++) {
        const cell = c === OUTLINE_COL ? outline : api.getBounds(c, r);
        if (cell !== undefined && clientX >= cell.x && clientX < cell.x + cell.width) {
          return { rowIndex: r, col: c, yInRow };
        }
      }
      return { rowIndex: r, col: -1, yInRow };
    }
    return null;
  }

  function rememberHover(args: GridMouseEventArgs) {
    if (args.kind !== 'cell') return;
    hoverRef.current = {
      rowIndex: args.location[1],
      col: args.location[0],
      yInRow: args.localEventY,
    };
    if (dragRef.current?.active === true) {
      publishPreview(previewForHit(hoverRef.current));
    }
  }

  function onGridPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (dragRef.current !== null) return;
    if (isWbsOverlayOpen() || structureBusyRef.current) return;
    const hit = hitTest(event.clientX, event.clientY);
    if (hit === null || hit.col !== OUTLINE_COL) return;
    const row = rows[hit.rowIndex];
    if (row === undefined) return;
    dragRef.current = {
      draggedId: row.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      previousBodyCursor: document.body.style.cursor,
    };
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag === null) return;
      if (event.buttons === 0) {
        abortDrag();
        return;
      }
      if (!drag.active) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        drag.active = true;
        setOutlineDragging(true);
        document.body.style.cursor = 'grabbing';
      }
      const hit = hitTest(event.clientX, event.clientY);
      publishPreview(hit === null ? null : previewForHit(hit));
    }

    function onPointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      const drag = dragRef.current;
      const hit = hitTest(event.clientX, event.clientY);
      const preview = hit === null ? null : previewForHit(hit);
      abortDrag();
      if (drag?.active !== true || preview === null) return;
      handleDropRef.current(drag.draggedId, preview.targetId, preview.zone);
    }

    function onPointerCancel() {
      abortDrag();
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.body.style.cursor = dragRef.current?.previousBodyCursor ?? '';
    };
  }, []);

  const nestHighlight = useMemo((): readonly Highlight[] | undefined => {
    if (dropPreview === null || dropPreview.zone !== 'child') return undefined;
    return [
      {
        color: NEST_HIGHLIGHT,
        range: { x: 0, y: dropPreview.rowIndex, width: columnCount, height: 1 },
      },
    ];
  }, [dropPreview]);

  function handleDelete(itemId: number) {
    const target = wbsItems.find((item) => item.id === itemId);
    if (target === undefined) return;
    if (!window.confirm(deleteConfirmMessage(wbsItems, itemId, target.name))) return;
    const previousSelectedId = selectedItemIdRef.current;
    selectedItemIdRef.current =
      selectionAfterDelete(
        rows.map((row) => row.id),
        wbsItems,
        itemId
      ) ?? null;
    shouldFocusRef.current = true;
    return onDeleteWbsItem(itemId).catch(() => {
      selectedItemIdRef.current = previousSelectedId;
      shouldFocusRef.current = false;
    });
  }

  function runStructureAction(action: StructureAction, itemId: number) {
    if (structureBusyRef.current) return;
    structureBusyRef.current = true;
    const work = (() => {
      switch (action) {
        case 'addChild':
          return handleAddChild(itemId);
        case 'addSibling':
          return handleAddSibling(itemId);
        case 'indent':
          return handleIndent(itemId);
        case 'outdent':
          return handleOutdent(itemId);
        case 'delete':
          return handleDelete(itemId);
      }
    })();
    Promise.resolve(work).finally(() => {
      structureBusyRef.current = false;
    });
  }

  function onGridKeyDown(event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    cancel?: () => void;
    preventDefault?: () => void;
  }) {
    if (rowMenu !== null) {
      event.cancel?.();
      event.preventDefault?.();
      return;
    }
    const action = structureActionFromKey(event, isWbsOverlayOpen());
    if (action === null || selectedRow === undefined) return;
    event.cancel?.();
    event.preventDefault?.();
    runStructureAction(action, selectedRow.id);
  }

  const gridHeight = Math.max(
    MIN_GRID_HEIGHT,
    Math.min(MAX_GRID_HEIGHT, HEADER_HEIGHT + rows.length * ROW_HEIGHT + GRID_PADDING)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-lg font-semibold shrink-0">Work Breakdown Structure</h2>
          {wbsItems.length > 0 && (
            <p data-testid="wbs-structure-hint" className="text-muted-foreground truncate text-xs">
              {structureHintText(isMac)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={roadmapColumnVisible} onCheckedChange={toggleRoadmapColumn}>
                Roadmap
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {wbsItems.length === 0 && <Button onClick={handleAddRootItem}>Add root item</Button>}
        </div>
      </div>

      {wbsItems.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No WBS items yet. Add a root item to get started.
        </div>
      ) : (
        <div
          ref={gridContainerRef}
          data-testid="wbs-grid-container"
          style={{ height: `${gridHeight}px`, width: '100%', position: 'relative' }}
          className={cn(
            'rounded-lg overflow-hidden border border-gray-200',
            outlineDragging && 'cursor-grabbing'
          )}
          onPointerDown={onGridPointerDown}
        >
          <DataEditor
            ref={gridRef}
            columns={columns}
            rows={rows.length}
            getCellContent={getCellContent}
            onCellEdited={onCellEdited}
            customRenderers={CUSTOM_RENDERERS}
            getRowThemeOverride={getRowThemeOverride}
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            onKeyDown={onGridKeyDown}
            onItemHovered={rememberHover}
            onMouseMove={rememberHover}
            highlightRegions={nestHighlight}
            isOutsideClick={isOutsideClick}
            rowHeight={ROW_HEIGHT}
            headerHeight={HEADER_HEIGHT}
            rowMarkers="none"
            smoothScrollX={true}
            smoothScrollY={true}
            overscrollX={0}
            overscrollY={0}
            theme={GRID_THEME}
            {...{ onWbsDrop: handleDrop }}
          />
          {dropPreview !== null && dropPreview.zone !== 'child' && dropPreview.lineTop !== null && (
            <div
              data-testid="wbs-drop-line"
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: dropPreview.lineTop,
                height: 2,
                background: GRID_THEME.accentColor,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          )}
        </div>
      )}

      {rowMenu !== null && (
        <WbsRowMenu
          open
          onOpenChange={(open) => {
            if (!open) setRowMenu(null);
          }}
          x={rowMenu.x}
          y={rowMenu.y}
          canIndent={indentPlacement(wbsItems, rowMenu.id) !== null}
          canOutdent={outdentPlacement(wbsItems, rowMenu.id) !== null}
          isMac={isMac}
          onAddChild={() => runStructureAction('addChild', rowMenu.id)}
          onAddSibling={() => runStructureAction('addSibling', rowMenu.id)}
          onIndent={() => runStructureAction('indent', rowMenu.id)}
          onOutdent={() => runStructureAction('outdent', rowMenu.id)}
          onDelete={() => runStructureAction('delete', rowMenu.id)}
        />
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
              <ReconciliationPanel
                report={reconciliationReport}
                coverage={roadmapCoverage}
                byPeriodRoleMatrix={byPeriodRoleMatrix}
                byPeriodDisciplineMatrix={byPeriodDisciplineMatrix}
                byPeriodPhaseBaselineOnly={roadmapLanes.length === 0}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
