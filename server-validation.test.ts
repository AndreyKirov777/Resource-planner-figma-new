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
  roadmapLaneCreateSchema,
  roadmapLaneUpdateSchema,
  roadmapItemCreateSchema,
  roadmapItemUpdateSchema,
  roadmapLinksReplaceSchema,
  wbsRoadmapLinkSchema,
  bootstrapRoadmapSchema,
  roadmapReorderSchema,
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

    it('accepts hourlyRate', () => {
      const result = resourceListCreateSchema.safeParse({ role: 'Dev', hourlyRate: 91 });
      expect(result.success).toBe(true);
    });
  });

  describe('resourceListUpdateSchema', () => {
    it('accepts valid partial payload', () => {
      const result = resourceListUpdateSchema.safeParse({ intRate: 60 });
      expect(result.success).toBe(true);
    });

    it('accepts hourlyRate', () => {
      const result = resourceListUpdateSchema.safeParse({ hourlyRate: 91 });
      expect(result.success).toBe(true);
    });

    it('rejects unknown keys', () => {
      const result = resourceListUpdateSchema.safeParse({ hourlyRate: 91, extra: 1 });
      expect(result.success).toBe(false);
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

  describe('projectCreateSchema / projectUpdateSchema startDate', () => {
    it('accepts a valid ISO date', () => {
      expect(projectCreateSchema.safeParse({ name: 'P', startDate: '2026-01-05' }).success).toBe(true);
      expect(projectUpdateSchema.safeParse({ startDate: '2026-01-05T00:00:00.000Z' }).success).toBe(true);
    });

    it('accepts null (unset)', () => {
      expect(projectUpdateSchema.safeParse({ startDate: null }).success).toBe(true);
    });

    it('rejects an unparseable date string', () => {
      expect(projectUpdateSchema.safeParse({ startDate: 'not-a-date' }).success).toBe(false);
    });
  });

  describe('roadmapLaneCreateSchema / roadmapLaneUpdateSchema', () => {
    it('accepts a valid create payload', () => {
      expect(roadmapLaneCreateSchema.safeParse({ name: 'Backend' }).success).toBe(true);
    });

    it('rejects an unlisted field (strict)', () => {
      const result = roadmapLaneCreateSchema.safeParse({ name: 'Backend', id: 1 });
      expect(result.success).toBe(false);
    });

    it('update accepts a partial payload', () => {
      expect(roadmapLaneUpdateSchema.safeParse({ displayOrder: 2 }).success).toBe(true);
    });

    it('update rejects an unlisted field (strict)', () => {
      expect(roadmapLaneUpdateSchema.safeParse({ projectId: 1 }).success).toBe(false);
    });
  });

  describe('roadmapItemCreateSchema — periodCount rule', () => {
    it('accepts a bar with periodCount >= 1', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Build',
        kind: 'bar',
        startPeriod: 1,
        periodCount: 3,
      });
      expect(result.success).toBe(true);
    });

    it('defaults to a bar when kind is omitted, so periodCount 0 is rejected', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Build',
        startPeriod: 1,
        periodCount: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a bar with periodCount 0', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Build',
        kind: 'bar',
        startPeriod: 1,
        periodCount: 0,
      });
      expect(result.success).toBe(false);
    });

    it('accepts a milestone with periodCount exactly 0', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Launch',
        kind: 'milestone',
        startPeriod: 5,
        periodCount: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a milestone with a non-zero periodCount', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Launch',
        kind: 'milestone',
        startPeriod: 5,
        periodCount: 2,
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unlisted field (strict)', () => {
      const result = roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'Build',
        startPeriod: 1,
        periodCount: 1,
        projectId: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('roadmapItemUpdateSchema — periodCount rule', () => {
    it('accepts a partial payload touching only one field', () => {
      expect(roadmapItemUpdateSchema.safeParse({ startPeriod: 4 }).success).toBe(true);
      expect(roadmapItemUpdateSchema.safeParse({ periodCount: 0 }).success).toBe(true);
    });

    it('when both kind and periodCount arrive together, enforces the pairing', () => {
      expect(
        roadmapItemUpdateSchema.safeParse({ kind: 'bar', periodCount: 0 }).success
      ).toBe(false);
      expect(
        roadmapItemUpdateSchema.safeParse({ kind: 'milestone', periodCount: 0 }).success
      ).toBe(true);
      expect(
        roadmapItemUpdateSchema.safeParse({ kind: 'milestone', periodCount: 3 }).success
      ).toBe(false);
    });

    it('rejects an unlisted field (strict)', () => {
      expect(roadmapItemUpdateSchema.safeParse({ id: 1 }).success).toBe(false);
    });

    it('accepts a palette colour and rejects an unknown hex', () => {
      expect(roadmapItemUpdateSchema.safeParse({ color: '#417B9E' }).success).toBe(true);
      expect(roadmapItemUpdateSchema.safeParse({ color: '#8F4F8F' }).success).toBe(true);
      expect(roadmapItemUpdateSchema.safeParse({ color: '#E3F2FD' }).success).toBe(false);
      expect(roadmapItemUpdateSchema.safeParse({ color: '#1d4ed8' }).success).toBe(false);
      expect(roadmapItemUpdateSchema.safeParse({ color: '#ff00aa' }).success).toBe(false);
      expect(roadmapItemUpdateSchema.safeParse({ color: 'red' }).success).toBe(false);
      expect(roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'API',
        startPeriod: 1,
        periodCount: 2,
        color: '#417B9E',
      }).success).toBe(true);
      expect(roadmapItemCreateSchema.safeParse({
        laneId: 1,
        name: 'API',
        startPeriod: 1,
        periodCount: 2,
      }).success).toBe(true);
    });
  });

  describe('roadmapLinksReplaceSchema', () => {
    it('accepts an empty wbsItemIds array', () => {
      const result = roadmapLinksReplaceSchema.safeParse({ wbsItemIds: [] });
      expect(result.success).toBe(true);
    });

    it('accepts a populated array', () => {
      expect(roadmapLinksReplaceSchema.safeParse({ wbsItemIds: [1, 2, 3] }).success).toBe(true);
    });

    it('rejects a non-positive id', () => {
      expect(roadmapLinksReplaceSchema.safeParse({ wbsItemIds: [0] }).success).toBe(false);
    });

    it('rejects an unlisted field (strict)', () => {
      expect(roadmapLinksReplaceSchema.safeParse({ wbsItemIds: [], roadmapItemId: 1 }).success).toBe(false);
    });
  });

  describe('wbsRoadmapLinkSchema', () => {
    it('accepts a positive id', () => {
      expect(wbsRoadmapLinkSchema.safeParse({ roadmapItemId: 5 }).success).toBe(true);
    });

    it('accepts null (unlink)', () => {
      expect(wbsRoadmapLinkSchema.safeParse({ roadmapItemId: null }).success).toBe(true);
    });

    it('rejects a missing field (not optional)', () => {
      expect(wbsRoadmapLinkSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('bootstrapRoadmapSchema', () => {
    it('accepts a valid bootstrap preview payload', () => {
      const result = bootstrapRoadmapSchema.safeParse({
        lanes: [
          {
            name: 'Platform',
            items: [{ name: 'Backend', startPeriod: 1, periodCount: 4, wbsItemIds: [2] }],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a lane with zero items', () => {
      const result = bootstrapRoadmapSchema.safeParse({ lanes: [{ name: 'Platform', items: [] }] });
      expect(result.success).toBe(true);
    });

    it('rejects an item with an empty wbsItemIds array', () => {
      const result = bootstrapRoadmapSchema.safeParse({
        lanes: [{ name: 'Platform', items: [{ name: 'Backend', startPeriod: 1, periodCount: 4, wbsItemIds: [] }] }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unlisted field (strict)', () => {
      const result = bootstrapRoadmapSchema.safeParse({
        lanes: [{ name: 'Platform', items: [], id: 1 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('roadmapReorderSchema', () => {
    it('accepts a lanes-only payload', () => {
      expect(roadmapReorderSchema.safeParse({ lanes: [{ id: 1, displayOrder: 0 }] }).success).toBe(true);
    });

    it('accepts an items-only payload, startPeriod/periodCount optional', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [
          { id: 10, laneId: 1, displayOrder: 0 },
          { id: 11, laneId: 1, displayOrder: 1, startPeriod: 3, periodCount: 2 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts both lanes and items in one payload', () => {
      const result = roadmapReorderSchema.safeParse({
        lanes: [{ id: 1, displayOrder: 0 }],
        items: [{ id: 10, laneId: 1, displayOrder: 0 }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty payload (neither lanes nor items)', () => {
      expect(roadmapReorderSchema.safeParse({}).success).toBe(false);
      expect(roadmapReorderSchema.safeParse({ lanes: [], items: [] }).success).toBe(false);
    });

    it('rejects duplicate ids within lanes', () => {
      const result = roadmapReorderSchema.safeParse({
        lanes: [
          { id: 1, displayOrder: 0 },
          { id: 1, displayOrder: 1 },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects duplicate ids within items', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [
          { id: 10, laneId: 1, displayOrder: 0 },
          { id: 10, laneId: 1, displayOrder: 1 },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a negative displayOrder', () => {
      expect(roadmapReorderSchema.safeParse({ lanes: [{ id: 1, displayOrder: -1 }] }).success).toBe(false);
    });

    it('rejects an unlisted field on an item row (strict)', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [{ id: 10, laneId: 1, displayOrder: 0, kind: 'bar' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a gap in a lane\'s displayOrder sequence (must be contiguous 0..n-1)', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [
          { id: 10, laneId: 1, displayOrder: 0 },
          { id: 11, laneId: 1, displayOrder: 2 }, // skips 1
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a duplicate displayOrder within the same lane, even with distinct ids', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [
          { id: 10, laneId: 1, displayOrder: 0 },
          { id: 11, laneId: 1, displayOrder: 0 },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a gap in the lanes array\'s displayOrder sequence', () => {
      const result = roadmapReorderSchema.safeParse({
        lanes: [
          { id: 1, displayOrder: 0 },
          { id: 2, displayOrder: 2 },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('checks each lane\'s displayOrder sequence independently', () => {
      const result = roadmapReorderSchema.safeParse({
        items: [
          { id: 10, laneId: 1, displayOrder: 0 },
          { id: 11, laneId: 1, displayOrder: 1 },
          { id: 20, laneId: 2, displayOrder: 0 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});
