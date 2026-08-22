/**
 * The period timeline: phase-band header over period columns, rows, bars and
 * milestones. Both the pointer path (`useRoadmapDrag`) and the keyboard path
 * (this file's `onKeyDown`) route through `snapDrag` and call the SAME
 * `onCommit` prop — one rule, one commit path, per `timeline-component.md`.
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
  rowAt,
  snapDrag,
  stripeSegments,
  laneBarRect,
  laneSummaryPath,
  laneMilestoneXs,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  BAR_HEIGHT,
  MILESTONE_SIZE,
  MILESTONE_HIT,
  LANE_BAR_HEIGHT,
  LANE_CAP_DROP,
  LANE_MILESTONE_SIZE,
} from '../../utils/roadmapGeometry';
import { RoadmapDragCommit, useRoadmapDrag } from './useRoadmapDrag';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../ui/utils';

const ACCENT = '#8f4f8f';
const AMBER = '#d97706';
/** The lane summary bar's colour, one place for both themes — a neutral slate that is
 * deliberately not `ACCENT`, so a lane bar is never misread as something schedulable. */
const LANE_BAR_CLASS = 'text-[#33627D] dark:text-[#7FA8C0]';
const STRIPE_EPSILON = 1e-6;

interface RoadmapTimelineProps {
  rows: RoadmapRow[];
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
  onScroll: (scrollLeft: number) => void;
  viewportRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Governs the whole lane summary layer — bar, caps, ticks, stripe, label and chip. Off is an early return, not hidden DOM. */
  showLaneBars: boolean;
  onToggleLane: (laneId: number) => void;
}


export function RoadmapTimeline({
  rows,
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
  onScroll,
  viewportRef,
  showLaneBars,
  onToggleLane,
}: RoadmapTimelineProps) {
  const rowsWrapRef = useRef<HTMLDivElement | null>(null);

  // rows[i] -> the lane id that row belongs to. Same index space `rowAt` resolves
  // against during a drag, so the lane under the pointer is found with one lookup.
  const rowLaneIds = useMemo(
    () => rows.map((r) => (r.kind === 'lane' ? r.id : (r.laneId as number))),
    [rows]
  );
  const laneOrder = useMemo(() => rows.filter((r) => r.kind === 'lane').map((r) => r.id), [rows]);

  const { ghost, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useRoadmapDrag({
    periodWidth,
    np,
    onCommit,
    onSelect: onSelectItem,
  });

  // The summary never lags its children: while a drag ghost is live, the
  // affected lane(s)' span is recomputed from the ghosted window in the same
  // pass rows are consumed — one scan, not a per-row check. Off costs
  // nothing: skipped entirely when the layer is off.
  const displayRows = useMemo(
    () => (showLaneBars ? recomputeLaneSpans(rows, ghost) : rows),
    [rows, ghost, showLaneBars]
  );

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

  function laneIdForRowIndex(rowIndex: number, dy: number): number | null {
    // ⌃↑ / ⌃↓ lane change: find the ordered list of lane ids and step by one.
    const currentRow = rows[rowIndex];
    if (currentRow === undefined || currentRow.laneId === null) return null;
    const idx = laneOrder.indexOf(currentRow.laneId);
    if (idx < 0) return null;
    const nextIdx = idx + dy;
    if (nextIdx < 0 || nextIdx >= laneOrder.length) return null;
    return laneOrder[nextIdx];
  }

  function handleBarKeyDown(e: React.KeyboardEvent<HTMLDivElement>, row: RoadmapRow, rowIndex: number) {
    if (row.kind === 'lane') return;
    // A spread item has no meaningful window — it is not draggable, resizable
    // or re-lanable by keyboard either, only selectable/openable (decision 2).
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
    const previous = { laneId: row.laneId ?? 0, startPeriod: row.startPeriod, periodCount: row.periodCount };

    const commitMove = (mode: 'move' | 'resizeStart' | 'resizeEnd', dir: 1 | -1) => {
      const result = snapDrag(mode, origin, dir * periodWidth, periodWidth, np);
      if (result.startPeriod === origin.startPeriod && result.periodCount === origin.periodCount) return;
      onCommit({ itemId: row.id, startPeriod: result.startPeriod, periodCount: result.periodCount, previous });
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
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const targetLaneId = laneIdForRowIndex(rowIndex, e.key === 'ArrowDown' ? 1 : -1);
        if (targetLaneId === null) return;
        onCommit({
          itemId: row.id,
          laneId: targetLaneId,
          startPeriod: row.startPeriod,
          periodCount: row.periodCount,
          previous,
        });
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
          <div ref={rowsWrapRef}>
            {displayRows.map((row, rowIndex) => {
              if (row.kind === 'lane') {
                if (!showLaneBars) {
                  return (
                    <div
                      key={`lane-${row.id}`}
                      className="border-b bg-[#f6f6f6] dark:bg-[#1f1f1f]"
                      style={{ height: ROW_HEIGHT, boxSizing: 'border-box' }}
                      data-testid={`roadmap-row-lane-${row.id}`}
                    />
                  );
                }

                const hasBar = row.periodCount > 0;
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
                    className="relative border-b bg-[#f6f6f6] dark:bg-[#1f1f1f]"
                    style={{ height: ROW_HEIGHT, boxSizing: 'border-box' }}
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
                    {rect && (
                      <span
                        data-testid={`roadmap-lane-label-${row.id}`}
                        className="pointer-events-none absolute select-none overflow-hidden whitespace-nowrap text-[11px] text-ellipsis text-muted-foreground"
                        style={{
                          left: rect.left + rect.width + 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          maxWidth: Math.max(0, timelineWidth - (rect.left + rect.width + 6)),
                        }}
                      >
                        {row.hours.toLocaleString(undefined, { maximumFractionDigits: 0 })} h · {row.fte.toFixed(1)} FTE
                      </span>
                    )}
                    {row.spreadItemCount > 0 && (
                      <span
                        data-testid={`roadmap-lane-spread-chip-${row.id}`}
                        title={`Spread across the whole project: ${row.spreadItemNames.join(', ')}`}
                        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[11px] text-muted-foreground"
                      >
                        {'»'} {row.spreadItemCount} spread
                      </span>
                    )}
                  </div>
                );
              }

              const isGhosted = ghost !== null && ghost.itemId === row.id;
              const effectiveWindow = isGhosted
                ? { startPeriod: ghost!.startPeriod, periodCount: ghost!.periodCount }
                : { startPeriod: row.startPeriod, periodCount: row.periodCount };
              const isSelected = row.id === selectedItemId;
              const effort = effortByItemId.get(row.id);
              const roleLines = effort ? Array.from(effort.entries()) : [];
              // CAP-9: the warning stripe over exactly the over-demand periods,
              // clipped to the bar's own (possibly ghosted) rect. Never drawn on
              // a milestone (no window) or while dragging isn't relevant either.
              const stripeRects =
                row.kind !== 'milestone' && !isGhosted && row.overDemandPeriods.length > 0
                  ? stripeSegments(effectiveWindow, row.overDemandPeriods, periodWidth)
                  : [];

              return (
                <div
                  key={`item-${row.id}`}
                  className="relative border-b"
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
                          'absolute select-none outline-none',
                          row.kind === 'spread' ? 'cursor-pointer' : 'cursor-grab',
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
                                  ...(row.emptyScope
                                    ? { border: `1.5px dashed ${ACCENT}`, background: 'rgba(143,79,143,0.08)' }
                                    : {
                                        background: 'rgba(143,79,143,0.22)',
                                        backgroundImage: `repeating-linear-gradient(135deg, ${ACCENT} 0px, ${ACCENT} 3px, transparent 3px, transparent 7px)`,
                                        border: `1px solid ${ACCENT}`,
                                      }),
                                  ...(isSelected ? { boxShadow: `0 0 0 2px #030213` } : {}),
                                }
                              : {
                                  left: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).left,
                                  width: barRect(effectiveWindow.startPeriod, effectiveWindow.periodCount, periodWidth).width,
                                  top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                  height: BAR_HEIGHT,
                                  borderRadius: 4,
                                  ...(row.emptyScope
                                    ? { border: `1.5px dashed ${ACCENT}`, background: 'rgba(143,79,143,0.08)' }
                                    : { background: ACCENT }),
                                  ...(isSelected ? { boxShadow: `0 0 0 2px #030213` } : {}),
                                }
                        }
                        onPointerDown={(e) => {
                          // A spread item has no draggable window (decision 2) — selection
                          // only, via the plain onClick below.
                          if (row.kind === 'spread') return;
                          const containerTop = rowsWrapRef.current?.getBoundingClientRect().top ?? 0;
                          if (row.kind === 'milestone') {
                            onPointerDown(e, row, 'move', rowLaneIds, containerTop);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const grabZone = 8;
                          const mode =
                            e.clientX - rect.left <= grabZone
                              ? 'resizeStart'
                              : rect.right - e.clientX <= grabZone
                                ? 'resizeEnd'
                                : 'move';
                          onPointerDown(e, row, mode, rowLaneIds, containerTop);
                        }}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        onClick={() => onSelectItem(row.id)}
                        onDoubleClick={() => onOpenEditor(row.id)}
                        onKeyDown={(e) => handleBarKeyDown(e, row, rowIndex)}
                      >
                        {(row.kind === 'bar' || row.kind === 'spread') && (
                          <span
                            className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium text-white"
                            style={row.emptyScope ? { color: ACCENT } : undefined}
                          >
                            {row.emptyScope ? 'no scope linked' : `${row.hours.toLocaleString(undefined, { maximumFractionDigits: 0 })} h · ${row.fte.toFixed(1)} FTE`}
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** For the pointer path's cross-lane hit test — resolves the row index -> lane id. */
export function laneIdAtRowIndex(rows: RoadmapRow[], rowIndex: number): number | null {
  const row = rows[rowIndex];
  if (row === undefined) return null;
  return row.kind === 'lane' ? row.id : row.laneId;
}

export function periodColumnLeft(period: number, periodWidth: number): number {
  return periodX(period, periodWidth);
}
