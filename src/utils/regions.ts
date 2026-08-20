import type { GeneratePlanRegion } from '../services/api';
import { LOCATIONS, type LocationSlug } from '../config/defaults';

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

/** Short badge form per rate card region, used where a full label does not fit. */
const LOCATION_ABBREVIATIONS: Record<LocationSlug, string> = {
  'ukraine': 'UA',
  'eastern-europe': 'EE',
  'asia-ge': 'GE',
  'asia-arm-kz': 'ARM/KZ',
  'latam': 'LATAM',
  'mexico': 'MX',
  'india': 'IN',
  'new-york': 'NY',
  'london': 'LDN',
};

/** The only location values the UI offers, in rate card tab order. */
export const LOCATION_LABELS: readonly string[] = LOCATIONS.map(({ label }) => label);

/** Collapse a slug, a camelCase region key and a label to one comparable key. */
function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Location strings reach the DB from three writers (rate card, plan generation, manual entry),
// so spellings vary ('asia-arm-kz', 'asiaARMKZ', 'Asia (ARM, KZ)'). All collapse to one slug here.
const SLUG_BY_NORMALIZED_KEY = new Map<string, LocationSlug>();
for (const { slug, label } of LOCATIONS) {
  SLUG_BY_NORMALIZED_KEY.set(normalizeLocationKey(slug), slug);
  SLUG_BY_NORMALIZED_KEY.set(normalizeLocationKey(label), slug);
}
for (const { value, label } of GENERATE_PLAN_REGIONS) {
  const slug = SLUG_BY_NORMALIZED_KEY.get(normalizeLocationKey(value));
  if (slug) SLUG_BY_NORMALIZED_KEY.set(normalizeLocationKey(label), slug);
}

/** Resolve any known spelling to its canonical label; unknown values pass through unchanged. */
export function canonicalLocationLabel(value?: string | null): string {
  if (!value) return '';
  const slug = SLUG_BY_NORMALIZED_KEY.get(normalizeLocationKey(value));
  return slug ? LOCATION_SLUG_LABELS.get(slug) ?? value : value;
}

/** Abbreviate a location for dense tables ('Ukraine' -> 'UA'); unknown values pass through. */
export function locationAbbr(value?: string | null): string {
  if (!value) return '';
  const slug = SLUG_BY_NORMALIZED_KEY.get(normalizeLocationKey(value));
  return slug ? LOCATION_ABBREVIATIONS[slug] : value;
}
