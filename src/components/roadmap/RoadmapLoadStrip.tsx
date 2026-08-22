/**
 * The per-period demand-vs-supply strip (CAP-9): one cell per period, a
 * demand column against a dashed supply line, `demand / supply` in tabular
 * figures. Over-demand cells amber/emphasised, idle cells muted. Same column
 * grid as the timeline header/rows — same `periodWidth`, one cell per period
 * — so it shares a left edge and width with them for any given period, per
 * `timeline-component.md`'s three-grid alignment contract. Its own scroller
 * is `overflow-x: hidden`; `scrollLeft` is driven imperatively from the
 * chart's scroll event by the parent (`Roadmap.tsx`) via `scrollRef`.
 */
import { RefObject } from 'react';
import {
  RoadmapLoad,
  RoadmapLoadDimension,
  RoadmapLoadItemInput,
  demandHours,
  supplyHours,
  contributorsForPeriod,
} from '../../utils/roadmapLoad';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../ui/utils';

export const LOAD_STRIP_HEIGHT = 64;
const AMBER = '#d97706';
const DEMAND_COLOR = '#8f4f8f';
const EPSILON = 1e-9;

interface RoadmapLoadStripProps {
  roadmapLoad: RoadmapLoad;
  items: readonly RoadmapLoadItemInput[];
  dimension: RoadmapLoadDimension;
  dimensionKey: string | null;
  np: number;
  periodWidth: number;
  /** `scrollLeft` is driven imperatively by the chart's own scroll handler — see the module comment. */
  scrollRef: RefObject<HTMLDivElement>;
}

export function RoadmapLoadStrip({
  roadmapLoad,
  items,
  dimension,
  dimensionKey,
  np,
  periodWidth,
  scrollRef,
}: RoadmapLoadStripProps) {
  const timelineWidth = np * periodWidth;
  const periods = Array.from({ length: np }, (_, i) => i + 1);

  return (
    <div className="flex border-t" style={{ height: LOAD_STRIP_HEIGHT }} data-testid="roadmap-load-strip">
      <div className="flex w-[320px] flex-none items-center truncate px-2 text-xs font-medium text-muted-foreground">
        {dimensionKey ? `Load ${dimensionKey || '(none)'}` : 'Load — no demand yet'}
      </div>
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-hidden" data-testid="roadmap-load-strip-scroll">
        <div className="flex" style={{ width: timelineWidth, height: LOAD_STRIP_HEIGHT }}>
          {periods.map((period) => {
            const demand = dimensionKey ? demandHours(roadmapLoad, dimension, dimensionKey, period) : 0;
            const supply = dimensionKey ? supplyHours(roadmapLoad, dimension, dimensionKey, period) : 0;
            const over = demand > supply + EPSILON;
            const idle = !over && supply > demand + EPSILON;
            const scale = Math.max(demand, supply, 1);
            const demandPct = Math.min(100, (demand / scale) * 100);
            const supplyPct = Math.min(100, (supply / scale) * 100);
            const contributors = dimensionKey
              ? contributorsForPeriod(roadmapLoad, items, dimension, dimensionKey, period)
              : [];

            const cell = (
              <button
                type="button"
                className={cn(
                  'relative flex-none border-r border-b-0 outline-none',
                  over && 'bg-amber-100/60 dark:bg-amber-950/30',
                  idle && 'opacity-50'
                )}
                style={{ width: periodWidth, height: LOAD_STRIP_HEIGHT }}
                data-testid={`roadmap-load-cell-${period}`}
                aria-label={`Period ${period}: ${Math.round(demand)} of ${Math.round(supply)} hours`}
              >
                <div
                  className="absolute inset-x-0 border-t border-dashed border-foreground/50"
                  style={{ bottom: `${16 + supplyPct * 0.6}%` }}
                  aria-hidden
                />
                <div
                  className="absolute inset-x-1 bottom-4 rounded-t-sm"
                  style={{ height: `${demandPct * 0.6}%`, background: over ? AMBER : DEMAND_COLOR, opacity: over ? 1 : 0.55 }}
                  aria-hidden
                />
                <span className="absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-tight tabular-nums text-muted-foreground">
                  {Math.round(demand)}/{Math.round(supply)}
                </span>
              </button>
            );

            if (!dimensionKey) return <div key={period}>{cell}</div>;

            return (
              <Popover key={period}>
                <PopoverTrigger asChild>{cell}</PopoverTrigger>
                <PopoverContent className="w-64 text-xs" side="top">
                  <div className="mb-1 font-medium">
                    Period {period} · {Math.round(demand)} h / {Math.round(supply)} h
                  </div>
                  {contributors.length === 0 ? (
                    <p className="text-muted-foreground">No demand this period.</p>
                  ) : (
                    <ul className="space-y-1">
                      {contributors.map((c) => (
                        <li key={`${c.source}-${c.id}`} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="tabular-nums">{Math.round(c.hours)} h</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </div>
    </div>
  );
}
