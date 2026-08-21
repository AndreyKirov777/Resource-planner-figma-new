import { z } from 'zod';

// Whitelisted schemas for API input — no id, createdAt, updatedAt, or relation IDs from client

const phaseSchema = z.object({
  name: z.string().min(1).max(200),
  periodCount: z.number().int().min(1).max(104).optional(),
  weekCount: z.number().int().min(1).max(104).optional(), // backward compat
  color: z.string().max(30).optional(),
}).refine(data => (data.periodCount ?? data.weekCount) !== undefined, {
  message: 'Either periodCount or weekCount must be provided',
});

const phasesStringSchema = z
  .string()
  .optional()
  .nullable()
  .refine(
    (val) => {
      if (val == null || val === '') return true;
      try {
        const parsed = JSON.parse(val);
        return (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((p: any) => phaseSchema.safeParse(p).success)
        );
      } catch {
        return false;
      }
    },
    { message: 'phases must be a JSON array of { name, periodCount }' }
  );

// ISO date (or null) anchoring period 1 for the roadmap's calendar labels.
const startDateSchema = z
  .string()
  .max(40)
  .nullable()
  .optional()
  .refine((val) => val == null || val === '' || !Number.isNaN(new Date(val).getTime()), {
    message: 'startDate must be a valid date or null',
  });

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  daysInFTE: z.number().int().min(1).max(365).optional(),
  clientCurrency: z.string().max(10).optional(),
  exchangeRate: z.number().min(0).optional(),
  defaultMargin: z.number().min(0).max(100).optional().nullable(),
  planningMode: z.enum(['weekly', 'monthly']).optional(),
  defaultLocation: z.string().max(50).optional().nullable(),
  phases: phasesStringSchema,
  startDate: startDateSchema,
}).strict();

export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  daysInFTE: z.number().int().min(1).max(365).optional(),
  clientCurrency: z.string().max(10).optional(),
  exchangeRate: z.number().min(0).optional(),
  defaultMargin: z.number().min(0).max(100).optional().nullable(),
  planningMode: z.enum(['weekly', 'monthly']).optional(),
  defaultLocation: z.string().max(50).optional().nullable(),
  phases: phasesStringSchema,
  startDate: startDateSchema,
}).strict();

export const rateCardUpdateSchema = z.object({
  role: z.string().max(500).optional(),
  namingInPM: z.string().max(500).optional(),
  discipline: z.string().max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  ukraine: z.number().optional(),
  easternEurope: z.number().optional(),
  asiaGE: z.number().optional(),
  asiaARMKZ: z.number().optional(),
  latam: z.number().optional(),
  mexico: z.number().optional(),
  india: z.number().optional(),
  newYork: z.number().optional(),
  london: z.number().optional(),
}).strict();

export const resourceListCreateSchema = z.object({
  role: z.string().min(1).max(500),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intRate: z.number().optional(),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
}).strict();

export const resourceListUpdateSchema = z.object({
  role: z.string().min(1).max(500).optional(),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intRate: z.number().optional(),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
}).strict();

export const allocationSchema = z.object({
  periodNumber: z.number().int().min(1),
  allocation: z.number().int().min(0).max(100),
}).strict();

export const resourcePlanCreateSchema = z.object({
  role: z.string().min(1).max(500),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intHourlyRate: z.number().optional(),
  clientHourlyRate: z.number().optional(),
  displayOrder: z.number().int().min(0).optional(),
  allocations: z.array(allocationSchema).optional(),
}).strict();

export const resourcePlanUpdateSchema = z.object({
  role: z.string().min(1).max(500).optional(),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intHourlyRate: z.number().optional(),
  clientHourlyRate: z.number().optional(),
  displayOrder: z.number().int().min(0).optional(),
  allocations: z.array(allocationSchema).optional(),
}).strict();

export const reorderSchema = z.object({
  orderedIds: z.array(z.number().int().positive()).min(1),
}).strict();

export const allocationUpdateSchema = z.object({
  periodNumber: z.number().int().min(1).optional(),
  allocation: z.number().int().min(0).max(100).optional(),
}).strict();

export const convertPlanningModeSchema = z.object({
  targetMode: z.enum(['weekly', 'monthly']),
}).strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type RateCardUpdateInput = z.infer<typeof rateCardUpdateSchema>;
export type ResourceListCreateInput = z.infer<typeof resourceListCreateSchema>;
export type ResourceListUpdateInput = z.infer<typeof resourceListUpdateSchema>;
export type ResourcePlanCreateInput = z.infer<typeof resourcePlanCreateSchema>;
export type ResourcePlanUpdateInput = z.infer<typeof resourcePlanUpdateSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;

// ---------------------------------------------------------------------------
// Goal 1b — generate-plan endpoint request schema
// ---------------------------------------------------------------------------

const RATE_CARD_REGIONS = [
  'ukraine',
  'easternEurope',
  'asiaGE',
  'asiaARMKZ',
  'latam',
  'mexico',
  'india',
  'newYork',
  'london',
] as const;

export const generatePlanRequestSchema = z
  .object({
    mode: z.enum(['current', 'new']),
    projectId: z.number().int().positive().optional(),
    description: z.string().min(1).max(4000),
    region: z.enum(RATE_CARD_REGIONS),
    applyProposedPhases: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) => d.mode !== 'current' || d.projectId != null,
    {
      message: 'projectId is required when mode is "current"',
      path: ['projectId'],
    },
  );

export type GeneratePlanRequestInput = z.infer<typeof generatePlanRequestSchema>;

// ---------------------------------------------------------------------------
// WBS-1 — WbsItem / WbsEstimate request schemas
// ---------------------------------------------------------------------------

export const wbsEstimateSchema = z.object({
  discipline: z.string().min(1).max(200),
  role: z.string().max(500).default(''),
  hours: z.number().finite().min(0),
}).strict();

// Rejects duplicate (discipline, role) pairs within one array. Such a payload
// would otherwise pass per-item validation but violate
// @@unique([wbsItemId, discipline, role]) at the DB layer — for the bulk-replace
// endpoint (delete-then-recreate, not $transaction per this feature's convention)
// that would delete existing estimates and then fail to recreate them, losing
// data. Reject at the validation layer instead, before any DB call happens.
function refineNoDuplicateEstimatePairs(
  estimates: Array<{ discipline: string; role: string }>,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  estimates.forEach((e, i) => {
    const key = JSON.stringify([e.discipline, e.role]);
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate estimate for discipline "${e.discipline}" / role "${e.role}"`,
        path: [i],
      });
    }
    seen.add(key);
  });
}

export const wbsItemCreateSchema = z.object({
  name: z.string().min(1).max(500),
  parentId: z.number().int().positive().optional().nullable(),
  phaseName: z.string().max(200).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  estimates: z.array(wbsEstimateSchema).optional().superRefine((val, ctx) => {
    if (val) refineNoDuplicateEstimatePairs(val, ctx);
  }),
}).strict();

export const wbsItemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  parentId: z.number().int().positive().optional().nullable(),
  phaseName: z.string().max(200).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
}).strict();

// PUT /api/wbs-items/:id/estimates — bulk-replace payload is a raw array (delete-then-recreate).
export const wbsEstimatesReplaceSchema = z.array(wbsEstimateSchema).superRefine(refineNoDuplicateEstimatePairs);

export type WbsEstimateInput = z.infer<typeof wbsEstimateSchema>;
export type WbsItemCreateInput = z.infer<typeof wbsItemCreateSchema>;
export type WbsItemUpdateInput = z.infer<typeof wbsItemUpdateSchema>;

// ---------------------------------------------------------------------------
// Project Roadmap (Slice A) — see _bmad-output/specs/spec-roadmap/data-model.md
// ---------------------------------------------------------------------------

export const roadmapLaneCreateSchema = z.object({
  name: z.string().min(1).max(500),
}).strict();

export const roadmapLaneUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
}).strict();

const roadmapItemKindSchema = z.enum(['bar', 'milestone']);

// periodCount must be >= 1 for a bar, exactly 0 for a milestone.
function refineRoadmapItemPeriodCount(
  kind: 'bar' | 'milestone',
  periodCount: number,
  ctx: z.RefinementCtx,
) {
  if (kind === 'bar' && periodCount < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodCount must be >= 1 for a bar',
      path: ['periodCount'],
    });
  }
  if (kind === 'milestone' && periodCount !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodCount must be 0 for a milestone',
      path: ['periodCount'],
    });
  }
}

export const roadmapItemCreateSchema = z.object({
  laneId: z.number().int().positive(),
  name: z.string().min(1).max(500),
  kind: roadmapItemKindSchema.optional(),
  startPeriod: z.number().int().min(1),
  periodCount: z.number().int().min(0),
}).strict().superRefine((data, ctx) => {
  refineRoadmapItemPeriodCount(data.kind ?? 'bar', data.periodCount, ctx);
});

// Partial update: the kind/periodCount pairing is only checkable here when BOTH
// arrive in the same payload. A patch that changes only one of the two is
// re-validated by the server against the merged (existing + patch) row —
// the schema alone cannot see the row's current kind.
export const roadmapItemUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  laneId: z.number().int().positive().optional(),
  kind: roadmapItemKindSchema.optional(),
  startPeriod: z.number().int().min(1).optional(),
  periodCount: z.number().int().min(0).optional(),
  displayOrder: z.number().int().min(0).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.kind !== undefined && data.periodCount !== undefined) {
    refineRoadmapItemPeriodCount(data.kind, data.periodCount, ctx);
  }
});

// PUT /api/roadmap-items/:id/links — replace an item's DIRECT links. An empty
// array is a valid "unlink everything" request.
export const roadmapLinksReplaceSchema = z.object({
  wbsItemIds: z.array(z.number().int().positive()),
}).strict();

// PUT /api/wbs-items/:id/roadmap-link — the WBS-side edit; null unlinks.
export const wbsRoadmapLinkSchema = z.object({
  roadmapItemId: z.number().int().positive().nullable(),
}).strict();

// POST /api/projects/:id/roadmap/bulk — the bootstrapRoadmap preview shape.
export const bootstrapRoadmapItemSchema = z.object({
  name: z.string().min(1).max(500),
  startPeriod: z.number().int().min(1),
  periodCount: z.number().int().min(1), // bootstrap only ever creates bars
  wbsItemIds: z.array(z.number().int().positive()).min(1),
}).strict();

export const bootstrapRoadmapLaneSchema = z.object({
  name: z.string().min(1).max(500),
  items: z.array(bootstrapRoadmapItemSchema),
}).strict();

export const bootstrapRoadmapSchema = z.object({
  lanes: z.array(bootstrapRoadmapLaneSchema),
}).strict();

export type RoadmapLaneCreateInput = z.infer<typeof roadmapLaneCreateSchema>;
export type RoadmapLaneUpdateInput = z.infer<typeof roadmapLaneUpdateSchema>;
export type RoadmapItemCreateInput = z.infer<typeof roadmapItemCreateSchema>;
export type RoadmapItemUpdateInput = z.infer<typeof roadmapItemUpdateSchema>;
export type RoadmapLinksReplaceInput = z.infer<typeof roadmapLinksReplaceSchema>;
export type WbsRoadmapLinkInput = z.infer<typeof wbsRoadmapLinkSchema>;
export type BootstrapRoadmapInput = z.infer<typeof bootstrapRoadmapSchema>;
