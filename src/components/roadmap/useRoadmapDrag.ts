/**
 * Pointer-drag state machine for the roadmap timeline: move, resize-start,
 * resize-end, cross-lane drop. Pointer Events with `setPointerCapture` (not
 * HTML5 drag-and-drop — see `timeline-component.md`'s "Pointer model"). Every
 * result is computed by `snapDrag`, the SAME function the keyboard path in
 * `RoadmapTimeline.tsx` calls, so there is one rule and one place to fix it.
 *
 * Snapping happens only on release: the bar follows the pointer pixel for
 * pixel while dragging (via `ghost`, computed on every move) and the
 * committed result is whatever `snapDrag` returns at pointer-up.
 */
import { useCallback, useRef, useState } from 'react';
import { RoadmapRow } from '../../utils/roadmap';
import { snapDrag, rowAt, SnapDragMode, ROW_HEIGHT } from '../../utils/roadmapGeometry';

/** A drag moving/resizing an item must exceed this before it "counts" — a smaller move is a click-to-select. */
const DRAG_THRESHOLD_PX = 3;

export interface DragGhost {
  itemId: number;
  startPeriod: number;
  periodCount: number;
  laneId: number;
}

export interface RoadmapDragCommit {
  itemId: number;
  laneId?: number;
  startPeriod: number;
  periodCount: number;
  previous: { laneId: number; startPeriod: number; periodCount: number };
}

interface DragState {
  itemId: number;
  mode: SnapDragMode;
  originLaneId: number;
  originStart: number;
  originCount: number;
  startClientX: number;
  startClientY: number;
  active: boolean;
  /** rows[i] -> the lane id that row belongs to (a lane row's own id, or an item row's laneId). */
  rowLaneIds: number[];
  /** Viewport Y of the rows area's top edge at drag start (getBoundingClientRect().top already nets out page scroll). */
  containerTop: number;
}

interface UseRoadmapDragArgs {
  periodWidth: number;
  np: number;
  onCommit: (commit: RoadmapDragCommit) => void;
  onSelect: (itemId: number) => void;
}

export function useRoadmapDrag({ periodWidth, np, onCommit, onSelect }: UseRoadmapDragArgs) {
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGhost(null);
  }, []);

  const onPointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      row: RoadmapRow,
      mode: SnapDragMode,
      rowLaneIds: number[],
      containerTop: number
    ) => {
      if (e.button !== 0) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        itemId: row.id,
        mode,
        originLaneId: row.laneId ?? 0,
        originStart: row.startPeriod,
        originCount: row.periodCount,
        startClientX: e.clientX,
        startClientY: e.clientY,
        active: false,
        rowLaneIds,
        containerTop,
      };
      onSelect(row.id);
    },
    [onSelect]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.active && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      drag.active = true;

      const result = snapDrag(
        drag.mode,
        { startPeriod: drag.originStart, periodCount: drag.originCount },
        dx,
        periodWidth,
        np
      );

      let laneId = drag.originLaneId;
      if (drag.mode === 'move' && drag.rowLaneIds.length > 0) {
        const yInGrid = e.clientY - drag.containerTop;
        const rowIndex = rowAt(yInGrid, ROW_HEIGHT);
        const rowLaneId = drag.rowLaneIds[rowIndex];
        if (rowLaneId !== undefined) laneId = rowLaneId;
      }

      setGhost({ itemId: drag.itemId, startPeriod: result.startPeriod, periodCount: result.periodCount, laneId });
    },
    [periodWidth, np]
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
      const dx = e.clientX - drag.startClientX;
      const result = snapDrag(
        drag.mode,
        { startPeriod: drag.originStart, periodCount: drag.originCount },
        dx,
        periodWidth,
        np
      );
      let laneId = drag.originLaneId;
      if (drag.mode === 'move' && drag.rowLaneIds.length > 0) {
        const yInGrid = e.clientY - drag.containerTop;
        const rowIndex = rowAt(yInGrid, ROW_HEIGHT);
        const rowLaneId = drag.rowLaneIds[rowIndex];
        if (rowLaneId !== undefined) laneId = rowLaneId;
      }
      endDrag();

      const changed =
        laneId !== drag.originLaneId || result.startPeriod !== drag.originStart || result.periodCount !== drag.originCount;
      if (!changed) return;

      onCommit({
        itemId: drag.itemId,
        laneId: laneId !== drag.originLaneId ? laneId : undefined,
        startPeriod: result.startPeriod,
        periodCount: result.periodCount,
        previous: { laneId: drag.originLaneId, startPeriod: drag.originStart, periodCount: drag.originCount },
      });
    },
    [endDrag, onCommit, periodWidth, np]
  );

  const onPointerCancel = useCallback(() => {
    endDrag();
  }, [endDrag]);

  return { ghost, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
