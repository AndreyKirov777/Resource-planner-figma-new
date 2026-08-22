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
} from '../../services/api';
import { parsePhases } from '../../utils/phases';
import { hoursPerPeriod } from '../../utils/calculations';
import { buildWbsTree, effectivePhases } from '../../utils/wbsTree';
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
  ZOOM_LADDER,
  DEFAULT_ZOOM_INDEX,
  zoomStep,
  fit as fitZoom,
} from '../../utils/roadmapGeometry';
import { RoadmapGrid } from './RoadmapGrid';
import { RoadmapTimeline } from './RoadmapTimeline';
import { RoadmapEditorPanel } from './RoadmapEditorPanel';
import { BootstrapDialog } from './BootstrapDialog';
import { RoadmapDragCommit } from './useRoadmapDrag';
import { Button } from '../ui/button';

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

export function Roadmap({
  project,
  wbsItems,
  roadmapLanes,
  onAddLane,
  onUpdateLane,
  onDeleteLane,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReplaceItemLinks,
  onBootstrap,
  onSetStartDate,
}: RoadmapProps) {
  const planningMode = (project.planningMode || 'weekly') as 'weekly' | 'monthly';
  const phases = useMemo(() => parsePhases(project.phases, []), [project.phases]);
  const np = useMemo(() => Math.max(1, phases.reduce((s, p) => s + (p.periodCount ?? p.weekCount ?? 0), 0)), [phases]);
  const hrsPerPeriod = useMemo(
    () => hoursPerPeriod(planningMode, project.daysInFTE),
    [planningMode, project.daysInFTE]
  );

  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const periodWidth = ZOOM_LADDER[zoomIndex];
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadCollapsedLanes(project.id));
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [editorItemId, setEditorItemId] = useState<number | null>(null);
  const [bootstrapPreview, setBootstrapPreview] = useState<BootstrapPreview | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const loadStripScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCollapsed(loadCollapsedLanes(project.id));
    setSelectedItemId(null);
    setEditorItemId(null);
  }, [project.id]);

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
  const rows = useMemo(
    () => toRoadmapRows(rowLanes, rowItems, effortByItemId, collapsed, hrsPerPeriod, np),
    [rowLanes, rowItems, effortByItemId, collapsed, hrsPerPeriod, np]
  );

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
    const message =
      count > 0
        ? `Delete "${lane.name}" and its ${count} item${count === 1 ? '' : 's'}?`
        : `Delete "${lane.name}"?`;
    if (!window.confirm(message)) return;
    void onDeleteLane(laneId);
  }

  function handleDeleteItem(itemId: number) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    void onDeleteItem(itemId);
    if (selectedItemId === itemId) setSelectedItemId(null);
    if (editorItemId === itemId) setEditorItemId(null);
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
    const name = window.prompt('Lane name');
    if (name && name.trim()) void onAddLane(name.trim());
  }

  function handleAddItem() {
    const laneId = selectedItemId != null ? allItems.find((i) => i.id === selectedItemId)?.laneId : undefined;
    const targetLaneId = laneId ?? roadmapLanes[0]?.id;
    if (targetLaneId === undefined) {
      window.alert('Add a lane first.');
      return;
    }
    const name = window.prompt('Item name', 'New item');
    if (!name || !name.trim()) return;
    onAddItem(targetLaneId, { name: name.trim(), startPeriod: 1, periodCount: 1 })
      .then((created) => {
        setSelectedItemId(created.id);
      })
      .catch((err) => {
        toast.error('Failed to add item', { description: err instanceof Error ? err.message : undefined });
      });
  }

  function openBootstrapPreview() {
    setBootstrapPreview(bootstrapRoadmap(wbsItems, phases));
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
    const next = window.prompt('Project start date (YYYY-MM-DD)', project.startDate ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    void onSetStartDate(trimmed === '' ? null : trimmed);
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
          onClick={() => setZoomIndex((i) => zoomStep(i, -1))}
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setZoomIndex((i) => zoomStep(i, 1))} aria-label="Zoom in">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoomIndex(fitZoom(np, chartRef.current?.clientWidth ?? 800))}
        >
          Fit
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleAddLane}>
          Add lane
        </Button>
        <Button variant="outline" size="sm" onClick={handleAddItem}>
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

      <div className="flex" ref={chartRef}>
        <RoadmapGrid
          rows={rows}
          selectedItemId={selectedItemId}
          onSelectItem={(id) => setSelectedItemId(id)}
          onToggleLane={toggleLane}
          onRenameLane={(id, name) => void onUpdateLane(id, { name })}
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
        />
        {editorItem && (
          <RoadmapEditorPanel
            item={editorItem}
            lanes={roadmapLanes}
            wbsItems={wbsItems}
            allLinks={links}
            itemNames={itemNames}
            np={np}
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
    </div>
  );
}
