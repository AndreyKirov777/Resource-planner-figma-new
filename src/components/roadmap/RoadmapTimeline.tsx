/**
 * The period timeline: phase-band header over period columns, rows, bars and
 * milestones. Both the pointer path (`useRoadmapDrag`, lifted into
 * `Roadmap.tsx` and shared with `RoadmapGrid`) and the keyboard path (this
 * file's `onKeyDown`) route through `snapDrag` / `dropTargetAt` and call the
 * SAME `onCommit` prop — one rule, one commit path, per
 * `timeline-component.md` and `spec-roadmap-vertical-drag.md`.
 */
import React, { useMemo, useRef } from 'react';
import { Phase } from '../../services/api';
import { RoadmapRow, periodToDate, recomputeLaneSpans } from '../../utils/roadmap';
import { RoadmapLoad, avgSupplyFteOverWindow } from '../../utils/roadmapLoad';
import {
  periodX,
  barRect,
  milestoneX,
  phaseBands,
  snapDrag,
  stripeSegments,
  laneBarRect,
  laneSummaryPath,
  laneMilestoneXs,
  indicatorY,
  RowDescriptor,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  BAR_HEIGHT,
  MILESTONE_SIZE,
  MILESTONE_HIT,
  LANE_BAR_HEIGHT,
  LANE_CAP_DROP,
  LANE_MILESTONE_SIZE,
  BAR_RESIZE_HIT_PX,
  barDragMode,
  resizeFollowRect,
} from '../../utils/roadmapGeometry';
import { DragGhost, ItemDragStartArgs, LaneDragStartArgs, RoadmapDragCommit, keyboardVerticalCommit, dropIndicatorFor } from './useRoadmapDrag';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../ui/utils';

const ACCENT = '#8f4f8f';
/** Lighter accent so a spread reads as the same family as a bar, not the same object. */
const SPREAD_FILL = '#c084c0';
const AMBER = '#d97706';
/** The lane summary bar's colour, one place for both themes — a neutral slate that is
 * deliberately not `ACCENT`, so a lane bar is never misread as something schedulable. */
const LANE_BAR_CLASS = 'text-[#33627D] dark:text-[#7FA8C0]';
const STRIPE_EPSILON = 1e-6;

interface RoadmapTimelineProps {
  rows: RoadmapRow[];
  rowDescriptors: RowDescriptor[];
  phases: Phase[];
  phaseHours: Map<string, number>;
  effortByItemId: Map<number, Map<string, number>>;
  roadmapLoad: RoadmapLoad;
  hrsPerPeriod: number;
  periodWidth: number;
  np: number;
  planningMode: 'weekly' | 'monthly';
  startDate: string | null;
  selectedItemId: number | null;
  onSelectItem: (id: number | null) => void;
  onOpenEditor: (id: number) => void;
  onCommit: (commit: RoadmapDragCommit) => void;
  ghost: DragGhost | null;
  onDragPointerDown: (e: React.PointerEvent<HTMLElement>, args: ItemDragStartArgs | LaneDragStartArgs) => void;
  onDragPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onDragPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onDragPointerCancel: () => void;
  consumeWasDragging: () => boolean;
  onScroll: (scrollLeft: number) => void;
  viewportRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Governs the whole lane summary layer — bar, caps, ticks, stripe and chip. Off is an early return, not hidden DOM. */
  showLaneBars: boolean;
  /** When on (default), empty-scope bars/spreads use the dashed outline. Off: filled paint. */
  showUnlinkedOutline: boolean;
  onToggleLane: (laneId: number) => void;
}

export function RoadmapTimeline({
  rows,
  rowDescriptors,
  phases,
  phaseHours,
  effortByItemId,
  roadmapLoad,
  hrsPerPeriod,
  periodWidth,
  np,
  planningMode,
  startDate,
  selectedItemId,
  onSelectItem,
  onOpenEditor,
  onCommit,
  ghost,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
  consumeWasDragging,
  onScroll,
  viewportRef,
  showLaneBars,
  showUnlinkedOutline,
  onToggleLane,
}: RoadmapTimelineProps) {
  const rowsWrapRef = useRef<HTMLDivElement | null>(null);

  const laneOrder = useMemo(() => rows.filter((r) => r.kind === 'lane').map((r) => r.id), [rows]);

  // The summary never lags its children: while a drag ghost is live, the
  // affected lane(s)' span is recomputed from the ghosted window in the same
  // pass rows are consumed — one scan, not a per-row check. Off costs
  // nothing: skipped entirely when the layer is off. A lane drag has no
  // window to preview, so it is ignored here.
  const displayRows = useMemo(() => {
    if (!showLaneBars) return rows;
    const spanGhost =
      ghost && ghost.entity === 'item'
        ? { itemId: ghost.id, laneId: ghost.laneId, startPeriod: ghost.startPeriod, periodCount: ghost.periodCount }
        : null;
    return recomputeLaneSpans(rows, spanGhost);
  }, [rows, ghost, showLaneBars]);

  const bands = useMemo(
    () =>
      phaseBands(
        phases.map((p) => ({
          name: p.name,
          periodCount: p.periodCount ?? p.weekCount ?? 0,
          color: p.color ?? '#e5e7eb',
          hours: phaseHours.get(p.name) ?? 0,
        })),
        periodWidth
      ),
    [phases, phaseHours, periodWidth]
  );

  const timelineWidth = np * periodWidth;

  // Shared vertical-drag indicator: an insert line at the resolved slot, or a
  // lane-row highlight instead when the target lane is collapsed/empty (per
  // `dropTargetAt`'s contract) — rendered identically in RoadmapGrid.
  const indicator = useMemo(() => dropIndicatorFor(ghost, rowDescriptors, rows.length), [ghost, rowDescriptors, rows.length]);

  const targetLaneId = ghost?.entity === 'item' ? ghost.laneId : null;

  function handleBarKeyDown(e: React.KeyboardEvent<HTMLDivElement>, row: RoadmapRow) {
    if (row.kind === 'lane') return;
    const previous = { laneId: row.laneId ?? 0, startPeriod: row.startPeriod, periodCount: row.periodCount };

    // Vertical reorder / cross-lane move applies to every kind alike (bars,
    // milestones AND spread items reorder vertically like bars) -- checked
    // before the spread-specific early return below. Same helper RoadmapGrid's
    // rows call, so there is one rule and one place to fix it.
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

    // A spread item has no meaningful window — it is not draggable/resizable by
    // keyboard, only selectable/openable and vertically reorderable (above).
    if (row.kind === 'spread') {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onOpenEditor(row.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelectItem(null);
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
        onOpenEditor(row.id);
        return;
      case 'Escape':
        e.preventDefault();
        onSelectItem(null);
        return;
      default:
        return;
    }
  }

  // Floating / stretch layer for an in-progress TIMELINE item drag:
  // - move: bar follows the pointer in both axes; dashed rect = snapped landing
  // - resize: bar stretches in place from the fixed edge; dashed rect = snapped window
  // Snapping is applied only on release (`timeline-component.md`'s "Pointer model").
  const floatingDrag = useMemo(() => {
    if (!ghost || ghost.entity !== 'item' || ghost.source !== 'timeline') return null;
    const rowIndex = rows.findIndex((r) => r.kind !== 'lane' && r.id === ghost.id);
    const originRow = rowIndex >= 0 ? rows[rowIndex] : undefined;
    if (!originRow) return null;
    const isMilestone = originRow.kind === 'milestone';
    const originTop = rowIndex * ROW_HEIGHT;
    const snappedTop = indicatorY({ laneId: ghost.laneId, index: ghost.dropIndex }, rowDescriptors, ROW_HEIGHT);
    const resizeMode = ghost.mode === 'resizeStart' || ghost.mode === 'resizeEnd' ? ghost.mode : null;

    if (isMilestone) {
      const originLeft = milestoneX(originRow.startPeriod, periodWidth) - MILESTONE_HIT / 2;
      const snappedLeft = milestoneX(ghost.startPeriod, periodWidth) - MILESTONE_HIT / 2;
      return {
        kind: 'move' as const,
        follow: {
          left: originLeft + ghost.dxPx,
          top: originTop + (ROW_HEIGHT - MILESTONE_HIT) / 2 + ghost.dyPx,
          width: MILESTONE_HIT,
          height: MILESTONE_HIT,
          milestone: true,
        },
        snapped: {
          left: snappedLeft,
          top: snappedTop + (ROW_HEIGHT - MILESTONE_HIT) / 2,
          width: MILESTONE_HIT,
          height: MILESTONE_HIT,
          milestone: true,
        },
      };
    }

    const originRect = barRect(originRow.startPeriod, originRow.periodCount, periodWidth);
    const snappedRect = barRect(ghost.startPeriod, ghost.periodCount, periodWidth);
    const barTop = originTop + (ROW_HEIGHT - BAR_HEIGHT) / 2;

    if (resizeMode !== null) {
      const followRect = resizeFollowRect(resizeMode, originRect, ghost.dxPx);
      return {
        kind: 'resize' as const,
        follow: {
          left: followRect.left,
          top: barTop,
          width: followRect.width,
          height: BAR_HEIGHT,
          milestone: false,
        },
        snapped: {
          left: snappedRect.left,
          top: barTop,
          width: snappedRect.width,
          height: BAR_HEIGHT,
          milestone: false,
        },
      };
    }

    return {
      kind: 'move' as const,
      follow: {
        left: originRect.left + ghost.dxPx,
        top: barTop + ghost.dyPx,
        width: originRect.width,
        height: BAR_HEIGHT,
        milestone: false,
      },
      snapped: {
        left: snappedRect.left,
        top: snappedTop + (ROW_HEIGHT - BAR_HEIGHT) / 2,
        width: snappedRect.width,
        height: BAR_HEIGHT,
        milestone: false,
      },
    };
  }, [ghost, rows, rowDescriptors, periodWidth]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        ref={viewportRef}
        className="min-w-0 flex-1 overflow-x-auto"
        data-testid="roadmap-scroll"
        onScroll={(e) => onScroll(e.currentTarget.scrollLeft)}
      >
        <div style={{ width: timelineWidth, position: 'relative' }}>
          {/* Header: phase bands (22px) over period columns (21px), total 44px including border. */}
          <div style={{ height: HEADER_HEIGHT, boxSizing: 'border-box' }} className="border-b">
            <div className="relative" style={{ height: 22 }} data-testid="roadmap-phase-bands">
              {bands.map((band) => (
                <div
                  key={band.name}
                  className="absolute top-0 flex items-center overflow-hidden px-1 text-[11px] font-medium text-foreground/80"
                  style={{ left: band.left, width: band.width, height: 22, background: band.color }}
                  title={`${band.name} · ${band.hours} h`}
                >
                  <span className="truncate">{band.name}</span>
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ height: 21 }} data-testid="roadmap-period-columns">
              {Array.from({ length: np }, (_, i) => i + 1).map((period) => {
                const date = periodToDate(period, planningMode, startDate);
                return (
                  <div
                    key={period}
                    className="flex-none border-r text-center text-[10px] leading-[21px] text-muted-foreground"
                    style={{ width: periodWidth }}
                    data-testid={`roadmap-period-col-${period}`}
                  >
                    {planningMode === 'weekly' ? `W${period}` : `M${period}`}
                    {date ? ` · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase tint layer behind the rows — one element per period, not per cell. */}
          <div
            className="pointer-events-none absolute left-0 right-0"
            style={{ top: HEADER_HEIGHT, bottom: 0 }}
            aria-hidden
          >
            {bands.map((band) => (
              <div
                key={band.name}
                className="absolute top-0 bottom-0 opacity-[0.08] dark:opacity-[0.14]"
                style={{ left: band.left, width: band.width, background: band.color }}
              />
            ))}
          </div>

          {/* Rows */}
          <div ref={rowsWrapRef} className="relative">
            {displayRows.map((row) => {
              if (row.kind === 'lane') {
                const isHighlighted = indicator?.kind === 'highlight' && indicator.laneId === row.id;
                const isTargetLane = targetLaneId === row.id;
                const hasBar = showLaneBars && row.periodCount > 0;
                const rect = hasBar ? laneBarRect(row.startPeriod, row.periodCount, periodWidth) : null;
                const svgHeight = LANE_BAR_HEIGHT + LANE_CAP_DROP;
                const svgTop = (ROW_HEIGHT - svgHeight) / 2;
                const milestoneXs =
                  rect && row.collapsed ? laneMilestoneXs(row.milestonePeriods, periodWidth) : [];
                const laneStripeRects =
                  rect && row.collapsed && row.overDemandPeriods.length > 0
                    ? stripeSegments({ startPeriod: row.startPeriod, periodCount: row.periodCount }, row.overDemandPeriods, periodWidth)
                    : [];
                const laneWindowLabel = (() => {
                  const base = `W${row.startPeriod}${row.periodCount > 1 ? `–${row.startPeriod + row.periodCount - 1}` : ''}`;
                  const from = periodToDate(row.startPeriod, planningMode, startDate);
                  if (!from) return base;
                  const to = periodToDate(row.startPeriod + row.periodCount - 1, planningMode, startDate);
                  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return `${base} · ${fmt(from)}${to && row.periodCount > 1 ? ` – ${fmt(to)}` : ''}`;
                })();

                return (
                  <div
                    key={`lane-${row.id}`}
                    className={cn(
                      'relative border-b bg-[#f6f6f6] dark:bg-[#1f1f1f]',
                      isHighlighted && 'ring-2 ring-inset',
                      isTargetLane && !isHighlighted && 'bg-accent/20'
                    )}
                    style={{
                      height: ROW_HEIGHT,
                      boxSizing: 'border-box',
                      ...(isHighlighted ? { boxShadow: `inset 0 0 0 2px ${ACCENT}` } : {}),
                    }}
                    data-testid={`roadmap-row-lane-${row.id}`}
                  >
                    {rect && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={row.name}
                            data-testid={`roadmap-lane-bar-${row.id}`}
                            className={cn(
                              'absolute cursor-pointer select-none outline-none',
                              LANE_BAR_CLASS
                            )}
                            style={{ left: rect.left, top: svgTop, width: rect.width, height: svgHeight }}
                            onClick={() => onToggleLane(row.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                e.preventDefault();
                                onToggleLane(row.id);
                              }
                            }}
                          >
                            <svg width={rect.width} height={svgHeight} style={{ display: 'block', overflow: 'visible' }}>
                              <path d={laneSummaryPath(rect)} fill="currentColor" />
                              {row.collapsed &&
                                milestoneXs.map((x, i) => (
                                  <rect
                                    key={i}
                                    data-testid={`roadmap-lane-milestone-${row.id}`}
                                    x={x - rect.left - LANE_MILESTONE_SIZE / 2}
                                    y={LANE_BAR_HEIGHT / 2 - LANE_MILESTONE_SIZE / 2}
                                    width={LANE_MILESTONE_SIZE}
                                    height={LANE_MILESTONE_SIZE}
                                    fill="currentColor"
                                    transform={`rotate(45 ${x - rect.left} ${LANE_BAR_HEIGHT / 2})`}
                                  />
                                ))}
                            </svg>
                            {row.collapsed &&
                              laneStripeRects.map((r2, i) => (
                                <div
                                  key={i}
                                  className="pointer-events-none absolute rounded-b"
                                  data-testid={`roadmap-lane-stripe-${row.id}`}
                                  style={{
                                    left: r2.left - rect.left,
                                    width: r2.width,
                                    top: svgHeight,
                                    height: 3,
                                    background: AMBER,
                                  }}
                                />
                              ))}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-medium">{row.name}</div>
                          <div>{laneWindowLabel}</div>
                          <div>
                            {row.hours.toLocaleString(undefined, { maximumFractionDigits: 0 })} h ·{' '}
                            {row.fte.toFixed(1)} FTE
                          </div>
                          <div>
                            {row.itemCount} item{row.itemCount === 1 ? '' : 's'}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              }

              const isDragSource = ghost !== null && ghost.entity === 'item' && ghost.id === row.id;
              const effectiveWindow = { startPeriod: row.startPeriod, periodCount: row.periodCount };
              const msX = row.kind === 'milestone' ? milestoneX(effectiveWindow.startPeriod, periodWidth) : 0;
              const milestoneLabelLeft = msX + (MILESTONE_SIZE * Math.SQRT2) / 2 + 6;
              const isSelected = row.id === selectedItemId;
              const effort = effortByItemId.get(row.id);
              const roleLines = effort ? Array.from(effort.entries()) : [];
              const isTargetLane = targetLaneId === row.laneId;
              // CAP-9: the warning stripe over exactly the over-demand periods.
              const stripeRects =
                row.kind !== 'milestone' && row.overDemandPeriods.length > 0
                  ? stripeSegments(effectiveWindow, row.overDemandPeriods, periodWidth)
                  : [];

              return (
                <div
                  key={`item-${row.id}`}
                  className={cn('relative border-b', isTargetLane && 'bg-accent/10')}
                  style={{ height: ROW_HEIGHT, boxSizing: 'border-box' }}
                  data-testid={`roadmap-row-item-${row.id}`}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={row.name}
                        aria-selected={isSelected}
                        data-testid={`roadmap-bar-${row.id}`}
                        className={cn(
                          'absolute select-none outline-none cursor-grab',
                          isDragSource && 'opacity-40',
                          row.kind === 'bar' && isSelected && 'ring-2 ring-offset-1'
                        )}
                        style={
                          row.kind === 'milestone'
                            ? {
                                left: milestoneX(effectiveWindow.startPeriod, periodWidth) - MILESTONE_HIT / 2,
                                top: (ROW_HEIGHT - MILESTONE_HIT) / 2,
                                width: MILESTONE_HIT,
                                height: MILESTONE_HIT,
                              }
                            : row.kind === 'spread'
                              ? {
                                  left: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).left,
                                  width: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).width,
                                  top: (ROW_HEIGHT - 10) / 2,
                                  height: 10,
                                  borderRadius: 2,
                                  ...(row.emptyScope && showUnlinkedOutline
                                    ? { border: `1.5px dashed ${ACCENT}`, background: 'rgba(143,79,143,0.08)' }
                                    : { background: SPREAD_FILL }),
                                  ...(isSelected ? { boxShadow: `0 0 0 2px #030213` } : {}),
                                }
                              : {
                                  left: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).left,
                                  width: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).width,
                                  top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                  height: BAR_HEIGHT,
                                  borderRadius: 4,
                                  ...(row.emptyScope && showUnlinkedOutline
                                    ? { border: `1.5px dashed ${ACCENT}`, background: 'rgba(143,79,143,0.08)' }
                                    : { background: ACCENT }),
                                  ...(isSelected ? { boxShadow: `0 0 0 2px #030213` } : {}),
                                }
                        }
                        onPointerDown={(e) => {
                          const containerEl = rowsWrapRef.current;
                          if (row.kind === 'spread') {
                            // Spread items never touch the window (dx discarded, `snapDrag` never
                            // called) — vertical reorder only, same as a grid-sourced drag.
                            onDragPointerDown(e, {
                              entity: 'item',
                              source: 'timeline',
                              itemId: row.id,
                              mode: 'move',
                              laneId: row.laneId as number,
                              startPeriod: row.startPeriod,
                              periodCount: row.periodCount,
                              allowWindow: false,
                              containerEl,
                            });
                            return;
                          }
                          if (row.kind === 'milestone') {
                            onDragPointerDown(e, {
                              entity: 'item',
                              source: 'timeline',
                              itemId: row.id,
                              mode: 'move',
                              laneId: row.laneId as number,
                              startPeriod: row.startPeriod,
                              periodCount: row.periodCount,
                              allowWindow: true,
                              containerEl,
                            });
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const mode = barDragMode(e.clientX - rect.left, rect.width);
                          onDragPointerDown(e, {
                            entity: 'item',
                            source: 'timeline',
                            itemId: row.id,
                            mode,
                            laneId: row.laneId as number,
                            startPeriod: row.startPeriod,
                            periodCount: row.periodCount,
                            allowWindow: true,
                            containerEl,
                          });
                        }}
                        onPointerMove={onDragPointerMove}
                        onPointerUp={onDragPointerUp}
                        onPointerCancel={onDragPointerCancel}
                        onClick={() => {
                          if (consumeWasDragging()) return;
                          onSelectItem(row.id);
                        }}
                        onDoubleClick={() => onOpenEditor(row.id)}
                        onKeyDown={(e) => handleBarKeyDown(e, row)}
                      >
                        {row.kind === 'bar' && (
                          <>
                            <span
                              data-testid={`roadmap-bar-${row.id}-resize-start`}
                              className="absolute inset-y-0 left-0 cursor-ew-resize"
                              style={{ width: BAR_RESIZE_HIT_PX, zIndex: 2 }}
                            />
                            <span
                              data-testid={`roadmap-bar-${row.id}-resize-end`}
                              className="absolute inset-y-0 right-0 cursor-ew-resize"
                              style={{ width: BAR_RESIZE_HIT_PX, zIndex: 1 }}
                            />
                          </>
                        )}
                        {(row.kind === 'bar' || row.kind === 'spread') && (
                          <span
                            className="pointer-events-none absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-white"
                            style={row.emptyScope && showUnlinkedOutline ? { color: ACCENT } : undefined}
                          >
                            {row.name}
                          </span>
                        )}
                        {row.kind === 'milestone' && (
                          <span
                            className="pointer-events-none absolute left-1/2 top-1/2"
                            style={{
                              width: MILESTONE_SIZE,
                              height: MILESTONE_SIZE,
                              marginLeft: -MILESTONE_SIZE / 2,
                              marginTop: -MILESTONE_SIZE / 2,
                              borderRadius: 1.5,
                              background: ACCENT,
                              transform: 'rotate(45deg)',
                              ...(isSelected ? { boxShadow: `0 0 0 2px #030213` } : {}),
                            }}
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">{row.name}</div>
                      <div>
                        {row.kind === 'spread'
                          ? 'Spread across the whole project'
                          : `W${row.startPeriod}${row.periodCount > 0 ? `–${row.startPeriod + row.periodCount - 1}` : ''}`}
                      </div>
                      {(row.kind === 'bar' || row.kind === 'spread') && (
                        <>
                          <div>
                            {row.hours.toLocaleString(undefined, { maximumFractionDigits: 0 })} h · {row.fte.toFixed(1)} FTE
                          </div>
                          {roleLines.map(([role, hours]) => {
                            const roleFte =
                              effectiveWindow.periodCount > 0 && hrsPerPeriod > 0
                                ? hours / (effectiveWindow.periodCount * hrsPerPeriod)
                                : 0;
                            const planFte = avgSupplyFteOverWindow(roadmapLoad, role, effectiveWindow, hrsPerPeriod);
                            const short = planFte < roleFte - STRIPE_EPSILON;
                            return (
                              <div key={role}>
                                {role || '(none)'} {hours.toLocaleString(undefined, { maximumFractionDigits: 0 })} h ·{' '}
                                {roleFte.toFixed(1)} FTE · plan{' '}
                                <span style={short ? { color: AMBER, fontWeight: 600 } : undefined}>
                                  {planFte.toFixed(1)} FTE
                                </span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  {row.kind === 'milestone' && (
                    <span
                      data-testid={`roadmap-milestone-label-${row.id}`}
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute select-none whitespace-nowrap text-[11px] font-medium text-foreground/80',
                        isDragSource && 'opacity-40'
                      )}
                      style={{
                        left: milestoneLabelLeft,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    >
                      {row.name}
                    </span>
                  )}
                  {stripeRects.map((rect, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute rounded-b"
                      data-testid={`roadmap-stripe-${row.id}`}
                      style={{
                        left: rect.left,
                        width: rect.width,
                        top: (ROW_HEIGHT + BAR_HEIGHT) / 2 - 3,
                        height: 3,
                        background: AMBER,
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {/* Vertical-drag insert line — shared indicator, same y both panes render at. */}
            {indicator?.kind === 'line' && (
              <div
                className="pointer-events-none absolute left-0 right-0"
                data-testid="roadmap-drop-indicator"
                style={{ top: indicator.y - 1, height: 2, background: ACCENT }}
              />
            )}

            {/* Live drag preview: move floats a copy; resize stretches in place.
                Dashed rect is the snapped landing window (applied only on release). */}
            {floatingDrag && (
              <>
                <div
                  className="pointer-events-none absolute"
                  data-testid={floatingDrag.kind === 'resize' ? 'roadmap-resize-follow' : 'roadmap-drag-follow'}
                  style={
                    floatingDrag.follow.milestone
                      ? {
                          left: floatingDrag.follow.left,
                          top: floatingDrag.follow.top,
                          width: floatingDrag.follow.width,
                          height: floatingDrag.follow.height,
                          background: ACCENT,
                          transform: 'rotate(45deg)',
                          opacity: 0.85,
                        }
                      : {
                          left: floatingDrag.follow.left,
                          top: floatingDrag.follow.top,
                          width: floatingDrag.follow.width,
                          height: floatingDrag.follow.height,
                          background: ACCENT,
                          borderRadius: 4,
                          opacity: floatingDrag.kind === 'resize' ? 0.55 : 0.85,
                        }
                  }
                />
                <div
                  className="pointer-events-none absolute"
                  data-testid={floatingDrag.kind === 'resize' ? 'roadmap-resize-snapped' : 'roadmap-drag-snapped'}
                  style={{
                    left: floatingDrag.snapped.left,
                    top: floatingDrag.snapped.top,
                    width: floatingDrag.snapped.width,
                    height: floatingDrag.snapped.height,
                    border: `1.5px dashed ${ACCENT}`,
                    borderRadius: floatingDrag.snapped.milestone ? 1.5 : 4,
                    transform: floatingDrag.snapped.milestone ? 'rotate(45deg)' : undefined,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function periodColumnLeft(period: number, periodWidth: number): number {
  return periodX(period, periodWidth);
}
