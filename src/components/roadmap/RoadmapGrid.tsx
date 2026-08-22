/**
 * The roadmap's left grid: `Lane / Item` (200px), `Hours` (64px), `FTE` (56px),
 * one row per `RoadmapRow` at the same 34px `ROW_HEIGHT` the timeline uses, so
 * the two stay aligned without a shared layout engine (`border-box` sizing on
 * both, per `timeline-component.md`'s column-grid contract). Rows are the
 * OTHER surface the shared drag state machine starts from (`useRoadmapDrag`,
 * lifted into `Roadmap.tsx`) — a grip handle drags an item or a lane; dx is
 * always discarded here (vertical placement only), per
 * `spec-roadmap-vertical-drag.md`.
 */
import React, { useMemo, useRef } from 'react';
import { GripVertical, MoreVertical } from 'lucide-react';
import { RoadmapRow } from '../../utils/roadmap';
import { formatHours } from '../../utils/wbsGrid';
import { ROW_HEIGHT, HEADER_HEIGHT, RowDescriptor, snapDrag } from '../../utils/roadmapGeometry';
import {
  DragGhost,
  ItemDragStartArgs,
  LaneDragStartArgs,
  RoadmapDragCommit,
  keyboardVerticalCommit,
  dropIndicatorFor,
} from './useRoadmapDrag';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

const ACCENT = '#8f4f8f';

interface RoadmapGridProps {
  rows: RoadmapRow[];
  rowDescriptors: RowDescriptor[];
  selectedItemId: number | null;
  onSelectItem: (id: number) => void;
  onToggleLane: (laneId: number) => void;
  onRequestRenameLane: (laneId: number) => void;
  onDeleteLane: (laneId: number) => void;
  onMoveLane: (laneId: number, direction: -1 | 1) => void;
  onEditItem: (itemId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onMoveItem: (itemId: number, direction: -1 | 1) => void;
  onCommit: (commit: RoadmapDragCommit) => void;
  periodWidth: number;
  np: number;
  ghost: DragGhost | null;
  onDragPointerDown: (e: React.PointerEvent<HTMLElement>, args: ItemDragStartArgs | LaneDragStartArgs) => void;
  onDragPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onDragPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onDragPointerCancel: () => void;
  consumeWasDragging: () => boolean;
}

export function RoadmapGrid({
  rows,
  rowDescriptors,
  selectedItemId,
  onSelectItem,
  onToggleLane,
  onRequestRenameLane,
  onDeleteLane,
  onMoveLane,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  onCommit,
  periodWidth,
  np,
  ghost,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
  consumeWasDragging,
}: RoadmapGridProps) {
  const rowsWrapRef = useRef<HTMLDivElement | null>(null);
  const laneOrder = useMemo(() => rows.filter((r) => r.kind === 'lane').map((r) => r.id), [rows]);
  const indicator = useMemo(() => dropIndicatorFor(ghost, rowDescriptors, rows.length), [ghost, rowDescriptors, rows.length]);
  const targetLaneId = ghost?.entity === 'item' ? ghost.laneId : null;

  // Same key bindings as the timeline's bars (`RoadmapTimeline.handleBarKeyDown`) —
  // rows are focusable so a keyboard-only user isn't limited to the row menu.
  function handleRowKeyDown(e: React.KeyboardEvent<HTMLDivElement>, row: RoadmapRow) {
    if (row.kind === 'lane') {
      // Lane reorder itself is menu/pointer only (see Suggested Review Order), but
      // a focused lane row must still answer the collapse toggle its onClick gives it.
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onToggleLane(row.id);
      }
      return;
    }
    const previous = { laneId: row.laneId ?? 0, startPeriod: row.startPeriod, periodCount: row.periodCount };

    if ((e.altKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const commit = keyboardVerticalCommit(
        e.key === 'ArrowDown' ? 1 : -1,
        e.altKey ? 'alt' : 'ctrl',
        { id: row.id, laneId: row.laneId as number, startPeriod: row.startPeriod, periodCount: row.periodCount },
        rowDescriptors,
        laneOrder
      );
      if (commit) onCommit(commit);
      return;
    }

    if (row.kind === 'spread') {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onEditItem(row.id);
      }
      return;
    }

    const origin = { startPeriod: row.startPeriod, periodCount: row.periodCount };
    const commitMove = (mode: 'move' | 'resizeStart' | 'resizeEnd', dir: 1 | -1) => {
      const result = snapDrag(mode, origin, dir * periodWidth, periodWidth, np);
      if (result.startPeriod === origin.startPeriod && result.periodCount === origin.periodCount) return;
      onCommit({ entity: 'item', itemId: row.id, startPeriod: result.startPeriod, periodCount: result.periodCount, previous });
    };

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) commitMove('resizeEnd', dir);
        else if (e.altKey) commitMove('resizeStart', dir);
        else commitMove('move', dir);
        return;
      }
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        onEditItem(row.id);
        return;
      default:
        return;
    }
  }

  return (
    <div className="w-[320px] flex-none border-r" data-testid="roadmap-grid">
      <div
        className="flex items-center border-b bg-muted/40 text-xs font-medium text-muted-foreground"
        style={{ height: HEADER_HEIGHT, boxSizing: 'border-box' }}
      >
        <div className="w-[200px] px-2">Lane / Item</div>
        <div className="w-[64px] px-2 text-right">Hours</div>
        <div className="w-[56px] px-2 text-right">FTE</div>
      </div>
      <div ref={rowsWrapRef} className="relative">
        {rows.map((row) => {
          const isLane = row.kind === 'lane';
          const isSelected = !isLane && row.id === selectedItemId;
          const isDragSource = ghost !== null && ghost.entity === (isLane ? 'lane' : 'item') && ghost.id === row.id;
          const isHighlighted = isLane && indicator?.kind === 'highlight' && indicator.laneId === row.id;
          const isTargetLane = isLane ? ghost?.entity === 'item' && ghost.laneId === row.id : targetLaneId === row.laneId;
          return (
            <div
              key={`${row.kind}-${row.id}`}
              data-testid={isLane ? `roadmap-grid-lane-${row.id}` : `roadmap-grid-item-${row.id}`}
              className={cn(
                'group flex items-center border-b text-sm outline-none',
                isLane && 'bg-[#f6f6f6] font-semibold dark:bg-[#1f1f1f]',
                isSelected && 'bg-accent/40',
                isTargetLane && !isHighlighted && 'bg-accent/10',
                isDragSource && 'opacity-40'
              )}
              style={{
                height: ROW_HEIGHT,
                boxSizing: 'border-box',
                ...(isHighlighted ? { boxShadow: `inset 0 0 0 2px ${ACCENT}` } : {}),
              }}
              tabIndex={0}
              onKeyDown={(e) => handleRowKeyDown(e, row)}
              onClick={() => {
                if (consumeWasDragging()) return;
                if (isLane) onToggleLane(row.id);
                else onSelectItem(row.id);
              }}
            >
              <span
                className="ml-1 flex h-3.5 w-3.5 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100"
                aria-label={isLane ? `Drag ${row.name} lane to reorder` : `Drag ${row.name} to reorder`}
                onPointerDown={(e) => {
                  const containerEl = rowsWrapRef.current;
                  if (isLane) {
                    onDragPointerDown(e, { entity: 'lane', laneId: row.id, containerEl });
                  } else {
                    onDragPointerDown(e, {
                      entity: 'item',
                      source: 'grid',
                      itemId: row.id,
                      mode: 'move',
                      laneId: row.laneId as number,
                      startPeriod: row.startPeriod,
                      periodCount: row.periodCount,
                      allowWindow: false, // drag from the grid never changes startPeriod/periodCount
                      containerEl,
                    });
                  }
                }}
                onPointerMove={onDragPointerMove}
                onPointerUp={onDragPointerUp}
                onPointerCancel={onDragPointerCancel}
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="flex w-[200px] items-center gap-1 truncate px-2">
                {isLane && (
                  <span className="text-muted-foreground text-xs">{row.collapsed ? '▸' : '▾'}</span>
                )}
                <span className="truncate">{row.name}</span>
              </div>
              <div className="w-[64px] px-2 text-right tabular-nums">{formatHours(row.hours)}</div>
              <div className="w-[56px] px-2 text-right tabular-nums">{row.fte.toFixed(1)}</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1 h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label={isLane ? `${row.name} lane menu` : `${row.name} item menu`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {isLane ? (
                    <>
                      <DropdownMenuItem onClick={() => onRequestRenameLane(row.id)}>Rename</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveLane(row.id, -1)}>Move up</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveLane(row.id, 1)}>Move down</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onDeleteLane(row.id)}>
                        Delete lane
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onEditItem(row.id)}>Edit (Space)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveItem(row.id, -1)}>Move up</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveItem(row.id, 1)}>Move down</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onDeleteItem(row.id)}>
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        {/* Vertical-drag insert line — same shared indicator RoadmapTimeline renders. */}
        {indicator?.kind === 'line' && (
          <div
            className="pointer-events-none absolute left-0 right-0"
            data-testid="roadmap-grid-drop-indicator"
            style={{ top: indicator.y - 1, height: 2, background: ACCENT }}
          />
        )}
      </div>
    </div>
  );
}
