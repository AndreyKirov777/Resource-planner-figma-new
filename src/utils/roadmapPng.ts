/**
 * Roadmap PNG export: pure model builder + canvas download.
 * Chart data only — never toolbar, Load strip, editor, or any UI controls.
 * Geometry comes from `roadmapGeometry` (same numbers the live timeline uses).
 */
import { Phase } from '../services/api';
import { RoadmapRow, periodToDate } from './roadmap';
import { formatHours } from './wbsGrid';
import {
  BAR_HEIGHT,
  HEADER_HEIGHT,
  LANE_BAR_HEIGHT,
  LANE_BAR_RADIUS,
  LANE_CAP_DROP,
  LANE_CAP_WIDTH,
  LANE_MILESTONE_SIZE,
  MILESTONE_SIZE,
  ROW_HEIGHT,
  barRect,
  laneBarRect,
  laneMilestoneXs,
  milestoneX,
  phaseBands,
  stripeSegments,
} from './roadmapGeometry';

const ACCENT = '#8f4f8f';
const AMBER = '#d97706';
const LANE_BAR = '#33627D';
const GRID_W = 320;
const COL_LANE = 200;
const COL_HOURS = 64;
const COL_FTE = 56;
const BORDER = '#e5e7eb';
const MUTED = '#6b7280';
const TEXT = '#111827';
const LANE_BG = '#f6f6f6';
const HEADER_BG = '#f3f4f6';

/** Labels that must never appear as drawn chrome in the export model. */
export const ROADMAP_PNG_FORBIDDEN_CHROME = [
  'Add lane',
  'Add bar',
  'Add milestone',
  'Add spread',
  'Export PNG',
  'Lane bars',
  'Fullscreen',
  'Draft plan',
  'Set start date',
  'Project Roadmap',
  'Load ',
] as const;

export type RoadmapPngScope = 'table-and-timeline' | 'timeline-only';
export type RoadmapPngBackground = 'white' | 'transparent';

export type RoadmapPngPhaseInput = {
  name: string;
  periodCount: number;
  color: string;
  hours: number;
};

export type RoadmapPngInput = {
  projectName: string;
  rows: readonly RoadmapRow[];
  phases: readonly RoadmapPngPhaseInput[];
  periodWidth: number;
  np: number;
  planningMode: 'weekly' | 'monthly';
  startDate: string | null;
  showLaneBars: boolean;
  scope: RoadmapPngScope;
  background: RoadmapPngBackground;
  /** Override for deterministic filename tests */
  now?: Date;
};

export type RoadmapPngExportModel = {
  filename: string;
  scope: RoadmapPngScope;
  background: RoadmapPngBackground;
  periodWidth: number;
  np: number;
  planningMode: 'weekly' | 'monthly';
  startDate: string | null;
  showLaneBars: boolean;
  includeGrid: boolean;
  rows: RoadmapRow[];
  phases: RoadmapPngPhaseInput[];
  /** Flat list of text strings that will be drawn — used by chrome-leak tests. */
  drawnLabels: string[];
};

export function phasesForPng(
  phases: readonly Phase[],
  phaseHours: Map<string, number>
): RoadmapPngPhaseInput[] {
  return phases.map((p) => ({
    name: p.name,
    periodCount: p.periodCount ?? p.weekCount ?? 0,
    color: p.color || '#E3F2FD',
    hours: phaseHours.get(p.name) ?? 0,
  }));
}

function sanitizeProjectName(name: string): string {
  return (name || 'project').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'project';
}

function collectDrawnLabels(
  rows: readonly RoadmapRow[],
  phases: readonly RoadmapPngPhaseInput[],
  includeGrid: boolean,
  planningMode: 'weekly' | 'monthly',
  np: number,
  startDate: string | null
): string[] {
  const labels: string[] = [];
  if (includeGrid) {
    labels.push('Lane / Item', 'Hours', 'FTE');
  }
  for (const band of phases) {
    labels.push(band.name);
  }
  for (let period = 1; period <= np; period++) {
    labels.push(periodColumnLabel(period, planningMode, startDate));
  }
  for (const row of rows) {
    labels.push(row.name);
    if (includeGrid) {
      labels.push(formatHours(row.hours));
      labels.push(row.fte.toFixed(1));
    }
    if ((row.kind === 'bar' || row.kind === 'spread') && row.emptyScope) {
      labels.push('no scope linked');
    }
  }
  return labels;
}

export function buildRoadmapPngModel(
  input: RoadmapPngInput
): { ok: false; error: 'empty' } | { ok: true; model: RoadmapPngExportModel } {
  if (input.rows.length === 0) {
    return { ok: false, error: 'empty' };
  }

  const candidateNow = input.now ?? new Date();
  const now =
    candidateNow instanceof Date && !Number.isNaN(candidateNow.getTime())
      ? candidateNow
      : new Date();
  const datePart = now.toISOString().split('T')[0];
  const safeName = sanitizeProjectName(input.projectName);
  const includeGrid = input.scope === 'table-and-timeline';
  const rows = input.rows.map((r) => ({ ...r }));

  return {
    ok: true,
    model: {
      filename: `roadmap-${safeName}-${datePart}.png`,
      scope: input.scope,
      background: input.background,
      periodWidth: input.periodWidth,
      np: input.np,
      planningMode: input.planningMode,
      startDate: input.startDate,
      showLaneBars: input.showLaneBars,
      includeGrid,
      rows,
      phases: input.phases.map((p) => ({ ...p })),
      drawnLabels: collectDrawnLabels(
        rows,
        input.phases,
        includeGrid,
        input.planningMode,
        input.np,
        input.startDate
      ),
    },
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Lane summary silhouette without Path2D (jsdom has none). Matches `laneSummaryPath` geometry. */
function drawLaneSummaryBar(
  ctx: CanvasRenderingContext2D,
  rect: { left: number; width: number },
  fill: string
) {
  const w = Math.max(0, rect.width);
  const h = LANE_BAR_HEIGHT;
  const drop = LANE_CAP_DROP;
  const cap = w < 2 * LANE_CAP_WIDTH ? w / 2 : LANE_CAP_WIDTH;
  const r = Math.min(LANE_BAR_RADIUS, w / 2, h);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0, h, cap, drop);
  ctx.fillRect(w - cap, h, cap, drop);
}

function makeSpreadPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = 'rgba(143,79,143,0.22)';
  tctx.fillRect(0, 0, 8, 8);
  tctx.strokeStyle = ACCENT;
  tctx.lineWidth = 2;
  tctx.beginPath();
  tctx.moveTo(-2, 8);
  tctx.lineTo(8, -2);
  tctx.moveTo(0, 10);
  tctx.lineTo(10, 0);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat');
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string
) {
  const half = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.fillRect(-half, -half, size, size);
  ctx.restore();
}

function clipText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 12, maxW, 16);
  ctx.clip();
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Same format as `RoadmapTimeline` period columns: `W3 · Sep 15` / `M1 · Sep 1`. */
export function periodColumnLabel(
  period: number,
  planningMode: 'weekly' | 'monthly',
  startDate: string | null
): string {
  const base = planningMode === 'weekly' ? `W${period}` : `M${period}`;
  const date = periodToDate(period, planningMode, startDate);
  if (!date) return base;
  return `${base} · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function downloadRoadmapPng(model: RoadmapPngExportModel): void {
  const SCALE = 2;
  const timelineW = Math.max(1, model.np * model.periodWidth);
  const gridW = model.includeGrid ? GRID_W : 0;
  const chartH = HEADER_HEIGHT + model.rows.length * ROW_HEIGHT;
  const canvasW = gridW + timelineW;
  const canvasH = chartH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.scale(SCALE, SCALE);

  if (model.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const bands = phaseBands(model.phases, model.periodWidth);
  const timelineX = gridW;
  const font = 'system-ui, -apple-system, Arial, sans-serif';

  // ── Left grid ────────────────────────────────────────────────────────────
  if (model.includeGrid) {
    ctx.fillStyle = HEADER_BG;
    ctx.fillRect(0, 0, GRID_W, HEADER_HEIGHT);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT - 0.5);
    ctx.lineTo(GRID_W, HEADER_HEIGHT - 0.5);
    ctx.stroke();

    ctx.fillStyle = MUTED;
    ctx.font = `600 11px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillText('Lane / Item', 8, 26);
    ctx.textAlign = 'right';
    ctx.fillText('Hours', COL_LANE + COL_HOURS - 8, 26);
    ctx.fillText('FTE', COL_LANE + COL_HOURS + COL_FTE - 8, 26);
    ctx.textAlign = 'left';

    model.rows.forEach((row, i) => {
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      if (row.kind === 'lane') {
        ctx.fillStyle = LANE_BG;
        ctx.fillRect(0, y, GRID_W, ROW_HEIGHT);
      }
      ctx.strokeStyle = BORDER;
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT - 0.5);
      ctx.lineTo(GRID_W, y + ROW_HEIGHT - 0.5);
      ctx.stroke();

      ctx.fillStyle = TEXT;
      ctx.font = row.kind === 'lane' ? `600 12px ${font}` : `12px ${font}`;
      clipText(ctx, row.name, 8, y + 22, COL_LANE - 16);

      ctx.fillStyle = MUTED;
      ctx.font = `11px ${font}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatHours(row.hours), COL_LANE + COL_HOURS - 8, y + 22);
      ctx.fillText(row.fte.toFixed(1), COL_LANE + COL_HOURS + COL_FTE - 8, y + 22);
      ctx.textAlign = 'left';
    });

    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(GRID_W - 0.5, 0);
    ctx.lineTo(GRID_W - 0.5, canvasH);
    ctx.stroke();
  }

  // ── Timeline header ──────────────────────────────────────────────────────
  bands.forEach((band) => {
    ctx.fillStyle = band.color;
    ctx.fillRect(timelineX + band.left, 0, band.width, 22);
    ctx.fillStyle = 'rgba(17,24,39,0.8)';
    ctx.font = `500 11px ${font}`;
    clipText(ctx, band.name, timelineX + band.left + 4, 15, Math.max(0, band.width - 8));
  });

  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(timelineX, 22);
  ctx.lineTo(timelineX + timelineW, 22);
  ctx.stroke();

  for (let period = 1; period <= model.np; period++) {
    const left = timelineX + (period - 1) * model.periodWidth;
    const label = periodColumnLabel(period, model.planningMode, model.startDate);
    ctx.fillStyle = MUTED;
    ctx.font = `10px ${font}`;
    // Same as RoadmapTimeline period columns: centered, no overflow:hidden — text may spill.
    ctx.textAlign = 'center';
    ctx.fillText(label, left + model.periodWidth / 2, 36);
    ctx.textAlign = 'left';
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(left + model.periodWidth - 0.5, 22);
    ctx.lineTo(left + model.periodWidth - 0.5, HEADER_HEIGHT);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(timelineX, HEADER_HEIGHT - 0.5);
  ctx.lineTo(timelineX + timelineW, HEADER_HEIGHT - 0.5);
  ctx.stroke();

  // Phase tint behind rows
  bands.forEach((band) => {
    ctx.fillStyle = band.color;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(timelineX + band.left, HEADER_HEIGHT, band.width, model.rows.length * ROW_HEIGHT);
    ctx.globalAlpha = 1;
  });

  const spreadPattern = makeSpreadPattern(ctx);

  // ── Timeline rows ────────────────────────────────────────────────────────
  model.rows.forEach((row, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    if (row.kind === 'lane') {
      ctx.fillStyle = LANE_BG;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(timelineX, y, timelineW, ROW_HEIGHT);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(timelineX, y + ROW_HEIGHT - 0.5);
    ctx.lineTo(timelineX + timelineW, y + ROW_HEIGHT - 0.5);
    ctx.stroke();

    if (row.kind === 'lane') {
      if (model.showLaneBars && row.periodCount > 0) {
        const rect = laneBarRect(row.startPeriod, row.periodCount, model.periodWidth);
        const svgHeight = LANE_BAR_HEIGHT + LANE_CAP_DROP;
        const svgTop = y + (ROW_HEIGHT - svgHeight) / 2;
        ctx.save();
        ctx.translate(timelineX + rect.left, svgTop);
        drawLaneSummaryBar(ctx, rect, LANE_BAR);
        if (row.collapsed) {
          for (const mx of laneMilestoneXs(row.milestonePeriods, model.periodWidth)) {
            drawDiamond(ctx, mx - rect.left, LANE_BAR_HEIGHT / 2, LANE_MILESTONE_SIZE, LANE_BAR);
          }
          if (row.overDemandPeriods.length > 0) {
            const stripes = stripeSegments(
              { startPeriod: row.startPeriod, periodCount: row.periodCount },
              row.overDemandPeriods,
              model.periodWidth
            );
            ctx.fillStyle = AMBER;
            for (const s of stripes) {
              ctx.fillRect(s.left - rect.left, svgHeight, s.width, 3);
            }
          }
        }
        ctx.restore();
      }
      return;
    }

    if (row.kind === 'milestone') {
      const mx = timelineX + milestoneX(row.startPeriod, model.periodWidth);
      const cy = y + ROW_HEIGHT / 2;
      drawDiamond(ctx, mx, cy, MILESTONE_SIZE, ACCENT);
      ctx.fillStyle = 'rgba(17,24,39,0.8)';
      ctx.font = `500 11px ${font}`;
      ctx.fillText(row.name, mx + (MILESTONE_SIZE * Math.SQRT2) / 2 + 6, cy + 4);
      return;
    }

    const rect = barRect(row.startPeriod, row.periodCount, model.periodWidth);
    const left = timelineX + rect.left;

    if (row.kind === 'spread') {
      const top = y + (ROW_HEIGHT - 10) / 2;
      if (row.emptyScope) {
        ctx.fillStyle = 'rgba(143,79,143,0.08)';
        roundRect(ctx, left, top, rect.width, 10, 2);
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1.5;
        roundRect(ctx, left, top, rect.width, 10, 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        if (spreadPattern) {
          ctx.fillStyle = spreadPattern;
        } else {
          ctx.fillStyle = 'rgba(143,79,143,0.22)';
        }
        roundRect(ctx, left, top, rect.width, 10, 2);
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        roundRect(ctx, left, top, rect.width, 10, 2);
        ctx.stroke();
      }
      ctx.fillStyle = row.emptyScope ? ACCENT : '#ffffff';
      ctx.font = `500 11px ${font}`;
      clipText(
        ctx,
        row.emptyScope ? 'no scope linked' : row.name,
        left + 6,
        top + 8,
        Math.max(0, rect.width - 12)
      );
    } else {
      // bar
      const top = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;
      if (row.emptyScope) {
        ctx.fillStyle = 'rgba(143,79,143,0.08)';
        roundRect(ctx, left, top, rect.width, BAR_HEIGHT, 4);
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1.5;
        roundRect(ctx, left, top, rect.width, BAR_HEIGHT, 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ACCENT;
      } else {
        ctx.fillStyle = ACCENT;
        roundRect(ctx, left, top, rect.width, BAR_HEIGHT, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      }
      ctx.font = `500 11px ${font}`;
      clipText(
        ctx,
        row.emptyScope ? 'no scope linked' : row.name,
        left + 6,
        top + 13,
        Math.max(0, rect.width - 12)
      );
    }

    if (row.overDemandPeriods.length > 0) {
      const stripes = stripeSegments(
        { startPeriod: row.startPeriod, periodCount: row.periodCount },
        row.overDemandPeriods,
        model.periodWidth
      );
      const barTop = row.kind === 'spread' ? y + (ROW_HEIGHT - 10) / 2 + 10 : y + (ROW_HEIGHT - BAR_HEIGHT) / 2 + BAR_HEIGHT;
      ctx.fillStyle = AMBER;
      for (const s of stripes) {
        ctx.fillRect(timelineX + s.left, barTop, s.width, 3);
      }
    }
  });

  const link = document.createElement('a');
  link.download = model.filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
