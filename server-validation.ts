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
