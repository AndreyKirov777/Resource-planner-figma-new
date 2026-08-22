/**
 * ONE drag state machine for the roadmap, lifted into `Roadmap.tsx` and
 * shared by both panes: horizontal move/resize of a bar's window (timeline
 * only — grip handles in the grid never touch it), and vertical placement —
 * reorder within a lane, move across lanes, reorder lanes
 * (`entity: 'item' | 'lane'`, `source: 'timeline' | 'grid'`). Pointer Events
 * with `setPointerCapture` (not HTML5 drag-and-drop — see
 * `timeline-component.md`'s "Pointer model"). Horizontal snapping runs
 * through `snapDrag`; vertical placement runs through `dropTargetAt` /
 * `laneDropIndexAt` — the SAME pure functions the keyboard path in
 * `RoadmapTimeline.tsx`/`RoadmapGrid.tsx` calls, so there is one rule and
 * one place to fix it.
 *
 * Snapping happens only on release: the bar follows the pointer pixel for
 * pixel in BOTH axes while dragging (`ghost.dxPx`/`dyPx` drive the floating
 * layer), and the committed result — window AND vertical placement — is
 * whatever `snapDrag`/`dropTargetAt` return at pointer-up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  snapDrag,
  dropTargetAt,
  laneDropIndexAt,
  reorderWithin,
  indicatorY,
  SnapDragMode,
  ROW_HEIGHT,
  RowDescriptor,
} from '../../utils/roadmapGeometry';

/** A drag moving/resizing/reordering must exceed this before it "counts" — a smaller move is a click. */
const DRAG_THRESHOLD_PX = 3;
/** Edge auto-scroll: pointer within this many px of the viewport's top/bottom edge scrolls the page. */
const AUTO_SCROLL_EDGE_PX = 24;
const AUTO_SCROLL_STEP_PX = 8;

export type DragSource = 'timeline' | 'grid';
export type DragEntity = 'item' | 'lane';

export interface DragGhost {
  entity: DragEntity;
  id: number;
  source: DragSource;
  /** Raw pointer delta since gesture start, both axes — drives the pixel-follow layer. */
  dxPx: number;
  dyPx: number;
  /** Snapped landing window (entity 'item' only; 0 for a lane) — drives the dashed ghost rect. */
  startPeriod: number;
  periodCount: number;
  /** Resolved vertical target, shared by both panes' insert-line / lane-highlight rendering. */
  laneId: number;
  dropIndex: number;
}

export interface RoadmapItemDragCommit {
  entity: 'item';
  itemId: number;
  /** Present only when the vertical placement (lane and/or index) actually changed. */
  laneId?: number;
  order?: number;
  startPeriod: number;
  periodCount: number;
  previous: { laneId: number; startPeriod: number; periodCount: number };
}

export interface RoadmapLaneDragCommit {
  entity: 'lane';
  laneId: number;
  order: number;
}

export type RoadmapDragCommit = RoadmapItemDragCommit | RoadmapLaneDragCommit;

export interface ItemDragStartArgs {
  entity: 'item';
  source: DragSource;
  itemId: number;
  mode: SnapDragMode;
  laneId: number;
  startPeriod: number;
  periodCount: number;
  /** False for a grid-sourced drag and for a spread item: dx is discarded, `snapDrag` is never called. */
  allowWindow: boolean;
  /** The rows-wrapper element to measure `getBoundingClientRect().top` from, read fresh on every move. */
  containerEl: HTMLElement | null;
}

export interface LaneDragStartArgs {
  entity: 'lane';
  laneId: number;
  containerEl: HTMLElement | null;
}

interface ItemDragState {
  entity: 'item';
  source: DragSource;
  itemId: number;
  mode: SnapDragMode;
  originLaneId: number;
  originStart: number;
  originCount: number;
  /** This item's index among its own lane's OTHER items — `dropTargetAt`'s self-drop answer. */
  originIndex: number;
  allowWindow: boolean;
  startClientX: number;
  startClientY: number;
  active: boolean;
  containerEl: HTMLElement | null;
}

interface LaneDragState {
  entity: 'lane';
  laneId: number;
  originIndex: number;
  startClientX: number;
  startClientY: number;
  active: boolean;
  containerEl: HTMLElement | null;
}

type DragState = ItemDragState | LaneDragState;

interface UseRoadmapDragArgs {
  periodWidth: number;
  np: number;
  /** The shared `RowDescriptor[]` built once in `Roadmap.tsx` — both panes' geometry source. */
  rows: RowDescriptor[];
  onCommit: (commit: RoadmapDragCommit) => void;
  onSelect: (itemId: number) => void;
}

function laneItemOriginIndex(rows: readonly RowDescriptor[], laneId: number, itemId: number): number {
  const ids = rows.filter((r) => r.kind === 'item' && r.laneId === laneId).map((r) => r.id);
  const idx = ids.indexOf(itemId);
  return idx < 0 ? ids.length : idx;
}

function laneOriginIndex(rows: readonly RowDescriptor[], laneId: number): number {
  const laneIds = rows.filter((r) => r.kind === 'lane').map((r) => r.id);
  return laneIds.indexOf(laneId);
}

/**
 * Builds the commit for `⌥↑`/`⌥↓` (reorder within a lane) or `⌃↑`/`⌃↓` (cross-lane
 * move, explicit tail index of the target lane) — shared by `RoadmapTimeline`'s
 * and `RoadmapGrid`'s keyboard handlers, on grid rows as well as bars, so there
 * is one rule and one place to fix it. Returns `null` when there's nowhere to go
 * (already first/last sibling, or already first/last lane).
 */
export function keyboardVerticalCommit(
  direction: 1 | -1,
  modifier: 'alt' | 'ctrl',
  row: { id: number; laneId: number; startPeriod: number; periodCount: number },
  rows: readonly RowDescriptor[],
  laneOrder: readonly number[]
): RoadmapItemDragCommit | null {
  const previous = { laneId: row.laneId, startPeriod: row.startPeriod, periodCount: row.periodCount };

  if (modifier === 'alt') {
    const siblingIds = rows.filter((r) => r.kind === 'item' && r.laneId === row.laneId).map((r) => r.id);
    const idx = siblingIds.indexOf(row.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblingIds.length) return null;
    const index = reorderWithin(siblingIds, idx, targetIdx).indexOf(row.id);
    return {
      entity: 'item',
      itemId: row.id,
      laneId: row.laneId,
      order: index,
      startPeriod: row.startPeriod,
      periodCount: row.periodCount,
      previous,
    };
  }

  const laneIdx = laneOrder.indexOf(row.laneId);
  if (laneIdx < 0) return null;
  const nextLaneIdx = laneIdx + direction;
  if (nextLaneIdx < 0 || nextLaneIdx >= laneOrder.length) return null;
  const nextLaneId = laneOrder[nextLaneIdx];
  const destCount = rows.filter((r) => r.kind === 'item' && r.laneId === nextLaneId).length;
  return {
    entity: 'item',
    itemId: row.id,
    laneId: nextLaneId,
    order: destCount,
    startPeriod: row.startPeriod,
    periodCount: row.periodCount,
    previous,
  };
}

export function useRoadmapDrag({ periodWidth, np, rows, onCommit, onSelect }: UseRoadmapDragArgs) {
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGhost(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, args: ItemDragStartArgs | LaneDragStartArgs) => {
      if (e.button !== 0) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (args.entity === 'item') {
        dragRef.current = {
          entity: 'item',
          source: args.source,
          itemId: args.itemId,
          mode: args.mode,
          originLaneId: args.laneId,
          originStart: args.startPeriod,
          originCount: args.periodCount,
          originIndex: laneItemOriginIndex(rowsRef.current, args.laneId, args.itemId),
          allowWindow: args.allowWindow,
          startClientX: e.clientX,
          startClientY: e.clientY,
          active: false,
          containerEl: args.containerEl,
        };
        onSelect(args.itemId);
      } else {
        dragRef.current = {
          entity: 'lane',
          laneId: args.laneId,
          originIndex: laneOriginIndex(rowsRef.current, args.laneId),
          startClientX: e.clientX,
          startClientY: e.clientY,
          active: false,
          containerEl: args.containerEl,
        };
      }
    },
    [onSelect]
  );

  const resolveGhost = useCallback(
    (e: { clientX: number; clientY: number }): DragGhost | null => {
      const drag = dragRef.current;
      if (drag === null) return null;
      // No container to hit-test against yet (ref not attached) — bail rather
      // than defaulting to a top of 0, which would hit-test against the wrong
      // origin and resolve a wrong drop target.
      if (drag.containerEl === null) return null;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      // Read live rather than a value captured once at pointer-down, so a scroll
      // mid-gesture never skews the row lookup.
      const containerTop = drag.containerEl.getBoundingClientRect().top;
      const yInRows = e.clientY - containerTop;

      if (drag.entity === 'lane') {
        return {
          entity: 'lane',
          id: drag.laneId,
          source: 'grid',
          dxPx: dx,
          dyPx: dy,
          startPeriod: 0,
          periodCount: 0,
          laneId: drag.laneId,
          dropIndex: laneDropIndexAt(yInRows, rowsRef.current, ROW_HEIGHT),
        };
      }

      const windowResult = drag.allowWindow
        ? snapDrag(drag.mode, { startPeriod: drag.originStart, periodCount: drag.originCount }, dx, periodWidth, np)
        : { startPeriod: drag.originStart, periodCount: drag.originCount };

      // Vertical placement resolves only for a 'move' gesture — a resize-edge
      // grab is horizontal-only, it has no vertical-reorder meaning.
      const target = drag.mode === 'move' ? dropTargetAt(yInRows, rowsRef.current, ROW_HEIGHT, drag.itemId) : null;

      return {
        entity: 'item',
        id: drag.itemId,
        source: drag.source,
        dxPx: dx,
        dyPx: dy,
        startPeriod: windowResult.startPeriod,
        periodCount: windowResult.periodCount,
        laneId: target?.laneId ?? drag.originLaneId,
        dropIndex: target?.index ?? drag.originIndex,
      };
    },
    [periodWidth, np]
  );

  // No dedicated Y-scroll container owns the roadmap's rows (the timeline's own
  // `.overflow-x-auto` viewport scrolls X only) — Y scrolling is the page's, so
  // auto-scroll drives `window.scrollBy` directly.
  const runAutoScroll = useCallback(() => {
    const drag = dragRef.current;
    const pointer = lastPointerRef.current;
    if (!drag?.active || !pointer) {
      autoScrollRafRef.current = null;
      return;
    }
    const scrollingUp = pointer.y < AUTO_SCROLL_EDGE_PX;
    const scrollingDown = pointer.y > window.innerHeight - AUTO_SCROLL_EDGE_PX;
    if (scrollingUp) window.scrollBy(0, -AUTO_SCROLL_STEP_PX);
    else if (scrollingDown) window.scrollBy(0, AUTO_SCROLL_STEP_PX);
    // The row under a STATIONARY cursor changes as the page scrolls beneath it —
    // re-resolve so the ghost/insert-line stays in sync, same as `onPointerMove`
    // does for an actually-moving pointer. Only while a scroll step just ran, to
    // avoid re-rendering every frame of a drag that isn't near an edge.
    if (scrollingUp || scrollingDown) setGhost(resolveGhost({ clientX: pointer.x, clientY: pointer.y }));
    autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
  }, [resolveGhost]);

  const ensureAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current === null) autoScrollRafRef.current = requestAnimationFrame(runAutoScroll);
  }, [runAutoScroll]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.active && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      drag.active = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      ensureAutoScroll();
      setGhost(resolveGhost(e));
    },
    [resolveGhost, ensureAutoScroll]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag === null) return;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (!drag.active) {
        endDrag();
        return;
      }
      justDraggedRef.current = true;
      // A drop outside any row (e.g. below the last row — an explicit target per
      // the placement matrix) never fires a row's onClick, so `consumeWasDragging`
      // never runs there. This fallback still clears the flag before it can
      // swallow a LATER, unrelated click; 0ms still runs after the click event
      // the SAME gesture's pointerup produces, since that's dispatched
      // synchronously ahead of any queued timeout.
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
      const result = resolveGhost(e);
      endDrag();
      if (result === null) return;

      if (drag.entity === 'lane') {
        if (result.dropIndex === drag.originIndex) return; // dropped back where it started
        onCommit({ entity: 'lane', laneId: drag.laneId, order: result.dropIndex });
        return;
      }

      const verticalChanged = result.laneId !== drag.originLaneId || result.dropIndex !== drag.originIndex;
      const windowChanged = result.startPeriod !== drag.originStart || result.periodCount !== drag.originCount;
      if (!verticalChanged && !windowChanged) return; // drop on own position -> no request at all

      onCommit({
        entity: 'item',
        itemId: drag.itemId,
        laneId: verticalChanged ? result.laneId : undefined,
        order: verticalChanged ? result.dropIndex : undefined,
        startPeriod: result.startPeriod,
        periodCount: result.periodCount,
        previous: { laneId: drag.originLaneId, startPeriod: drag.originStart, periodCount: drag.originCount },
      });
    },
    [endDrag, onCommit, resolveGhost]
  );

  const onPointerCancel = useCallback(() => {
    endDrag();
  }, [endDrag]);

  /** Consumed once by a row's onClick to swallow the synthetic click a real drag's pointerup leaves behind. */
  const consumeWasDragging = useCallback(() => {
    const was = justDraggedRef.current;
    justDraggedRef.current = false;
    return was;
  }, []);

  return { ghost, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, consumeWasDragging };
}

export type DropIndicator = { kind: 'line'; y: number } | { kind: 'highlight'; laneId: number };

/**
 * The shared vertical-drag indicator both panes render identically: an insert
 * line at the resolved slot, or a lane-row highlight instead when the target
 * lane is collapsed/empty (per `dropTargetAt`'s contract, "its lane row is
 * highlighted instead of an insert line").
 */
export function dropIndicatorFor(
  ghost: DragGhost | null,
  rows: readonly RowDescriptor[],
  rowsLength: number
): DropIndicator | null {
  if (!ghost) return null;
  if (ghost.entity === 'lane') {
    const laneRowIndices: number[] = [];
    rows.forEach((r, i) => {
      if (r.kind === 'lane') laneRowIndices.push(i);
    });
    const y = ghost.dropIndex < laneRowIndices.length ? laneRowIndices[ghost.dropIndex] * ROW_HEIGHT : rowsLength * ROW_HEIGHT;
    return { kind: 'line', y };
  }
  const laneDesc = rows.find((r) => r.kind === 'lane' && r.id === ghost.laneId);
  const hasItems = rows.some((r) => r.kind === 'item' && r.laneId === ghost.laneId);
  if ((laneDesc?.collapsed ?? false) || !hasItems) {
    return { kind: 'highlight', laneId: ghost.laneId };
  }
  return { kind: 'line', y: indicatorY({ laneId: ghost.laneId, index: ghost.dropIndex }, rows, ROW_HEIGHT) };
}
