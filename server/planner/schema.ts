import { z } from 'zod';

export interface BuildOutputSchemaOptions {
  /** When true, the model may use free-form phase names in phaseAllocations. */
  proposePhases?: boolean;
  /** When true, phases must be a non-empty array (defaults to proposePhases). */
  phasesRequired?: boolean;
}

/**
 * Builds the Zod output schema for the LLM's structured response.
 *
 * The role enum is built at request time from the live rate card — the model
 * cannot emit an unknown role, and the SDK rejects one if it tries.
 * Similarly, the discipline enum is built from the live distinct disciplines,
 * and the phase enum from the project's phase names (unless proposePhases).
 */
export function buildOutputSchema(
  roleEnum: [string, ...string[]],
  disciplineEnum: [string, ...string[]],
  phaseEnum: [string, ...string[]] | null,
  options: BuildOutputSchemaOptions = {},
) {
  const proposePhases = options.proposePhases ?? false;
  const phasesRequired = options.phasesRequired ?? proposePhases;

  const phasesField = phasesRequired
    ? z
        .array(
          z
            .object({
              name: z.string().min(1),
              periodCount: z.number().int().min(1),
            })
            .strict(),
        )
        .min(1)
    : z
        .array(
          z
            .object({
              name: z.string(),
              periodCount: z.number().int().min(1),
            })
            .strict(),
        )
        .nullable();

  const phaseNameField = proposePhases
    ? z.string().min(1)
    : z.enum(phaseEnum as [string, ...string[]]);

  return z
    .object({
      // STEP 1 — emitted before resources (reasoning-first)
      selectedDisciplines: z.array(z.enum(disciplineEnum)),
      teamShape: z.string(),

      // Nullable when using existing phases; required array when proposing a timeline.
      phases: phasesField,

      // STEP 2 — roles & allocations
      resources: z.array(
        z
          .object({
            role: z.enum(roleEnum),
            count: z.number().int().min(1),
            phaseAllocations: z.array(
              z
                .object({
                  phase: phaseNameField,
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
