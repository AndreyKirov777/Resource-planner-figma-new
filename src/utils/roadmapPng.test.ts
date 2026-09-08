import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ROADMAP_PNG_FORBIDDEN_CHROME,
  buildRoadmapPngModel,
  downloadRoadmapPng,
  periodColumnLabel,
  type RoadmapPngInput,
} from './roadmapPng';
import type { RoadmapRow } from './roadmap';
import { DEFAULT_ZOOM_INDEX, ZOOM_LADDER } from './roadmapGeometry';

function laneRow(overrides: Partial<RoadmapRow> = {}): RoadmapRow {
  return {
    kind: 'lane',
    id: 1,
    laneId: null,
    name: 'Delivery',
    startPeriod: 1,
    periodCount: 4,
    hours: 40,
    fte: 1,
    emptyScope: false,
    overDemandPeriods: [],
    collapsed: false,
    milestonePeriods: [],
    spreadItemCount: 0,
    spreadItemNames: [],
    itemCount: 1,
    ...overrides,
  };
}

function barRow(overrides: Partial<RoadmapRow> = {}): RoadmapRow {
  return {
    kind: 'bar',
    id: 10,
    laneId: 1,
    name: 'Build API',
    startPeriod: 1,
    periodCount: 4,
    hours: 40,
    fte: 1,
    emptyScope: false,
    overDemandPeriods: [],
    collapsed: false,
    milestonePeriods: [],
    spreadItemCount: 0,
    spreadItemNames: [],
    itemCount: 0,
    ...overrides,
  };
}

const baseInput: RoadmapPngInput = {
  projectName: 'Acme',
  rows: [laneRow(), barRow()],
  phases: [{ name: 'Phase 1', periodCount: 8, color: '#E3F2FD', hours: 40 }],
  periodWidth: ZOOM_LADDER[DEFAULT_ZOOM_INDEX],
  np: 8,
  planningMode: 'weekly',
  startDate: null,
  showLaneBars: true,
  showUnlinkedOutline: true,
  scope: 'table-and-timeline',
  background: 'white',
  now: new Date('2026-09-08T12:00:00.000Z'),
};

describe('buildRoadmapPngModel', () => {
  it('returns empty when there are no rows', () => {
    const result = buildRoadmapPngModel({ ...baseInput, rows: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('empty');
  });

  it('builds filename and chart labels for table+timeline / white', () => {
    const result = buildRoadmapPngModel(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.model.filename).toBe('roadmap-Acme-2026-09-08.png');
    expect(result.model.includeGrid).toBe(true);
    expect(result.model.background).toBe('white');
    expect(result.model.scope).toBe('table-and-timeline');
    expect(result.model.drawnLabels).toEqual(
      expect.arrayContaining(['Lane / Item', 'Hours', 'FTE', 'Phase 1', 'Delivery', 'Build API', 'W1'])
    );

    const joined = result.model.drawnLabels.join('\n');
    for (const frag of ROADMAP_PNG_FORBIDDEN_CHROME) {
      expect(joined).not.toContain(frag);
    }
  });

  it('omits grid labels for timeline-only scope and keeps transparent background', () => {
    const result = buildRoadmapPngModel({
      ...baseInput,
      scope: 'timeline-only',
      background: 'transparent',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.model.includeGrid).toBe(false);
    expect(result.model.background).toBe('transparent');
    expect(result.model.drawnLabels).not.toContain('Lane / Item');
    expect(result.model.drawnLabels).not.toContain('Hours');
    expect(result.model.drawnLabels).toEqual(expect.arrayContaining(['Phase 1', 'Build API', 'W1']));
  });

  it('sanitizes unsafe characters in the project name', () => {
    const result = buildRoadmapPngModel({ ...baseInput, projectName: 'Acme/Q3:Plan*' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.filename).toBe('roadmap-Acme_Q3_Plan_-2026-09-08.png');
  });

  it('labels empty-scope bars and spreads with the item name, not a placeholder', () => {
    const result = buildRoadmapPngModel({
      ...baseInput,
      rows: [
        laneRow(),
        barRow({ name: 'Unlinked work', hours: 0, emptyScope: true }),
        barRow({
          id: 21,
          kind: 'spread',
          name: 'Unlinked support',
          hours: 0,
          emptyScope: true,
          startPeriod: 1,
          periodCount: 8,
        }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.drawnLabels).toContain('Unlinked work');
    expect(result.model.drawnLabels).toContain('Unlinked support');
    expect(result.model.drawnLabels).not.toContain('no scope linked');
    expect(result.model.showUnlinkedOutline).toBe(true);
  });

  it('threads showUnlinkedOutline through the export model', () => {
    const off = buildRoadmapPngModel({ ...baseInput, showUnlinkedOutline: false });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.model.showUnlinkedOutline).toBe(false);

    const on = buildRoadmapPngModel({ ...baseInput, showUnlinkedOutline: true });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect(on.model.showUnlinkedOutline).toBe(true);
  });

  it('never puts Load strip chrome into drawn labels', () => {
    const result = buildRoadmapPngModel(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.drawnLabels.some((l) => l.startsWith('Load '))).toBe(false);
    expect(result.model.drawnLabels).not.toContain('demand/supply');
  });

  it('uses W-prefix weekly and M-prefix monthly period labels like the UI', () => {
    expect(periodColumnLabel(1, 'weekly', null)).toBe('W1');
    expect(periodColumnLabel(3, 'monthly', null)).toBe('M3');

    const weekly = buildRoadmapPngModel({
      ...baseInput,
      planningMode: 'weekly',
      startDate: '2026-09-01',
    });
    expect(weekly.ok).toBe(true);
    if (weekly.ok) {
      expect(weekly.model.drawnLabels.some((l) => /^W1 · /.test(l))).toBe(true);
      expect(weekly.model.drawnLabels.some((l) => /^M\d/.test(l))).toBe(false);
    }

    const monthly = buildRoadmapPngModel({
      ...baseInput,
      planningMode: 'monthly',
      startDate: '2026-09-01',
    });
    expect(monthly.ok).toBe(true);
    if (monthly.ok) {
      expect(monthly.model.drawnLabels.some((l) => /^M1 · /.test(l))).toBe(true);
      expect(monthly.model.drawnLabels.some((l) => /^W\d/.test(l))).toBe(false);
    }
  });
});

describe('downloadRoadmapPng', () => {
  const originalCreateElement = document.createElement.bind(document);
  let clickCount = 0;
  let capturedDownload: string | null;
  let fillRectCalls: Array<{ fillStyle: unknown; args: number[] }> = [];
  let setLineDashCalls: unknown[][] = [];
  let fillCalls: Array<{ fillStyle: unknown }> = [];

  beforeEach(() => {
    clickCount = 0;
    capturedDownload = null;
    fillRectCalls = [];
    setLineDashCalls = [];
    fillCalls = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
        const mockCtx = {
          scale: vi.fn(),
          fillRect: vi.fn((...args: number[]) => {
            fillRectCalls.push({ fillStyle: mockCtx.fillStyle, args });
          }),
          fillText: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          quadraticCurveTo: vi.fn(),
          stroke: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
          closePath: vi.fn(),
          fill: vi.fn(() => {
            fillCalls.push({ fillStyle: mockCtx.fillStyle });
          }),
          translate: vi.fn(),
          rotate: vi.fn(),
          setLineDash: vi.fn((dash: unknown[]) => {
            setLineDashCalls.push(dash);
          }),
          createPattern: vi.fn(() => null),
          fillStyle: '#000000' as string | CanvasGradient | CanvasPattern,
          strokeStyle: '#000000',
          lineWidth: 1,
          font: '',
          textAlign: 'left' as CanvasTextAlign,
          globalAlpha: 1,
        };
        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
        vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAA');
        return canvas;
      }
      if (tag === 'a') {
        const a = originalCreateElement('a') as HTMLAnchorElement;
        Object.defineProperty(a, 'click', {
          value: () => {
            capturedDownload = a.download;
            clickCount += 1;
          },
        });
        return a;
      }
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers a download with the .png filename', () => {
    const built = buildRoadmapPngModel(baseInput);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    downloadRoadmapPng(built.model);
    expect(clickCount).toBe(1);
    expect(capturedDownload).toBe('roadmap-Acme-2026-09-08.png');
  });

  it('fills white background only when background is white', () => {
    const white = buildRoadmapPngModel({ ...baseInput, background: 'white' });
    expect(white.ok).toBe(true);
    if (!white.ok) return;
    fillRectCalls = [];
    downloadRoadmapPng(white.model);
    expect(fillRectCalls.some((c) => c.fillStyle === '#ffffff' && c.args[0] === 0 && c.args[1] === 0)).toBe(
      true
    );

    const transparent = buildRoadmapPngModel({ ...baseInput, background: 'transparent' });
    expect(transparent.ok).toBe(true);
    if (!transparent.ok) return;
    fillRectCalls = [];
    downloadRoadmapPng(transparent.model);
    expect(fillRectCalls.some((c) => c.fillStyle === '#ffffff' && c.args[0] === 0 && c.args[1] === 0)).toBe(
      false
    );
  });

  it('draws empty-scope bars dashed only when showUnlinkedOutline is on', () => {
    const rows = [laneRow(), barRow({ name: 'Unlinked work', hours: 0, emptyScope: true })];

    const on = buildRoadmapPngModel({ ...baseInput, rows, showUnlinkedOutline: true });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    setLineDashCalls = [];
    fillCalls = [];
    downloadRoadmapPng(on.model);
    expect(setLineDashCalls).toContainEqual([3, 2]);
    expect(fillCalls.some((c) => c.fillStyle === 'rgba(143,79,143,0.08)')).toBe(true);

    const off = buildRoadmapPngModel({ ...baseInput, rows, showUnlinkedOutline: false });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    setLineDashCalls = [];
    fillCalls = [];
    downloadRoadmapPng(off.model);
    expect(setLineDashCalls).not.toContainEqual([3, 2]);
    expect(fillCalls.some((c) => c.fillStyle === '#8f4f8f')).toBe(true);
  });

  it('draws empty-scope spreads dashed only when showUnlinkedOutline is on', () => {
    const rows = [
      laneRow(),
      barRow({
        id: 21,
        kind: 'spread',
        name: 'Unlinked support',
        hours: 0,
        emptyScope: true,
        startPeriod: 1,
        periodCount: 8,
      }),
    ];

    const on = buildRoadmapPngModel({ ...baseInput, rows, showUnlinkedOutline: true });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    setLineDashCalls = [];
    downloadRoadmapPng(on.model);
    expect(setLineDashCalls).toContainEqual([3, 2]);

    const off = buildRoadmapPngModel({ ...baseInput, rows, showUnlinkedOutline: false });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    setLineDashCalls = [];
    fillCalls = [];
    downloadRoadmapPng(off.model);
    expect(setLineDashCalls).not.toContainEqual([3, 2]);
    expect(fillCalls.some((c) => c.fillStyle === '#c084c0')).toBe(true);
  });
});
