import { describe, it, expect } from 'vitest';
import type { ResourceList as ResourceListType } from '../services/api';
import { findResourceForPlan } from './resourceMatching';

describe('findResourceForPlan', () => {
  const list = (id: number, role: string, intRate: number, location: string): ResourceListType =>
    ({ id, role, intRate, hourlyRate: 0, location, projectId: 1, createdAt: '', updatedAt: '' }) as ResourceListType;

  it('matches a role that appears once regardless of rate', () => {
    const lists = [list(1, 'BA', 30, 'Ukraine')];
    expect(findResourceForPlan('BA', 99, lists)?.location).toBe('Ukraine');
  });

  it('tells duplicate roles apart by rate', () => {
    const lists = [list(1, 'BA', 30, 'Ukraine'), list(2, 'BA', 80, 'London')];
    expect(findResourceForPlan('BA', 80, lists)?.location).toBe('London');
    expect(findResourceForPlan('BA', 30, lists)?.location).toBe('Ukraine');
  });

  it('returns nothing rather than guessing when duplicate roles have no rate match', () => {
    const lists = [list(1, 'BA', 30, 'Ukraine'), list(2, 'BA', 80, 'London')];
    expect(findResourceForPlan('BA', 55, lists)).toBeUndefined();
  });

  it('returns nothing for a role that is not in the list', () => {
    expect(findResourceForPlan('QA', 30, [list(1, 'BA', 30, 'Ukraine')])).toBeUndefined();
  });
});
