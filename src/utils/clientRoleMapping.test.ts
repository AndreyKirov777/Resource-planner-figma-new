import { describe, it, expect } from 'vitest';
import { clientRolesMapping, getClientRoleFromRole } from './clientRoleMapping';

describe('getClientRoleFromRole', () => {
  it('returns the Client role for an exact rate-card Role', () => {
    expect(getClientRoleFromRole('Principal Software Developer, Core Technologies')).toBe(
      'Senior Developer'
    );
  });

  it('matches after collapsing extra whitespace', () => {
    expect(getClientRoleFromRole('  Principal Software Developer,   Core Technologies ')).toBe(
      'Senior Developer'
    );
  });

  it('returns the original string when nothing maps', () => {
    expect(getClientRoleFromRole('Contractor')).toBe('Contractor');
  });
});

describe('clientRoleMapping data quality', () => {
  it('has no leading or trailing whitespace in Role, Naming in PM, or Client role', () => {
    const fields: (keyof (typeof clientRolesMapping)[0])[] = ['Role', 'Naming in PM', 'Client role'];
    for (const entry of clientRolesMapping) {
      for (const key of fields) {
        const value = entry[key];
        if (typeof value !== 'string') continue;
        expect(value, `Entry with Role "${entry.Role}" has whitespace in "${key}": "${value}"`).toBe(value.trim());
      }
    }
  });

  it('has no duplicate Role values', () => {
    const roles = clientRolesMapping.map(m => m.Role);
    const seen = new Set<string>();
    for (const role of roles) {
      expect(seen.has(role), `Duplicate Role: "${role}"`).toBe(false);
      seen.add(role);
    }
  });

  it('has no known garbled merged-word strings', () => {
    // Known bad patterns from codebase review (e.g. DeveSecurity, Engineerloper)
    const knownBad = ['DeveSecurity', 'Engineerloper'];
    const allText = clientRolesMapping.flatMap(m => [m.Role, m['Naming in PM'], m['Client role']]);
    for (const text of allText) {
      for (const bad of knownBad) {
        expect(text).not.toContain(bad);
      }
    }
  });

  it('does not contain known typo "Principle" (should be Principal)', () => {
    const allText = clientRolesMapping.flatMap(m => [m.Role, m['Naming in PM'], m['Client role']]);
    for (const text of allText) {
      expect(text).not.toMatch(/\bPrinciple\b/);
    }
  });

  it('does not contain known garbled "DeveSecurity" or "Engineerloper"', () => {
    const allText = clientRolesMapping.flatMap(m => [m.Role, m['Naming in PM'], m['Client role']]);
    for (const text of allText) {
      expect(text).not.toMatch(/DeveSecurity|Engineerloper/i);
    }
  });

  it('does not contain wrong word order "Lead Team ," (should be Team Lead)', () => {
    const allText = clientRolesMapping.flatMap(m => [m.Role, m['Naming in PM'], m['Client role']]);
    for (const text of allText) {
      expect(text).not.toMatch(/Lead Team\s*,/);
    }
  });
});
