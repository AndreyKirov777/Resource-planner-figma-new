import { describe, it, expect } from 'vitest';
import { LOCATIONS } from '../config/defaults';
import { GENERATE_PLAN_REGIONS, LOCATION_LABELS, canonicalLocationLabel, locationAbbr } from './regions';

describe('locationAbbr', () => {
  it('abbreviates every canonical label', () => {
    expect(LOCATIONS.map(loc => locationAbbr(loc.label))).toEqual([
      'UA', 'EE', 'GE', 'ARM/KZ', 'LATAM', 'MX', 'IN', 'NY', 'LDN',
    ]);
  });

  it('abbreviates rate card slugs and generate-plan region keys alike', () => {
    for (const { slug } of LOCATIONS) {
      expect(locationAbbr(slug)).toBe(locationAbbr(canonicalLocationLabel(slug)));
    }
    for (const { value, label } of GENERATE_PLAN_REGIONS) {
      expect(locationAbbr(value)).toBe(locationAbbr(label));
    }
  });

  it('abbreviates the spaced label variant written by plan generation', () => {
    expect(locationAbbr('Asia (ARM, KZ)')).toBe('ARM/KZ');
    expect(locationAbbr('Asia (ARM,KZ)')).toBe('ARM/KZ');
  });

  it('passes unknown and empty values through unchanged', () => {
    expect(locationAbbr('Remote')).toBe('Remote');
    expect(locationAbbr('')).toBe('');
    expect(locationAbbr(null)).toBe('');
    expect(locationAbbr(undefined)).toBe('');
  });
});

describe('canonicalLocationLabel', () => {
  it('maps any known spelling to a value the Location dropdown offers', () => {
    for (const input of ['ukraine', 'Ukraine', 'UKRAINE', 'asiaARMKZ', 'asia-arm-kz', 'Asia (ARM, KZ)']) {
      expect(LOCATION_LABELS).toContain(canonicalLocationLabel(input));
    }
  });

  it('passes unknown and empty values through unchanged', () => {
    expect(canonicalLocationLabel('Remote')).toBe('Remote');
    expect(canonicalLocationLabel(null)).toBe('');
  });
});
