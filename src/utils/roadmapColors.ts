/**
 * Per-item roadmap bar colours — same pastel palette as phase bands
 * (`PHASE_COLORS`). Lane-bar slate `#33627D` stays reserved for lane summaries.
 * Historic accent `#8f4f8f` remains the stored default so existing items
 * look unchanged until the planner picks a swatch.
 */
import { PHASE_COLORS } from './phases';

export const ROADMAP_ITEM_DEFAULT_COLOR = '#8f4f8f';

export const ROADMAP_ITEM_COLORS = PHASE_COLORS;

const PALETTE_SET = new Set(
  [...ROADMAP_ITEM_COLORS, ROADMAP_ITEM_DEFAULT_COLOR].map((c) => c.toLowerCase())
);

/** Hex `#rrggbb` in the phase palette or the legacy default (case-insensitive). */
export function isRoadmapItemColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value) && PALETTE_SET.has(value.toLowerCase());
}

/** Resolve stored/partial colour; unknown or missing → default accent. */
export function resolveRoadmapItemColor(color: string | null | undefined): string {
  if (!color) return ROADMAP_ITEM_DEFAULT_COLOR;
  const lower = color.toLowerCase();
  if (lower === ROADMAP_ITEM_DEFAULT_COLOR.toLowerCase()) return ROADMAP_ITEM_DEFAULT_COLOR;
  const found = ROADMAP_ITEM_COLORS.find((c) => c.toLowerCase() === lower);
  return found ?? ROADMAP_ITEM_DEFAULT_COLOR;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(143,79,143,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Pastel phase swatches are light; the historic accent is not. */
export function isLightFill(hex: string): boolean {
  return luminance(hex) > 0.4;
}

/** White on dark fills; dark on pastel fills so 11px names stay readable. */
export function fillLabelColor(hex: string): string {
  return isLightFill(hex) ? '#111827' : '#ffffff';
}

/** Mix toward white so a dark-accent spread stays lighter than its bar. */
export function lightenHex(hex: string, amount = 0.35): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#c084c0';
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) });
}

export function darkenHex(hex: string, amount = 0.4): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) });
}

/** Pastels are already light — leave them; dark accents get a lighter mix. */
export function spreadFill(hex: string): string {
  return isLightFill(hex) ? hex : lightenHex(hex);
}

/** Dashed outline / unlinked name: darken pastels so they read on the grid. */
export function itemStrokeColor(hex: string): string {
  return isLightFill(hex) ? darkenHex(hex, 0.4) : hex;
}

export function emptyWash(hex: string): string {
  return hexToRgba(hex, isLightFill(hex) ? 0.45 : 0.08);
}
