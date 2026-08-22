/**
 * The Roadmap tab (CAP-1..7, 11, 12): toolbar, empty state, the left grid
 * plus the period timeline, the non-modal editor panel and the bootstrap
 * dialog. Domain state (`roadmapLanes`) is owned by `App.tsx`, per this
 * repo's convention — this component is controlled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Maximize2, Minimize2 } from 'lucide-react';
import {
  Project,
  WbsItem,
  RoadmapLaneWithItems,
  RoadmapItem,
  RoadmapItemKind,
  BootstrapRoadmapPayload,
  ResourcePlan,
  RateCard,
  GeneratePlanDraft,
} from '../../services/api';
import { parsePhases } from '../../utils/phases';
import { hoursPerPeriod } from '../../utils/calculations';
import { buildWbsTree, effectivePhases } from '../../utils/wbsTree';
import { regionForLocationSlug } from '../../utils/regions';
import { APP_DEFAULTS } from '../../config/defaults';
import {
  effectiveRoadmapItems,
  itemEffort,
  toRoadmapRows,
  bootstrapRoadmap,
  BootstrapPreview,
  RoadmapLinkRecord,
  RoadmapRowLane,
  RoadmapRowItem,
} from '../../utils/roadmap';
import {
  buildRoadmapLoad,
  overDemandPeriodsInWindow,
  roadmapLoadKeys,
  totalDemandHours,
  RoadmapLoadDimension,
  RoadmapLoadItemInput,
} from '../../utils/roadmapLoad';
import { buildDraftFromRoadmapLoad } from '../../utils/roadmapDraftPlan';
import {
  ZOOM_LADDER,
  DEFAULT_ZOOM_INDEX,
  zoomStep,
  fit as fitZoom,
} from '../../utils/roadmapGeometry';
import { RoadmapGrid } from './RoadmapGrid';
import { RoadmapTimeline } from './RoadmapTimeline';
import { RoadmapLoadStrip } from './RoadmapLoadStrip';
import { GeneratePlanSheet } from '../GeneratePlanSheet';
import { RoadmapEditorPanel } from './RoadmapEditorPanel';
import { BootstrapDialog } from './BootstrapDialog';
import { TextPromptDialog } from './TextPromptDialog';
import { AddItemDialog } from './AddItemDialog';
import { StartDateDialog } from './StartDateDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { RoadmapDragCommit } from './useRoadmapDrag';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';

type RoadmapItemPatch = Partial<{
  name: string;
  laneId: number;
  kind: RoadmapItemKind;
  startPeriod: number;
  periodCount: number;
  displayOrder: number;
}>;

interface RoadmapProps {
  project: Project;
  wbsItems: WbsItem[];
  roadmapLanes: RoadmapLaneWithItems[];
  resourcePlans: ResourcePlan[];
  rateCards: RateCard[];
  onAddLane: (name: string) => Promise<void>;
  onUpdateLane: (id: number, data: { name?: string; displayOrder?: number }) => Promise<void>;
  onDeleteLane: (id: number) => Promise<void>;
  onAddItem: (
    laneId: number,
    data: { name: string; kind?: RoadmapItemKind; startPeriod: number; periodCount: number }
  ) => Promise<RoadmapItem>;
  onUpdateItem: (id: number, data: RoadmapItemPatch) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onReplaceItemLinks: (itemId: number, wbsItemIds: number[]) => Promise<void>;
  onBootstrap: (payload: BootstrapRoadmapPayload) => Promise<void>;
  onSetStartDate: (startDate: string | null) => Promise<void>;
  /** CAP-13: accepts a draft built from the roadmap's demand — same contract as `GeneratePlanSheet`'s existing `onAcceptPlan`. */
  onGenerateDraftPlan: (draft: GeneratePlanDraft) => Promise<void>;
}

function collapsedStorageKey(projectId: number) {
  return `roadmap-collapsed-lanes:${projectId}`;
}

function loadCollapsedLanes(projectId: number): Set<number> {
  try {
    const raw = window.localStorage.getItem(collapsedStorageKey(projectId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((n): n is number => typeof n === 'number')) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedLanes(projectId: number, collapsed: Set<number>) {
  try {
    window.localStorage.setItem(collapsedStorageKey(projectId), JSON.stringify([...collapsed]));
  } catch {
    /* private mode / quota — the choice simply won't survive a reload */
  }
}

function zoomStorageKey(projectId: number) {
  return `roadmap-zoom:${projectId}`;
}

function loadZoomIndex(projectId: number): number {
  try {
    const raw = window.localStorage.getItem(zoomStorageKey(projectId));
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 && n < ZOOM_LADDER.length ? n : DEFAULT_ZOOM_INDEX;
  } catch {
    return DEFAULT_ZOOM_INDEX;
  }
}

function saveZoomIndex(projectId: number, index: number) {
  try {
    window.localStorage.setItem(zoomStorageKey(projectId), String(index));
  } catch {
    /* private mode / quota — the choice simply won't survive a reload */
  }
}

export function Roadmap({
  project,
  wbsItems,
  roadmapLanes,
  resourcePlans,
  rateCards,
  onAddLane,
  onUpdateLane,
  onDeleteLane,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReplaceItemLinks,
  onBootstrap,
  onSetStartDate,
  onGenerateDraftPlan,
}: RoadmapProps) {
  const planningMode = (project.planningMode || 'weekly') as 'weekly' | 'monthly';
  const phases = useMemo(() => parsePhases(project.phases, []), [project.phases]);
  const np = useMemo(() => Math.max(1, phases.reduce((s, p) => s + (p.periodCount ?? p.weekCount ?? 0), 0)), [phases]);
  const hrsPerPeriod = useMemo(
    () => hoursPerPeriod(planningMode, project.daysInFTE),
    [planningMode, project.daysInFTE]
  );

  const [zoomIndex, setZoomIndex] = useState(() => loadZoomIndex(project.id));
  const periodWidth = ZOOM_LADDER[zoomIndex];
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadCollapsedLanes(project.id));
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [editorItemId, setEditorItemId] = useState<number | null>(null);
  const [bootstrapPreview, setBootstrapPreview] = useState<BootstrapPreview | null>(null);
  const [draftPlan, setDraftPlan] = useState<GeneratePlanDraft | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [addLaneOpen, setAddLaneOpen] = useState(false);
  const [renameLaneId, setRenameLaneId] = useState<number | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const loadStripScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCollapsed(loadCollapsedLanes(project.id));
    setZoomIndex(loadZoomIndex(project.id));
    setSelectedItemId(null);
    setEditorItemId(null);
  }, [project.id]);

  function applyZoom(next: number) {
    setZoomIndex(next);
    saveZoomIndex(project.id, next);
  }

  const tree = useMemo(() => buildWbsTree(wbsItems), [wbsItems]);
  const allItems = useMemo(() => roadmapLanes.flatMap((l) => l.items), [roadmapLanes]);
  const links: RoadmapLinkRecord[] = useMemo(
    () => allItems.flatMap((item) => item.wbsItemIds.map((wbsItemId) => ({ wbsItemId, roadmapItemId: item.id }))),
    [allItems]
  );
  const effective = useMemo(() => effectiveRoadmapItems(tree, links), [tree, links]);
  const effortByItemId = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    allItems.forEach((item) => map.set(item.id, itemEffort(item.id, wbsItems, tree, effective)));
    return map;
  }, [allItems, wbsItems, tree, effective]);

  const rowLanes: RoadmapRowLane[] = useMemo(
    () => roadmapLanes.map((l) => ({ id: l.id, name: l.name, displayOrder: l.displayOrder })),
    [roadmapLanes]
  );
  const rowItems: RoadmapRowItem[] = useMemo(
    () =>
      allItems.map((i) => ({
        id: i.id,
        laneId: i.laneId,
        name: i.name,
        kind: i.kind,
        startPeriod: i.startPeriod,
        periodCount: i.periodCount,
        displayOrder: i.displayOrder,
      })),
    [allItems]
  );
  // CAP-8/9: one `roadmapLoad` build feeds the bar stripe, the tooltip's
  // supply lines and (Block 4) the load strip — never re-derived per reader.
  const loadItems: RoadmapLoadItemInput[] = useMemo(
    () =>
      allItems.map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
        startPeriod: i.startPeriod,
        periodCount: i.periodCount,
      })),
    [allItems]
  );
  const roadmapLoad = useMemo(
    () =>
      buildRoadmapLoad({
        wbsItems,
        roadmapItems: loadItems,
        links,
        resourcePlans,
        rateCards,
        phases,
        planningMode,
        daysInFTE: project.daysInFTE,
      }),
    [wbsItems, loadItems, links, resourcePlans, rateCards, phases, planningMode, project.daysInFTE]
  );
  const overDemandByItemId = useMemo(() => {
    const map = new Map<number, number[]>();
    allItems.forEach((item) => {
      if (item.kind === 'milestone') return;
      const effort = effortByItemId.get(item.id) ?? new Map<string, number>();
      const window =
        item.kind === 'spread'
          ? { startPeriod: 1, periodCount: np }
          : { startPeriod: item.startPeriod, periodCount: item.periodCount };
      map.set(item.id, overDemandPeriodsInWindow(roadmapLoad, effort, window));
    });
    return map;
  }, [allItems, effortByItemId, roadmapLoad, np]);

  const rows = useMemo(
    () => toRoadmapRows(rowLanes, rowItems, effortByItemId, collapsed, hrsPerPeriod, np, overDemandByItemId),
    [rowLanes, rowItems, effortByItemId, collapsed, hrsPerPeriod, np, overDemandByItemId]
  );

  // CAP-9's load strip is a SINGLE explicit role/discipline at a time,
  // switchable from the toolbar (the conservative reading of the open
  // question — see the Slice B final report). Defaults to the first
  // available role, falling back to the first discipline, then to nothing.
  const roleKeys = useMemo(() => roadmapLoadKeys(roadmapLoad, 'role'), [roadmapLoad]);
  const disciplineKeys = useMemo(() => roadmapLoadKeys(roadmapLoad, 'discipline'), [roadmapLoad]);
  const [loadSelection, setLoadSelection] = useState<{ dimension: RoadmapLoadDimension; key: string } | null>(null);
  const effectiveLoadSelection = useMemo(() => {
    const available = loadSelection?.dimension === 'discipline' ? disciplineKeys : roleKeys;
    if (loadSelection && available.includes(loadSelection.key)) return loadSelection;
    if (roleKeys.length > 0) return { dimension: 'role' as const, key: roleKeys[0] };
    if (disciplineKeys.length > 0) return { dimension: 'discipline' as const, key: disciplineKeys[0] };
    return null;
  }, [loadSelection, roleKeys, disciplineKeys]);

  const phaseHours = useMemo(() => {
    const phaseNames = new Set(phases.map((p) => p.name));
    const phaseEff = effectivePhases(tree, phaseNames);
    const map = new Map<string, number>();
    wbsItems.forEach((item) => {
      const name = phaseEff.get(item.id)?.phaseName;
      if (!name) return;
      const hours = item.estimates.reduce((s, e) => s + e.hours, 0);
      map.set(name, (map.get(name) ?? 0) + hours);
    });
    return map;
  }, [tree, phases, wbsItems]);

  const itemNames = useMemo(() => new Map(allItems.map((i) => [i.id, i.name])), [allItems]);

  function toggleLane(laneId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      saveCollapsedLanes(project.id, next);
      return next;
    });
  }

  function moveLane(laneId: number, direction: -1 | 1) {
    const ordered = [...roadmapLanes].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
    const idx = ordered.findIndex((l) => l.id === laneId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    void onUpdateLane(a.id, { displayOrder: b.displayOrder });
    void onUpdateLane(b.id, { displayOrder: a.displayOrder });
  }

  function moveItem(itemId: number, direction: -1 | 1) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    const siblings = allItems
      .filter((i) => i.laneId === item.laneId)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
    const idx = siblings.findIndex((i) => i.id === itemId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    void onUpdateItem(a.id, { displayOrder: b.displayOrder });
    void onUpdateItem(b.id, { displayOrder: a.displayOrder });
  }

  function handleDeleteLane(laneId: number) {
    const lane = roadmapLanes.find((l) => l.id === laneId);
    if (!lane) return;
    const count = lane.items.length;
    const description =
      count > 0
        ? `Delete "${lane.name}" and its ${count} item${count === 1 ? '' : 's'}? This cannot be undone.`
        : `Delete "${lane.name}"? This cannot be undone.`;
    setConfirmState({
      title: 'Delete lane',
      description,
      confirmLabel: 'Delete lane',
      onConfirm: () => {
        void onDeleteLane(laneId);
        setConfirmState(null);
      },
    });
  }

  function handleDeleteItem(itemId: number) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    setConfirmState({
      title: 'Delete item',
      description: `Delete "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        void onDeleteItem(itemId);
        if (selectedItemId === itemId) setSelectedItemId(null);
        if (editorItemId === itemId) setEditorItemId(null);
        setConfirmState(null);
      },
    });
  }

  function commitDrag(commit: RoadmapDragCommit) {
    const patch: RoadmapItemPatch = { startPeriod: commit.startPeriod, periodCount: commit.periodCount };
    if (commit.laneId !== undefined) patch.laneId = commit.laneId;
    const label = allItems.find((i) => i.id === commit.itemId)?.name ?? 'item';

    onUpdateItem(commit.itemId, patch)
      .then(() => {
        toast(`Moved "${label}"`, {
          description: `W${commit.startPeriod}${commit.periodCount > 0 ? `–${commit.startPeriod + commit.periodCount - 1}` : ''}`,
          action: {
            label: 'Undo',
            onClick: () => {
              void onUpdateItem(commit.itemId, {
                laneId: commit.previous.laneId,
                startPeriod: commit.previous.startPeriod,
                periodCount: commit.previous.periodCount,
              }).catch(() => toast.error('Undo failed'));
            },
          },
        });
      })
      .catch((err) => {
        toast.error(`Failed to move "${label}"`, {
          description: err instanceof Error ? err.message : undefined,
        });
      });
  }

  function handleAddLane() {
    setAddLaneOpen(true);
  }

  function submitAddLane(name: string) {
    void onAddLane(name);
    setAddLaneOpen(false);
  }

  const addItemDefaultLaneId =
    (selectedItemId != null ? allItems.find((i) => i.id === selectedItemId)?.laneId : undefined) ??
    roadmapLanes[0]?.id;

  function handleAddItem() {
    setAddItemOpen(true);
  }

  function submitAddItem(data: { name: string; laneId: number }) {
    onAddItem(data.laneId, { name: data.name, startPeriod: 1, periodCount: 1 })
      .then((created) => {
        setSelectedItemId(created.id);
        setAddItemOpen(false);
      })
      .catch((err) => {
        toast.error('Failed to add item', { description: err instanceof Error ? err.message : undefined });
      });
  }

  function openBootstrapPreview() {
    setBootstrapPreview(bootstrapRoadmap(wbsItems, phases));
  }

  // CAP-13: builds the draft straight from the SAME `roadmapLoad` the stripe,
  // tooltip, load strip and editor already read — then hands it to the
  // existing `GeneratePlanSheet` draft -> preview -> apply flow unmodified.
  function openDraftPlan() {
    const region = regionForLocationSlug(project.defaultLocation);
    const draft = buildDraftFromRoadmapLoad(
      roadmapLoad,
      rateCards,
      region,
      project.defaultMargin ?? APP_DEFAULTS.defaultMargin,
      project.exchangeRate
    );
    setDraftPlan(draft);
  }

  function confirmBootstrap() {
    if (!bootstrapPreview) return;
    const payload: BootstrapRoadmapPayload = {
      lanes: bootstrapPreview.lanes.map((lane) => ({
        name: lane.name,
        items: lane.items.map((item) => ({
          name: item.name,
          startPeriod: item.startPeriod,
          periodCount: item.periodCount,
          wbsItemIds: item.wbsItemIds,
        })),
      })),
    };
    const laneCount = payload.lanes.length;
    const itemCount = payload.lanes.reduce((s, l) => s + l.items.length, 0);
    onBootstrap(payload)
      .then(() => {
        setBootstrapPreview(null);
        toast(`Created ${laneCount} lane${laneCount === 1 ? '' : 's'}, ${itemCount} item${itemCount === 1 ? '' : 's'}`, {
          description: 'Coverage is complete.',
        });
      })
      .catch((err) => {
        toast.error('Failed to create roadmap', { description: err instanceof Error ? err.message : undefined });
      });
  }

  const editorItem = editorItemId != null ? allItems.find((i) => i.id === editorItemId) ?? null : null;

  const startDateLabel = project.startDate
    ? new Date(project.startDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  function handleSetStartDate() {
    setStartDateOpen(true);
  }

  function submitStartDate(next: string | null) {
    void onSetStartDate(next);
    setStartDateOpen(false);
  }

  if (roadmapLanes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-12">
        <div className="mx-auto max-w-md text-center">
          <h3 className="text-lg font-semibold">No roadmap yet.</h3>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={openBootstrapPreview} disabled={wbsItems.length === 0}>
              Create from WBS
            </Button>
            <Button variant="outline" onClick={handleAddLane}>
              Add lane
            </Button>
          </div>
          {wbsItems.length === 0 && (
            <p className="text-muted-foreground mt-2 text-xs">Add WBS items first to create from WBS.</p>
          )}
          <p className="text-muted-foreground mt-4 text-xs">
            A roadmap is a dozen bars, not a task list. Link WBS scope to them and the bars fill with hours.
          </p>
        </div>
        <BootstrapDialog
          open={bootstrapPreview !== null}
          preview={bootstrapPreview}
          onCancel={() => setBootstrapPreview(null)}
          onConfirm={confirmBootstrap}
        />
        <TextPromptDialog
          open={addLaneOpen}
          title="Add lane"
          label="Lane name"
          onCancel={() => setAddLaneOpen(false)}
          onConfirm={submitAddLane}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200" data-testid="roadmap-root">
      <div className="flex items-center justify-between border-b px-3" style={{ height: 44 }}>
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-semibold">Project Roadmap</span>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            Drag bar to move · drag edge to resize · drag to another lane · Space to edit
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-3" style={{ height: 44 }}>
        <Button variant="outline" size="sm" onClick={handleSetStartDate}>
          {startDateLabel ? `Start ${startDateLabel}` : 'Set start date'}
        </Button>
        <span className="text-muted-foreground text-xs">{planningMode}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyZoom(zoomStep(zoomIndex, -1))}
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyZoom(zoomStep(zoomIndex, 1))} aria-label="Zoom in">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => applyZoom(fitZoom(np, viewportRef.current?.clientWidth ?? 800))}
        >
          Fit
        </Button>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Select
          value={effectiveLoadSelection ? `${effectiveLoadSelection.dimension}:${effectiveLoadSelection.key}` : undefined}
          onValueChange={(v) => {
            const sep = v.indexOf(':');
            const dimension = v.slice(0, sep) as RoadmapLoadDimension;
            const key = v.slice(sep + 1);
            setLoadSelection({ dimension, key });
          }}
          disabled={roleKeys.length === 0 && disciplineKeys.length === 0}
        >
          <SelectTrigger size="sm" className="w-[220px]" aria-label="Load strip role or discipline">
            <SelectValue placeholder="No demand yet">
              {effectiveLoadSelection ? `Load ${effectiveLoadSelection.key || '(none)'}` : 'No demand yet'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {roleKeys.length > 0 && (
              <SelectGroup>
                <SelectLabel>By role</SelectLabel>
                {roleKeys.map((r) => (
                  <SelectItem key={`role:${r}`} value={`role:${r}`}>
                    {r || '(none)'}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {disciplineKeys.length > 0 && (
              <SelectGroup>
                <SelectLabel>By discipline</SelectLabel>
                {disciplineKeys.map((d) => (
                  <SelectItem key={`discipline:${d}`} value={`discipline:${d}`}>
                    {d}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={openDraftPlan} disabled={totalDemandHours(roadmapLoad) <= 0}>
          Draft plan from roadmap
        </Button>
        <Button variant="outline" size="sm" onClick={handleAddLane}>
          Add lane
        </Button>
        <Button variant="outline" size="sm" onClick={handleAddItem} disabled={roadmapLanes.length === 0}>
          Add item
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex">
            <RoadmapGrid
              rows={rows}
              selectedItemId={selectedItemId}
              onSelectItem={(id) => setSelectedItemId(id)}
              onToggleLane={toggleLane}
              onRequestRenameLane={(id) => setRenameLaneId(id)}
              onDeleteLane={handleDeleteLane}
              onMoveLane={moveLane}
              onEditItem={(id) => setEditorItemId(id)}
              onDeleteItem={handleDeleteItem}
              onMoveItem={moveItem}
            />
            <RoadmapTimeline
              rows={rows}
              phases={phases}
              phaseHours={phaseHours}
              effortByItemId={effortByItemId}
              roadmapLoad={roadmapLoad}
              hrsPerPeriod={hrsPerPeriod}
              periodWidth={periodWidth}
              np={np}
              planningMode={planningMode}
              startDate={project.startDate ?? null}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onOpenEditor={(id) => setEditorItemId(id)}
              onCommit={commitDrag}
              onScroll={(scrollLeft) => {
                if (loadStripScrollRef.current) loadStripScrollRef.current.scrollLeft = scrollLeft;
              }}
              viewportRef={viewportRef}
            />
          </div>
          <RoadmapLoadStrip
            roadmapLoad={roadmapLoad}
            items={loadItems}
            dimension={effectiveLoadSelection?.dimension ?? 'role'}
            dimensionKey={effectiveLoadSelection?.key ?? null}
            np={np}
            periodWidth={periodWidth}
            scrollRef={loadStripScrollRef}
          />
        </div>
        {editorItem && (
          <RoadmapEditorPanel
            item={editorItem}
            lanes={roadmapLanes}
            wbsItems={wbsItems}
            allLinks={links}
            itemNames={itemNames}
            np={np}
            planningMode={planningMode}
            roadmapLoad={roadmapLoad}
            roadmapItems={loadItems}
            hrsPerPeriod={hrsPerPeriod}
            onUpdate={onUpdateItem}
            onReplaceLinks={onReplaceItemLinks}
            onClose={() => setEditorItemId(null)}
          />
        )}
      </div>

      <BootstrapDialog
        open={bootstrapPreview !== null}
        preview={bootstrapPreview}
        onCancel={() => setBootstrapPreview(null)}
        onConfirm={confirmBootstrap}
      />
      <GeneratePlanSheet
        open={draftPlan !== null}
        onOpenChange={(open) => {
          if (!open) setDraftPlan(null);
        }}
        projectId={project.id}
        phases={phases}
        planningMode={planningMode}
        onAcceptPlan={onGenerateDraftPlan}
        initialDraft={draftPlan ?? undefined}
      />
      <TextPromptDialog
        open={addLaneOpen}
        title="Add lane"
        label="Lane name"
        onCancel={() => setAddLaneOpen(false)}
        onConfirm={submitAddLane}
      />
      <TextPromptDialog
        open={renameLaneId !== null}
        title="Rename lane"
        label="Lane name"
        initialValue={roadmapLanes.find((l) => l.id === renameLaneId)?.name ?? ''}
        onCancel={() => setRenameLaneId(null)}
        onConfirm={(name) => {
          if (renameLaneId !== null) void onUpdateLane(renameLaneId, { name });
          setRenameLaneId(null);
        }}
      />
      <AddItemDialog
        open={addItemOpen}
        lanes={roadmapLanes}
        defaultLaneId={addItemDefaultLaneId}
        onCancel={() => setAddItemOpen(false)}
        onConfirm={submitAddItem}
      />
      <StartDateDialog
        open={startDateOpen}
        value={project.startDate ?? null}
        onCancel={() => setStartDateOpen(false)}
        onConfirm={submitStartDate}
      />
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </div>
  );
}
