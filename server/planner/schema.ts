import { z } from 'zod';

/**
 * Builds the Zod output schema for the LLM's structured response.
 *
 * The role enum is built at request time from the live rate card — the model
 * cannot emit an unknown role, and the SDK rejects one if it tries.
 * Similarly, the discipline enum is built from the live distinct disciplines,
 * and the phase enum from the project's phase names.
 */
export function buildOutputSchema(
  roleEnum: [string, ...string[]],
  disciplineEnum: [string, ...string[]],
  phaseEnum: [string, ...string[]],
) {
  return z
    .object({
      // STEP 1 — emitted before resources (reasoning-first)
      selectedDisciplines: z.array(z.enum(disciplineEnum)),
      teamShape: z.string(),

      // Nullable (not optional) — OpenAI strict JSON schema requires every property
      // key in `required`; use null when no timeline is proposed.
      phases: z
        .array(
          z
            .object({
              name: z.string(),
              periodCount: z.number().int().min(1),
            })
            .strict(),
        )
        .nullable(),

      // STEP 2 — roles & allocations
      resources: z.array(
        z
          .object({
            role: z.enum(roleEnum),
            count: z.number().int().min(1),
            phaseAllocations: z.array(
              z
                .object({
                  phase: z.enum(phaseEnum),
                  allocation: z.number().int().min(0).max(100),
                })
                .strict(),
            ),
            rationale: z.string(),
          })
          .strict(),
      ),
    })
    .strict();
}

export type OutputSchema = ReturnType<typeof buildOutputSchema>;
export type OutputSchemaType = z.infer<OutputSchema>;
