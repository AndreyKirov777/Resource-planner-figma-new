import { describe, it, expect } from 'vitest';
import {
  projectCreateSchema,
  projectUpdateSchema,
  rateCardUpdateSchema,
  resourceListCreateSchema,
  resourceListUpdateSchema,
  resourcePlanCreateSchema,
  resourcePlanUpdateSchema,
  weeklyAllocationSchema,
  weeklyAllocationUpdateSchema,
} from './server-validation';

describe('server-validation Zod schemas', () => {
  describe('projectCreateSchema', () => {
    it('accepts valid payload', () => {
      const result = projectCreateSchema.safeParse({ name: 'My Project' });
      expect(result.success).toBe(true);
    });

    it('rejects missing required name', () => {
      const result = projectCreateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = projectCreateSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects extra fields (strict)', () => {
      const result = projectCreateSchema.safeParse({ name: 'P', id: 1, createdAt: 'x' });
      expect(result.success).toBe(false);
    });

    it('rejects wrong type for name', () => {
      const result = projectCreateSchema.safeParse({ name: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('projectUpdateSchema', () => {
    it('accepts valid partial payload', () => {
      const result = projectUpdateSchema.safeParse({ name: 'Updated' });
      expect(result.success).toBe(true);
    });

    it('rejects id in body', () => {
      const result = projectUpdateSchema.safeParse({ name: 'P', id: 999 });
      expect(result.success).toBe(false);
    });
  });

  describe('rateCardUpdateSchema', () => {
    it('accepts valid payload', () => {
      const result = rateCardUpdateSchema.safeParse({ role: 'Dev', ukraine: 50 });
      expect(result.success).toBe(true);
    });

    it('rejects string where number expected', () => {
      const result = rateCardUpdateSchema.safeParse({ ukraine: '50' });
      expect(result.success).toBe(false);
    });
  });

  describe('resourceListCreateSchema', () => {
    it('accepts valid payload', () => {
      const result = resourceListCreateSchema.safeParse({ role: 'Developer' });
      expect(result.success).toBe(true);
    });

    it('rejects missing required role', () => {
      const result = resourceListCreateSchema.safeParse({ name: 'John' });
      expect(result.success).toBe(false);
    });

    it('rejects empty role', () => {
      const result = resourceListCreateSchema.safeParse({ role: '' });
      expect(result.success).toBe(false);
    });

    it('rejects projectId (disallowed field)', () => {
      const result = resourceListCreateSchema.safeParse({ role: 'Dev', projectId: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('resourceListUpdateSchema', () => {
    it('accepts valid partial payload', () => {
      const result = resourceListUpdateSchema.safeParse({ intRate: 60 });
      expect(result.success).toBe(true);
    });
  });

  describe('weeklyAllocationSchema', () => {
    it('accepts valid payload', () => {
      const result = weeklyAllocationSchema.safeParse({ weekNumber: 1, allocation: 100 });
      expect(result.success).toBe(true);
    });

    it('rejects allocation > 100', () => {
      const result = weeklyAllocationSchema.safeParse({ weekNumber: 1, allocation: 101 });
      expect(result.success).toBe(false);
    });

    it('rejects weekNumber < 1', () => {
      const result = weeklyAllocationSchema.safeParse({ weekNumber: 0, allocation: 50 });
      expect(result.success).toBe(false);
    });
  });

  describe('resourcePlanCreateSchema', () => {
    it('accepts valid payload', () => {
      const result = resourcePlanCreateSchema.safeParse({
        role: 'Developer',
        weeklyAllocations: [{ weekNumber: 1, allocation: 50 }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required role', () => {
      const result = resourcePlanCreateSchema.safeParse({ clientRole: 'Dev' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid weeklyAllocations element', () => {
      const result = resourcePlanCreateSchema.safeParse({
        role: 'Dev',
        weeklyAllocations: [{ weekNumber: 1, allocation: 150 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('resourcePlanUpdateSchema', () => {
    it('accepts valid partial payload', () => {
      const result = resourcePlanUpdateSchema.safeParse({ intHourlyRate: 50 });
      expect(result.success).toBe(true);
    });
  });

  describe('weeklyAllocationUpdateSchema', () => {
    it('accepts valid payload', () => {
      const result = weeklyAllocationUpdateSchema.safeParse({ weekNumber: 2, allocation: 75 });
      expect(result.success).toBe(true);
    });
  });
});
