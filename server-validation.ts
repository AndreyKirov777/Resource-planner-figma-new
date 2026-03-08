import { z } from 'zod';

// Whitelisted schemas for API input — no id, createdAt, updatedAt, or relation IDs from client

const phaseSchema = z.object({
  name: z.string().min(1).max(200),
  weekCount: z.number().int().min(1).max(104),
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
          parsed.every((p) => phaseSchema.safeParse(p).success)
        );
      } catch {
        return false;
      }
    },
    { message: 'phases must be a JSON array of { name, weekCount }' }
  );

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  daysInFTE: z.number().int().min(1).max(365).optional(),
  clientCurrency: z.string().max(10).optional(),
  exchangeRate: z.number().min(0).optional(),
  defaultMargin: z.number().min(0).max(100).optional().nullable(),
  phases: phasesStringSchema,
}).strict();

export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  daysInFTE: z.number().int().min(1).max(365).optional(),
  clientCurrency: z.string().max(10).optional(),
  exchangeRate: z.number().min(0).optional(),
  defaultMargin: z.number().min(0).max(100).optional().nullable(),
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

export const weeklyAllocationSchema = z.object({
  weekNumber: z.number().int().min(1),
  allocation: z.number().int().min(0).max(100),
}).strict();

export const resourcePlanCreateSchema = z.object({
  role: z.string().min(1).max(500),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intHourlyRate: z.number().optional(),
  clientHourlyRate: z.number().optional(),
  weeklyAllocations: z.array(weeklyAllocationSchema).optional(),
}).strict();

export const resourcePlanUpdateSchema = z.object({
  role: z.string().min(1).max(500).optional(),
  clientRole: z.string().max(500).optional().nullable(),
  name: z.string().max(500).optional().nullable(),
  intHourlyRate: z.number().optional(),
  clientHourlyRate: z.number().optional(),
  weeklyAllocations: z.array(weeklyAllocationSchema).optional(),
}).strict();

export const weeklyAllocationUpdateSchema = z.object({
  weekNumber: z.number().int().min(1).optional(),
  allocation: z.number().int().min(0).max(100).optional(),
}).strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type RateCardUpdateInput = z.infer<typeof rateCardUpdateSchema>;
export type ResourceListCreateInput = z.infer<typeof resourceListCreateSchema>;
export type ResourceListUpdateInput = z.infer<typeof resourceListUpdateSchema>;
export type ResourcePlanCreateInput = z.infer<typeof resourcePlanCreateSchema>;
export type ResourcePlanUpdateInput = z.infer<typeof resourcePlanUpdateSchema>;
export type WeeklyAllocationUpdateInput = z.infer<typeof weeklyAllocationUpdateSchema>;
