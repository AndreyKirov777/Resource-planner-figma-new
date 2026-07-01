/**
 * User prompt renderer for the resource plan generation LLM call.
 *
 * Team-scoping methodology (system prompt) lives in skills/team-scoping/SKILL.md
 * and is loaded at runtime by scopingSkill.ts.
 */

export interface PromptContext {
  planningMode: string;
  totalPeriods: number;
  phases: string;
  phaseNames: string[];
  clientCurrency: string;
  defaultMargin: number;
  description: string;
}

/**
 * Renders the user prompt combining project context, the rate-card menu,
 * and the user's description.
 */
export function renderPrompt(ctx: PromptContext, menu: string): string {
  return `## Project context

- Planning mode: ${ctx.planningMode}
- Total periods: ${ctx.totalPeriods}
- Phases: ${ctx.phases}
- Allowed phase names (use verbatim in phaseAllocations.phase): ${ctx.phaseNames.map((n) => `"${n}"`).join(', ')}
- Client currency: ${ctx.clientCurrency}
- Default margin: ${ctx.defaultMargin}%

## Project description

${ctx.description}

## Rate card menu (grouped by discipline)

${menu}

## Instructions

Follow the two-step policy in the system prompt:
1. Select the disciplines this project needs and state a one-line teamShape.
2. For each selected discipline, pick roles from the menu above, set count and seniority mix, and assign per-phase allocations using only the allowed phase names listed above.

Only pick roles listed in the menu above. Every role must belong to one of your selected disciplines.`;
}
