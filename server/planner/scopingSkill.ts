/**
 * Runtime loader for the team-scoping skill (methodology / system prompt).
 *
 * Policy text lives in skills/team-scoping/SKILL.md so delivery experts can
 * evolve methodology without changing application code.
 */

import { readFile, stat } from 'fs/promises';
import path from 'path';

/** Canonical skill location (convention over configuration). */
export const SKILL_DIR = 'skills/team-scoping';

export interface ScopingSkill {
  systemPrompt: string;
  version: string;
}

/** Embedded fallback when SKILL.md cannot be read. */
export const FALLBACK_SYSTEM_PROMPT = `You are scoping a delivery team. Work in two steps and emit them in order.

**Step 1 — disciplines.** From the supplied discipline list, choose only the disciplines this project actually needs. Pick a specialized discipline (Salesforce, AEM, Blockchain, ML/Data Science, Data & Analytics, Security) **only** when the description explicitly implies it. State a one-line \`teamShape\` justifying the set.

**Step 2 — roles & seniority within each chosen discipline.** For each discipline, pick concrete roles from the menu and decide seniority and headcount:

- **Seniority is a pyramid.** Lead with \`middle\` as the backbone; add \`strong_middle\`/\`senior\` for complexity, risk, or client-facing depth; add \`junior\`/\`strong_junior\` to scale volume cheaply. Do **not** staff an all-senior team, and do not put a \`junior\` alone on a discipline with no \`middle\`+ above them.
- **Seniority follows project signals:** greenfield/ambiguous scope or regulated domains → weight \`senior\`/\`strong_middle\` and add an \`architect\`; well-defined, high-volume build → more \`middle\`/\`strong_junior\`.
- **One leadership anchor per significant workstream:** ~1 \`architect\` (or \`lead\`) where there is real technical risk or >~4 ICs in a discipline; do not add architects to tiny teams.
- **Cross-cutting roles:** ~1 PM/Delivery for the engagement; QA roughly 1 per 3–4 development ICs; a BA/Discovery role when requirements are unclear.
- **Headcount** scales with scope and phase length; prefer fewer, appropriately-senior people over many juniors when the timeline is short.

Then assign per-phase allocations with realistic ramps across the project's phases (exact names are listed in the user prompt). Typical patterns:
- Early / discovery-style phases — BA, Architect, Design high; development low/0.
- Build phases — development peaks; QA ramps up; BA/Design taper.
- Launch / stabilization — QA + DevOps peak; development tapers; PM steady across all phases.

Every role you emit must belong to one of your Step-1 disciplines. Pick roles only from the provided menu. For each role, include a short \`rationale\` (one line, shown in the review UI). In \`phaseAllocations.phase\`, use only the exact phase names from the project context — never invent or rename phases. Set \`phases\` to null unless you are proposing a new timeline structure.`;

const FALLBACK_VERSION = '0.0.0-fallback';

function resolveSkillDir(): string {
  return path.join(process.cwd(), SKILL_DIR);
}

interface SkillCache {
  skill: ScopingSkill;
  mtimeMs: number;
}

let cache: SkillCache | undefined;

function isCanonicalSkillDir(dir: string): boolean {
  return path.resolve(dir) === path.resolve(process.cwd(), SKILL_DIR);
}

async function readSkillFromDir(dir: string): Promise<ScopingSkill> {
  const skillPath = path.join(dir, 'SKILL.md');
  const metaPath = path.join(dir, 'skill.json');

  const [skillText, metaRaw] = await Promise.all([
    readFile(skillPath, 'utf-8'),
    readFile(metaPath, 'utf-8'),
  ]);

  const meta = JSON.parse(metaRaw) as { version?: string };

  return {
    systemPrompt: skillText.trim(),
    version: meta.version ?? 'unknown',
  };
}

/**
 * Load scoping skill from an explicit directory. Used by tests and
 * {@link getScopingSkill} (canonical path).
 */
export async function loadScopingSkillFromDir(dir: string): Promise<ScopingSkill> {
  try {
    const skillPath = path.join(dir, 'SKILL.md');
    const { mtimeMs } = await stat(skillPath);

    if (cache && cache.mtimeMs === mtimeMs && isCanonicalSkillDir(dir)) {
      return cache.skill;
    }

    const skill = await readSkillFromDir(dir);
    if (isCanonicalSkillDir(dir)) {
      cache = { skill, mtimeMs };
    }
    return skill;
  } catch (err) {
    console.warn('[scopingSkill] failed to load; using fallback:', err);
    return {
      systemPrompt: FALLBACK_SYSTEM_PROMPT,
      version: FALLBACK_VERSION,
    };
  }
}

/** Load the canonical team-scoping skill (mtime-aware cache). */
export async function getScopingSkill(): Promise<ScopingSkill> {
  return loadScopingSkillFromDir(resolveSkillDir());
}

/** Test-only: clears the memoized skill cache. */
export function __resetScopingSkillCache(): void {
  cache = undefined;
}
