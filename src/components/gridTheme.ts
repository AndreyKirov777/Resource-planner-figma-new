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
