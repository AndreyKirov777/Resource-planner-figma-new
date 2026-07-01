/**
 * Orchestration: prompt → generateStructured → validate → assemble → return draft.
 *
 * This is the core planner service (Goal 1b). It depends only on the
 * generateStructured() seam (never on a vendor SDK directly) and on deterministic
 * helpers for rate lookups, client-rate math, and phase expansion.
 */

import type { LanguageModel } from 'ai';
import type { GlobalRateCard } from '../../src/generated/prisma';
import { generateStructured } from '../llm/index';
import { clientHourlyRate } from '../../src/utils/calculations';
import { APP_DEFAULTS } from '../../src/config/defaults';
import { resourcePlanCreateSchema } from '../../server-validation';
import {
  buildRoleEnum,
  buildDisciplineEnum,
  buildGroupedMenu,
  resolveIntRate,
  normalizeTaxonomy,
} from './rateCard';
import { buildOutputSchema } from './schema';
import { renderPrompt } from './prompt';
import { getScopingSkill } from './scopingSkill';
import { expandPhaseAllocations, resolvePlannerPhases, buildPhaseEnum } from './phases';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  planningMode: string;
  defaultMargin: number | null;
  exchangeRate: number;
  phases: string | null; // JSON string: Array<{name, periodCount?, weekCount?}>
}

interface GenerateOptions {
  rows: GlobalRateCard[];
  project: Project;
  description: string;
  region: string;
  applyProposedPhases: boolean;
  model?: LanguageModel;
}

export interface DraftResourcePlan {
  role: string;
  clientRole: null;
  name: null;
  intHourlyRate: number;
  clientHourlyRate: number;
  displayOrder: number;
  rationale?: string;
  allocations: Array<{ periodNumber: number; allocation: number }>;
}

export interface GeneratePlanResult {
  draft: {
    resourcePlans: DraftResourcePlan[];
    phases?: Array<{ name: string; periodCount: number }>;
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Describe phases as a human-readable string for the prompt. */
function describePhasesForPrompt(phases: Array<{ name: string; periodCount?: number; weekCount?: number }>): string {
  return phases
    .map((p) => `${p.name} (${p.periodCount ?? p.weekCount ?? 0} periods)`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateResourcePlan(
  opts: GenerateOptions,
): Promise<GeneratePlanResult> {
  const { rows, project, description, region, applyProposedPhases } = opts;
  const warnings: string[] = [];

  // 1. Build enums from the live rate card.
  const roleEnumArr = buildRoleEnum(rows);
  const disciplineEnumArr = buildDisciplineEnum(rows);

  if (roleEnumArr.length === 0) {
    throw new Error('Rate card is empty — cannot build role enum');
  }

  const roleEnum = roleEnumArr as [string, ...string[]];
  const disciplineEnum = disciplineEnumArr as [string, ...string[]];

  // 3. Resolve project phases (prompt, schema enum, expansion).
  const projectPhases = resolvePlannerPhases(project.phases, APP_DEFAULTS.durationPeriods);
  const total = projectPhases.reduce(
    (sum, p) => sum + (p.periodCount ?? p.weekCount ?? 0),
    0,
  );
  const phaseEnum = buildPhaseEnum(projectPhases);

  // 4. Build output schema and menu.
  const schema = buildOutputSchema(roleEnum, disciplineEnum, phaseEnum);
  const menu = buildGroupedMenu(
    rows as Array<{ role: string; discipline: string; namingInPM: string; [key: string]: unknown }>,
    region,
  );

  // 5. Render prompt.
  const marginPct = project.defaultMargin ?? APP_DEFAULTS.defaultMargin;
  const promptCtx = {
    planningMode: project.planningMode,
    totalPeriods: total,
    phases: describePhasesForPrompt(projectPhases),
    phaseNames: projectPhases.map((p) => p.name),
    clientCurrency: APP_DEFAULTS.clientCurrency,
    defaultMargin: marginPct,
    description,
  };
  const prompt = renderPrompt(promptCtx, menu);

  // 6. Load scoping methodology and call LLM.
  const scopingSkill = await getScopingSkill();
  const output = await generateStructured({
    system: scopingSkill.systemPrompt,
    prompt,
    schema,
    schemaName: 'ResourcePlanOutput',
    model: opts.model,
  });

  // 7. Assemble resource plans.
  const resourcePlans: DraftResourcePlan[] = [];
  let displayOrderCounter = 0;

  for (const resource of output.resources) {
    const { role, count, phaseAllocations, rationale } = resource;

    // Resolve int rate.
    const intRate = resolveIntRate(
      rows as Array<{ role: string; [key: string]: unknown }>,
      role,
      region,
    );
    if (intRate === undefined) {
      warnings.push(
        `Role '${role}': no rate found for region '${region}'; row included with rate 0`,
      );
    } else if (intRate === 0) {
      warnings.push(
        `Role '${role}': rate is 0 for region '${region}'; row included but may be unpriced`,
      );
    }

    const resolvedIntRate = intRate ?? 0;

    // Compute client rate (margin critical: divide by 100).
    const marginDecimal = marginPct / 100;
    const clientRate = clientHourlyRate(resolvedIntRate, marginDecimal, project.exchangeRate);

    // Expand phase allocations → period allocations.
    const defaultPhase = projectPhases;

    const { result: allocations, warnings: phaseWarnings } = expandPhaseAllocations(
      phaseAllocations,
      defaultPhase,
    );
    warnings.push(...phaseWarnings);

    // Emit `count` identical rows with separate displayOrder.
    for (let i = 0; i < count; i++) {
      const draft: DraftResourcePlan = {
        role,
        clientRole: null,
        name: null,
        intHourlyRate: resolvedIntRate,
        clientHourlyRate: clientRate,
        displayOrder: displayOrderCounter++,
        allocations,
      };
      if (rationale) draft.rationale = rationale;

      // Validate with existing gate (soft: collect warnings, still include row).
      const validation = resourcePlanCreateSchema.safeParse({
        role: draft.role,
        clientRole: draft.clientRole,
        name: draft.name,
        intHourlyRate: draft.intHourlyRate,
        clientHourlyRate: draft.clientHourlyRate,
        displayOrder: draft.displayOrder,
        allocations: draft.allocations,
      });
      if (!validation.success) {
        warnings.push(
          `Role '${role}' (copy ${i + 1}): validation issues: ${JSON.stringify(validation.error.flatten())}`,
        );
      }

      resourcePlans.push(draft);
    }

    // 7. Discipline coherence check (soft).
    const row = rows.find((r) => r.role === role);
    if (row) {
      const tax = normalizeTaxonomy(row);
      if (!output.selectedDisciplines.includes(tax.discipline)) {
        warnings.push(
          `Role '${role}' belongs to discipline '${tax.discipline}' which was not in selectedDisciplines`,
        );
      }
    }
  }

  // 8. Soft composition warnings (§8.6).
  const allRoles = resourcePlans.map((r) => r.role.toLowerCase());

  const hasBuildRoles = allRoles.some(
    (r) =>
      r.includes('developer') ||
      r.includes('engineer') ||
      r.includes('dev') ||
      r.includes('backend') ||
      r.includes('frontend') ||
      r.includes('fullstack') ||
      r.includes('qa') ||
      r.includes('tester'),
  );

  const hasPM = allRoles.some(
    (r) =>
      r.includes(' pm') ||
      r.startsWith('pm') ||
      r.includes('project manager') ||
      r.includes('delivery manager') ||
      r.includes('delivery lead') ||
      r.includes('engagement manager') ||
      r.includes('program manager'),
  );

  const hasQA = allRoles.some(
    (r) => r.includes('qa') || r.includes('quality') || r.includes('tester'),
  );

  const hasDevRoles = allRoles.some(
    (r) =>
      r.includes('developer') ||
      r.includes('engineer') ||
      r.includes('backend') ||
      r.includes('frontend') ||
      r.includes('fullstack'),
  );

  if (hasBuildRoles && !hasPM) {
    warnings.push(
      'No PM/Delivery role found while build/QA roles are present — consider adding a PM',
    );
  }

  if (hasDevRoles && !hasQA) {
    warnings.push(
      'No QA role found while development roles are present — consider adding QA coverage',
    );
  }

  // All-senior check.
  const hasNonSenior = rows.some((r) => {
    if (!allRoles.includes(r.role.toLowerCase())) return false;
    const tax = normalizeTaxonomy(r);
    return (
      tax.track !== 'lead' &&
      tax.track !== 'architect' &&
      tax.seniority !== 'senior' &&
      tax.seniority !== 'strong_middle'
    );
  });
  if (resourcePlans.length > 0 && !hasNonSenior) {
    warnings.push(
      'Team appears to be all-senior/architect — consider adding middle-level contributors',
    );
  }

  // 9. Build result.
  const result: GeneratePlanResult = {
    draft: { resourcePlans },
    warnings,
  };

  if (applyProposedPhases && output.phases && output.phases.length > 0) {
    result.draft.phases = output.phases;
  }

  return result;
}
