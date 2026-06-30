/**
 * System prompt and user prompt renderer for the resource plan generation LLM call.
 *
 * SYSTEM_PROMPT encodes the two-step selection policy (§7.5 of the spec):
 *   Step 1 — disciplines (coarse cut, reasoning axis)
 *   Step 2 — roles, seniority, headcount, and per-phase allocations within those disciplines
 */

export const SYSTEM_PROMPT = `You are scoping a delivery team. Work in two steps and emit them in order.

**Step 1 — disciplines.** From the supplied discipline list, choose only the disciplines this project actually needs. Pick a specialized discipline (Salesforce, AEM, Blockchain, ML/Data Science, Data & Analytics, Security) **only** when the description explicitly implies it. State a one-line \`teamShape\` justifying the set.

**Step 2 — roles & seniority within each chosen discipline.** For each discipline, pick concrete roles from the menu and decide seniority and headcount:

- **Seniority is a pyramid.** Lead with \`middle\` as the backbone; add \`strong_middle\`/\`senior\` for complexity, risk, or client-facing depth; add \`junior\`/\`strong_junior\` to scale volume cheaply. Do **not** staff an all-senior team, and do not put a \`junior\` alone on a discipline with no \`middle\`+ above them.
- **Seniority follows project signals:** greenfield/ambiguous scope or regulated domains → weight \`senior\`/\`strong_middle\` and add an \`architect\`; well-defined, high-volume build → more \`middle\`/\`strong_junior\`.
- **One leadership anchor per significant workstream:** ~1 \`architect\` (or \`lead\`) where there is real technical risk or >~4 ICs in a discipline; do not add architects to tiny teams.
- **Cross-cutting roles:** ~1 PM/Delivery for the engagement; QA roughly 1 per 3–4 development ICs; a BA/Discovery role when requirements are unclear.
- **Headcount** scales with scope and phase length; prefer fewer, appropriately-senior people over many juniors when the timeline is short.

Then assign per-phase allocations following the phase archetypes:
- *Discovery / Inception* — BA, Architect, Design high; development low/0.
- *Build* — development peaks; QA ramps up; BA/Design taper.
- *Stabilization / Launch* — QA + DevOps peak; development tapers; PM steady across all phases.

Every role you emit must belong to one of your Step-1 disciplines. Pick roles only from the provided menu.`;

export interface PromptContext {
  planningMode: string;
  totalPeriods: number;
  phases: string;
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
- Client currency: ${ctx.clientCurrency}
- Default margin: ${ctx.defaultMargin}%

## Project description

${ctx.description}

## Rate card menu (grouped by discipline)

${menu}

## Instructions

Follow the two-step policy in the system prompt:
1. Select the disciplines this project needs and state a one-line teamShape.
2. For each selected discipline, pick roles from the menu above, set count and seniority mix, and assign per-phase allocations.

Only pick roles listed in the menu above. Every role must belong to one of your selected disciplines.`;
}
