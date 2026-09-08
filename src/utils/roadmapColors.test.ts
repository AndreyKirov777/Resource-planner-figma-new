import { describe, it, expect } from 'vitest';
import { PHASE_COLORS } from './phases';
import {
  ROADMAP_ITEM_COLORS,
  ROADMAP_ITEM_DEFAULT_COLOR,
  fillLabelColor,
  hexToRgba,
  isLightFill,
  isRoadmapItemColor,
  itemStrokeColor,
  lightenHex,
  resolveRoadmapItemColor,
  spreadFill,
} from './roadmapColors';

describe('roadmapColors', () => {
  it('reuses the phase pastel palette and keeps the historic accent as default', () => {
    expect(ROADMAP_ITEM_DEFAULT_COLOR).toBe('#8f4f8f');
    expect(ROADMAP_ITEM_COLORS).toEqual(PHASE_COLORS);
    expect(ROADMAP_ITEM_COLORS[0]).toBe('#E3F2FD');
    expect(ROADMAP_ITEM_COLORS).not.toContain('#33627D');
  });

  it('accepts phase swatches and the legacy default, rejects unknown hex', () => {
    expect(isRoadmapItemColor('#E3F2FD')).toBe(true);
    expect(isRoadmapItemColor('#e3f2fd')).toBe(true);
    expect(isRoadmapItemColor('#8f4f8f')).toBe(true);
    expect(isRoadmapItemColor('#1d4ed8')).toBe(false);
    expect(isRoadmapItemColor('#ff00aa')).toBe(false);
    expect(isRoadmapItemColor('E3F2FD')).toBe(false);
  });

  it('resolves missing or unknown colours to the default; keeps palette and legacy', () => {
    expect(resolveRoadmapItemColor(undefined)).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(resolveRoadmapItemColor('#ff00aa')).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(resolveRoadmapItemColor('#e3f2fd')).toBe('#E3F2FD');
    expect(resolveRoadmapItemColor('#8F4F8F')).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
  });

  it('uses dark labels on pastels and white on the historic accent', () => {
    expect(isLightFill('#E3F2FD')).toBe(true);
    expect(isLightFill('#8f4f8f')).toBe(false);
    expect(fillLabelColor('#E3F2FD')).toBe('#111827');
    expect(fillLabelColor('#8f4f8f')).toBe('#ffffff');
  });

  it('builds rgba washes and lightens only dark-accent spreads', () => {
    expect(hexToRgba('#8f4f8f', 0.08)).toBe('rgba(143,79,143,0.08)');
    expect(lightenHex('#8f4f8f')).toBe('#b68db6');
    expect(spreadFill('#8f4f8f')).toBe('#b68db6');
    expect(spreadFill('#E3F2FD')).toBe('#E3F2FD');
    expect(itemStrokeColor('#E3F2FD')).toBe('#889198');
    expect(itemStrokeColor('#8f4f8f')).toBe('#8f4f8f');
  });
});
