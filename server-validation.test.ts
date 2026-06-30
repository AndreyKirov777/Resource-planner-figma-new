import { describe, it, expect } from 'vitest';
import {
  projectCreateSchema,
  projectUpdateSchema,
  rateCardUpdateSchema,
  generatePlanRequestSchema,
  resourceListCreateSchema,
  resourceListUpdateSchema,
  resourcePlanCreateSchema,
  resourcePlanUpdateSchema,
  allocationSchema,
  allocationUpdateSchema,
  convertPlanningModeSchema,
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

    it('accepts planningMode', () => {
      const result = projectCreateSchema.safeParse({ name: 'P', planningMode: 'monthly' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid planningMode', () => {
      const result = projectCreateSchema.safeParse({ name: 'P', planningMode: 'daily' });
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

  describe('allocationSchema', () => {
    it('accepts valid payload', () => {
      const result = allocationSchema.safeParse({ periodNumber: 1, allocation: 100 });
      expect(result.success).toBe(true);
    });

    it('rejects allocation > 100', () => {
      const result = allocationSchema.safeParse({ periodNumber: 1, allocation: 101 });
      expect(result.success).toBe(false);
    });

    it('rejects periodNumber < 1', () => {
      const result = allocationSchema.safeParse({ periodNumber: 0, allocation: 50 });
      expect(result.success).toBe(false);
    });
  });

  describe('resourcePlanCreateSchema', () => {
    it('accepts valid payload', () => {
      const result = resourcePlanCreateSchema.safeParse({
        role: 'Developer',
        allocations: [{ periodNumber: 1, allocation: 50 }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required role', () => {
      const result = resourcePlanCreateSchema.safeParse({ clientRole: 'Dev' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid allocations element', () => {
      const result = resourcePlanCreateSchema.safeParse({
        role: 'Dev',
        allocations: [{ periodNumber: 1, allocation: 150 }],
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

  describe('allocationUpdateSchema', () => {
    it('accepts valid payload', () => {
      const result = allocationUpdateSchema.safeParse({ periodNumber: 2, allocation: 75 });
      expect(result.success).toBe(true);
    });
  });

  describe('convertPlanningModeSchema', () => {
    it('accepts weekly', () => {
      const result = convertPlanningModeSchema.safeParse({ targetMode: 'weekly' });
      expect(result.success).toBe(true);
    });

    it('accepts monthly', () => {
      const result = convertPlanningModeSchema.safeParse({ targetMode: 'monthly' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = convertPlanningModeSchema.safeParse({ targetMode: 'daily' });
      expect(result.success).toBe(false);
    });
  });

  describe('generatePlanRequestSchema', () => {
    it('accepts valid mode:current payload with projectId', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'current',
        projectId: 1,
        description: 'Build a web app',
        region: 'ukraine',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid mode:new payload without projectId', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: 'A new project',
        region: 'easternEurope',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mode:current without projectId (refine)', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'current',
        description: 'Missing project id',
        region: 'ukraine',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('projectId');
      }
    });

    it('rejects invalid region', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: 'Test',
        region: 'mars',
      });
      expect(result.success).toBe(false);
    });

    it('rejects extra fields (strict)', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: 'Test',
        region: 'ukraine',
        unknownField: 'oops',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty description', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: '',
        region: 'ukraine',
      });
      expect(result.success).toBe(false);
    });

    it('rejects description longer than 4000 chars', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: 'x'.repeat(4001),
        region: 'ukraine',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid regions', () => {
      const regions = [
        'ukraine', 'easternEurope', 'asiaGE', 'asiaARMKZ',
        'latam', 'mexico', 'india', 'newYork', 'london',
      ] as const;
      for (const region of regions) {
        const result = generatePlanRequestSchema.safeParse({
          mode: 'new',
          description: 'Test',
          region,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional applyProposedPhases boolean', () => {
      const result = generatePlanRequestSchema.safeParse({
        mode: 'new',
        description: 'Test',
        region: 'ukraine',
        applyProposedPhases: true,
      });
      expect(result.success).toBe(true);
    });
  });
});
