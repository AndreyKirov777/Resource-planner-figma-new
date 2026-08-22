/**
 * The non-modal side panel (CAP-11): edits name, lane, kind, start period,
 * duration and linked scope while the timeline stays visible and reacts.
 * Fields commit on blur, no Save button; a failed write reverts the field
 * and reports why. The read-only demand block (total effort, FTE by role,
 * plan supply, feasible duration) is Slice B — explicitly out of scope here.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { RoadmapItem, RoadmapItemKind, RoadmapLaneWithItems, WbsItem } from '../../services/api';
import { RoadmapLinkRecord } from '../../utils/roadmap';
import { ScopePicker } from './ScopePicker';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

interface RoadmapEditorPanelProps {
  item: RoadmapItem;
  lanes: RoadmapLaneWithItems[];
  wbsItems: WbsItem[];
  allLinks: RoadmapLinkRecord[];
  itemNames: Map<number, string>;
  np: number;
  onUpdate: (id: number, patch: Partial<{ name: string; laneId: number; kind: RoadmapItemKind; startPeriod: number; periodCount: number }>) => Promise<void>;
  onReplaceLinks: (itemId: number, wbsItemIds: number[]) => Promise<void>;
  onClose: () => void;
}

export function RoadmapEditorPanel({
  item,
  lanes,
  wbsItems,
  allLinks,
  itemNames,
  np,
  onUpdate,
  onReplaceLinks,
  onClose,
}: RoadmapEditorPanelProps) {
  const [name, setName] = useState(item.name);
  const [startPeriod, setStartPeriod] = useState(String(item.startPeriod));
  const [periodCount, setPeriodCount] = useState(String(item.periodCount));
  const [kindError, setKindError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setName(item.name);
    setStartPeriod(String(item.startPeriod));
    setPeriodCount(String(item.periodCount));
    setKindError(null);
    setFieldError(null);
  }, [item.id, item.name, item.startPeriod, item.periodCount]);

  async function commit(patch: Partial<{ name: string; laneId: number; kind: RoadmapItemKind; startPeriod: number; periodCount: number }>, revert: () => void) {
    try {
      await onUpdate(item.id, patch);
      setFieldError(null);
    } catch (err) {
      revert();
      setFieldError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === item.name) {
      setName(item.name);
      return;
    }
    void commit({ name: trimmed }, () => setName(item.name));
  }

  function commitStartPeriod() {
    const n = Number.parseInt(startPeriod, 10);
    if (!Number.isFinite(n) || n === item.startPeriod) {
      setStartPeriod(String(item.startPeriod));
      return;
    }
    void commit({ startPeriod: Math.min(Math.max(1, n), np) }, () => setStartPeriod(String(item.startPeriod)));
  }

  function commitPeriodCount() {
    const n = Number.parseInt(periodCount, 10);
    if (!Number.isFinite(n) || n === item.periodCount) {
      setPeriodCount(String(item.periodCount));
      return;
    }
    void commit({ periodCount: Math.max(1, n) }, () => setPeriodCount(String(item.periodCount)));
  }

  function changeLane(laneId: string) {
    const id = Number.parseInt(laneId, 10);
    if (!Number.isFinite(id) || id === item.laneId) return;
    void commit({ laneId: id }, () => {});
  }

  function changeKind(kind: string) {
    if (kind !== 'bar' && kind !== 'milestone' && kind !== 'spread') return;
    if (kind === item.kind) return;
    if (kind === 'milestone' && item.wbsItemIds.length > 0) {
      setKindError('A milestone cannot carry scope — unlink it first.');
      return;
    }
    setKindError(null);
    // A spread item's window is a fixed (startPeriod: 1, periodCount: 0)
    // sentinel — it always demands over the whole project (decision 2), never
    // a draggable window like a bar's.
    const patch: Partial<{ kind: RoadmapItemKind; startPeriod: number; periodCount: number }> =
      kind === 'milestone'
        ? { kind, periodCount: 0 }
        : kind === 'spread'
          ? { kind, startPeriod: 1, periodCount: 0 }
          : { kind, periodCount: Math.max(1, item.kind === 'bar' ? item.periodCount : 1) };
    void commit(patch, () => {});
  }

  return (
    <div className="flex w-[360px] flex-none flex-col gap-4 overflow-y-auto border-l p-4" data-testid="roadmap-editor-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Edit item</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close editor">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="roadmap-item-name">Name</Label>
        <Input
          id="roadmap-item-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Lane</Label>
        <Select value={String(item.laneId)} onValueChange={changeLane}>
          <SelectTrigger aria-label="Lane">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lanes.map((lane) => (
              <SelectItem key={lane.id} value={String(lane.id)}>
                {lane.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Kind</Label>
        <ToggleGroup type="single" value={item.kind} onValueChange={changeKind} aria-label="Kind">
          <ToggleGroupItem value="bar">Bar</ToggleGroupItem>
          <ToggleGroupItem value="milestone">Milestone</ToggleGroupItem>
          <ToggleGroupItem value="spread">Spread</ToggleGroupItem>
        </ToggleGroup>
        {kindError && <p className="text-xs text-red-600">{kindError}</p>}
        {item.kind === 'spread' && (
          <p className="text-muted-foreground text-xs">
            Demands evenly across the whole project — not draggable or resizable.
          </p>
        )}
      </div>

      {item.kind !== 'spread' && (
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-item-start">Start period</Label>
          <Input
            id="roadmap-item-start"
            type="number"
            min={1}
            max={np}
            value={startPeriod}
            onChange={(e) => setStartPeriod(e.target.value)}
            onBlur={commitStartPeriod}
          />
        </div>
      )}

      {item.kind === 'bar' && (
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-item-duration">Duration (periods)</Label>
          <Input
            id="roadmap-item-duration"
            type="number"
            min={1}
            value={periodCount}
            onChange={(e) => setPeriodCount(e.target.value)}
            onBlur={commitPeriodCount}
          />
        </div>
      )}

      {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}

      {item.kind !== 'milestone' && (
        <ScopePicker
          wbsItems={wbsItems}
          currentItemId={item.id}
          links={allLinks}
          itemNames={itemNames}
          onChange={(wbsItemIds) => {
            void onReplaceLinks(item.id, wbsItemIds).catch((err) => {
              setFieldError(err instanceof Error ? err.message : 'Failed to update scope');
            });
          }}
        />
      )}
    </div>
  );
}
