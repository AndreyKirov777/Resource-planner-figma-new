/**
 * Expands per-phase LLM allocations into per-period allocation rows.
 *
 * The LLM emits one allocation percentage per named phase.  This function
 * maps those phase allocations onto the concrete period numbers defined by
 * the project's phase list.
 */

export interface PhaseAllocation {
  phase: string;
  allocation: number;
}

export interface ProjectPhase {
  name: string;
  periodCount?: number;
  weekCount?: number;
}

export interface PeriodAllocation {
  periodNumber: number;
  allocation: number;
}

export interface ExpandResult {
  result: PeriodAllocation[];
  warnings: string[];
}

/**
 * Expands phase-based allocations to period-based allocations.
 *
 * @param phaseAllocations - Array from the LLM output: {phase, allocation}
 * @param projectPhases - The project's phase definitions: {name, periodCount?, weekCount?}
 * @returns {result, warnings} - result is [{periodNumber, allocation}], warnings list unmatched phases
 */
export function expandPhaseAllocations(
  phaseAllocations: PhaseAllocation[],
  projectPhases: ProjectPhase[],
): ExpandResult {
  const warnings: string[] = [];
  const result: PeriodAllocation[] = [];

  let periodOffset = 0;

  for (const projectPhase of projectPhases) {
    const periodCount = projectPhase.periodCount ?? projectPhase.weekCount ?? 0;

    // Find the matching phaseAllocation (case-insensitive).
    const match = phaseAllocations.find(
      (pa) => pa.phase.trim().toLowerCase() === projectPhase.name.trim().toLowerCase(),
    );

    if (match !== undefined) {
      for (let i = 0; i < periodCount; i++) {
        result.push({
          periodNumber: periodOffset + i + 1,
          allocation: match.allocation,
        });
      }
    }
    // If no match, no periods are emitted for this project phase (skip silently — the
    // LLM didn't mention this phase, so we don't add zero-allocation rows).

    periodOffset += periodCount;
  }

  // Warn about phaseAllocations that don't match any project phase.
  for (const pa of phaseAllocations) {
    const found = projectPhases.some(
      (pp) => pp.name.trim().toLowerCase() === pa.phase.trim().toLowerCase(),
    );
    if (!found) {
      warnings.push(
        `Phase '${pa.phase}' not found in project phases; allocation skipped`,
      );
    }
  }

  return { result, warnings };
}
