import type { GeneratePlanRegion } from '../services/api';
import { LOCATIONS } from '../config/defaults';

export const GENERATE_PLAN_REGIONS: ReadonlyArray<{ value: GeneratePlanRegion; label: string }> = [
  { value: 'ukraine', label: 'Ukraine' },
  { value: 'easternEurope', label: 'Eastern Europe' },
  { value: 'asiaGE', label: 'Asia (GE)' },
  { value: 'asiaARMKZ', label: 'Asia (ARM, KZ)' },
  { value: 'latam', label: 'LATAM' },
  { value: 'mexico', label: 'Mexico' },
  { value: 'india', label: 'India' },
  { value: 'newYork', label: 'New York' },
  { value: 'london', label: 'London' },
] as const;

const REGION_LABEL_BY_VALUE = new Map<string, string>(
  GENERATE_PLAN_REGIONS.map(({ value, label }) => [value, label]),
);

const LOCATION_SLUG_LABELS = new Map<string, string>(
  LOCATIONS.map(({ slug, label }) => [slug, label]),
);

export function regionToLocationLabel(region: string): string {
  return REGION_LABEL_BY_VALUE.get(region) ?? region;
}

/** Resolve a delivery region key (camelCase API) or project location slug to a display label. */
export function resolveLocationLabel(regionOrSlug: string): string {
  return REGION_LABEL_BY_VALUE.get(regionOrSlug)
    ?? LOCATION_SLUG_LABELS.get(regionOrSlug)
    ?? regionOrSlug;
}
