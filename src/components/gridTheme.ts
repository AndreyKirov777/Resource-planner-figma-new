import type { Theme } from '@glideapps/glide-data-grid';

/**
 * The shared Glide Data Grid theme. Extracted verbatim from the byte-identical
 * copies previously inlined in `ResourcePlan.tsx` and `ClientView.tsx` so all
 * three grids stay visually consistent. No appearance change.
 */
export const GRID_THEME: Partial<Theme> = {
  accentColor: '#8f4f8f',
  accentFg: '#ffffff',
  accentLight: 'rgba(62, 116, 253, 0.1)',
  textDark: '#313131',
  textMedium: '#737373',
  textLight: '#b1b1b1',
  textBubble: '#313131',
  bgIconHeader: '#b1b1b1',
  fgIconHeader: '#717171',
  textHeader: '#4a4a4a',
  textHeaderSelected: '#000000',
  bgCell: '#ffffff',
  bgCellMedium: '#fafafa',
  bgHeader: '#f6f6f6',
  bgHeaderHasFocus: '#e1e1e1',
  bgHeaderHovered: '#eeeeee',
  bgBubble: '#ffffff',
  bgBubbleSelected: '#ffffff',
  bgSearchResult: '#fff9e3',
  borderColor: 'rgba(115, 115, 115, 0.16)',
  drilldownBorder: 'rgba(115, 115, 115, 0.2)',
  linkColor: '#4F46E5',
  headerFontStyle: '600 14px',
  baseFontStyle: '14px',
  fontFamily:
    'Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif',
};

// Compute a background color for a percentage value between 0 and 100.
// 0% -> white (#ffffff), 100% -> #63BE7B, values in-between are linearly interpolated.
// We do the blending in sRGB for simplicity and performance.
export function getAllocationBgColor(percent: number): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (p <= 0) return '#ffffff';
  if (p >= 100) return '#63BE7B';
  const t = p / 100;
  const start = { r: 255, g: 255, b: 255 }; // white
  const end = { r: 0x63, g: 0xBE, b: 0x7B }; // #63BE7B
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
