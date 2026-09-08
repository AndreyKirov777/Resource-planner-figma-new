import { describe, it, expect } from 'vitest';
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
  it('uses the coral-to-steel spectrum with dusty slate as default', () => {
    expect(ROADMAP_ITEM_DEFAULT_COLOR).toBe('#5D6E85');
    expect(ROADMAP_ITEM_COLORS).toEqual([
      '#E6514C',
      '#E37A40',
      '#EB9B3F',
      '#EA8A57',
      '#F1C965',
      '#9ABD76',
      '#60A88D',
      '#5E8F8E',
      '#5D6E85',
      '#417B9E',
    ]);
    expect(ROADMAP_ITEM_COLORS).toContain(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(ROADMAP_ITEM_COLORS).not.toContain('#33627D');
  });

  it('accepts spectrum swatches and the legacy accent, rejects unknown hex', () => {
    expect(isRoadmapItemColor('#417B9E')).toBe(true);
    expect(isRoadmapItemColor('#5D6E85')).toBe(true);
    expect(isRoadmapItemColor('#8f4f8f')).toBe(true);
    expect(isRoadmapItemColor('#E3F2FD')).toBe(false);
    expect(isRoadmapItemColor('#ff00aa')).toBe(false);
  });

  it('resolves missing, unknown, and legacy accent to the slate default', () => {
    expect(resolveRoadmapItemColor(undefined)).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(resolveRoadmapItemColor('#ff00aa')).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(resolveRoadmapItemColor('#8F4F8F')).toBe(ROADMAP_ITEM_DEFAULT_COLOR);
    expect(resolveRoadmapItemColor('#417b9e')).toBe('#417B9E');
  });

  it('uses dark labels on light yellows and white on darker spectrum fills', () => {
    expect(isLightFill('#F1C965')).toBe(true);
    expect(isLightFill('#5D6E85')).toBe(false);
    expect(fillLabelColor('#F1C965')).toBe('#111827');
    expect(fillLabelColor('#5D6E85')).toBe('#ffffff');
  });

  it('builds rgba washes and lightens only dark-accent spreads', () => {
    expect(hexToRgba('#5D6E85', 0.08)).toBe('rgba(93,110,133,0.08)');
    expect(lightenHex('#5D6E85')).toBe('#96a1b0');
    expect(spreadFill('#5D6E85')).toBe('#96a1b0');
    expect(spreadFill('#F1C965')).toBe('#F1C965');
    expect(itemStrokeColor('#F1C965')).toBe('#91793d');
    expect(itemStrokeColor('#5D6E85')).toBe('#5D6E85');
  });
});
