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
  proposePhases: boolean;
  mandatedPhases?: Array<{ name: string; periodCount: number }>;
}

/**
 * Renders the user prompt combining project context, the rate-card menu,
 * and the user's description.
 */
export function renderPrompt(ctx: PromptContext, menu: string): string {
  const mandatedBlock =
    ctx.mandatedPhases && ctx.mandatedPhases.length > 0
      ? `\nUse **exactly** this timeline (do not add, remove, or rename phases):\n${ctx.mandatedPhases.map((p) => `- ${p.name}: ${p.periodCount} ${ctx.planningMode === 'monthly' ? 'months' : 'weeks'}`).join('\n')}\n`
      : '';

  const phaseInstructions = ctx.proposePhases
    ? `## Timeline proposal (required)

You must propose a new project timeline in \`phases\` before staffing roles. Split the work into 2–5 phases with realistic \`periodCount\` values (Discovery / Build / Launch-style names are fine). The sum of \`periodCount\` should be ${ctx.totalPeriods} ${ctx.planningMode === 'monthly' ? 'months' : 'weeks'} total.
${mandatedBlock}
Use the **exact** \`phases[].name\` values in every \`phaseAllocations.phase\` entry. Assign realistic ramps across those phases (not flat 100% everywhere).

Current placeholder timeline (replace with your proposal): ${ctx.phases}`
    : `- Allowed phase names (use verbatim in phaseAllocations.phase): ${ctx.phaseNames.map((n) => `"${n}"`).join(', ')}`;

  const step2 = ctx.proposePhases
    ? '2. Propose `phases`, then for each selected discipline pick roles from the menu, set count and seniority mix, and assign per-phase allocations using only your proposed phase names.'
    : '2. For each selected discipline, pick roles from the menu above, set count and seniority mix, and assign per-phase allocations using only the allowed phase names listed above.';

  return `## Project context

- Planning mode: ${ctx.planningMode}
- Total periods: ${ctx.totalPeriods}
- Phases: ${ctx.phases}
${ctx.proposePhases ? '' : phaseInstructions}
- Client currency: ${ctx.clientCurrency}
- Default margin: ${ctx.defaultMargin}%

${ctx.proposePhases ? phaseInstructions : ''}

## Project description

${ctx.description}

## Rate card menu (grouped by discipline)

${menu}

## Instructions

Follow the two-step policy in the system prompt:
1. Select the disciplines this project needs and state a one-line teamShape.
${step2}

Only pick roles listed in the menu above. Every role must belong to one of your selected disciplines.`;
}
