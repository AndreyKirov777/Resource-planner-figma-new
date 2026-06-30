/**
 * Rate card utilities: taxonomy normalization, role/discipline enum builders,
 * grouped menu renderer, and rate resolver.
 *
 * Critical taxonomy gotcha (§7.4):
 *   In the role *name*, "Senior X" = strong_middle and "Principal X" = senior.
 *   Never derive seniority from the role-name prefix alone — normalize from namingInPM first.
 */

export interface Taxonomy {
  discipline: string;
  track: 'ic' | 'lead' | 'architect';
  seniority: 'junior' | 'strong_junior' | 'middle' | 'strong_middle' | 'senior' | null;
}

// The 9 region column names exactly as they appear in GlobalRateCard.
export const REGION_COLUMNS = [
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

export type Region = (typeof REGION_COLUMNS)[number];

/**
 * Normalizes a GlobalRateCard row into a canonical {discipline, track, seniority}.
 *
 * Rules (in precedence order):
 * 1. Non-empty namingInPM → primary signal for IC seniority and lead/architect track.
 * 2. Empty namingInPM → classify from role name keywords.
 */
export function normalizeTaxonomy(row: {
  role: string;
  namingInPM: string;
  discipline: string;
}): Taxonomy {
  const discipline = row.discipline;

  // Normalize namingInPM: trim, lowercase, collapse multiple spaces.
  const raw = (row.namingInPM ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  if (raw !== '') {
    // Lead/architect labels — track from namingInPM, seniority null.
    if (
      raw === 'team lead' ||
      raw === 'expert/lead' ||
      raw === 'senior lead' ||
      raw === 'middle lead' ||
      raw.startsWith('lead')
    ) {
      return { discipline, track: 'lead', seniority: null };
    }

    if (
      raw === 'architect' ||
      raw === 'middle architect' ||
      raw === 'senior architect'
    ) {
      return { discipline, track: 'architect', seniority: null };
    }

    // Combined/fork bands → lower rung.
    if (
      raw === 'junior/strong junior' ||
      raw === 'junior - strong junior'
    ) {
      return { discipline, track: 'ic', seniority: 'junior' };
    }

    if (raw === 'strong middle/senior' || raw === 'strong middle / senior') {
      return { discipline, track: 'ic', seniority: 'strong_middle' };
    }

    // Standard IC rungs.
    if (raw === 'junior') return { discipline, track: 'ic', seniority: 'junior' };
    if (raw === 'strong junior') return { discipline, track: 'ic', seniority: 'strong_junior' };
    if (raw === 'middle') return { discipline, track: 'ic', seniority: 'middle' };
    if (raw === 'strong middle') return { discipline, track: 'ic', seniority: 'strong_middle' };
    if (raw === 'senior') return { discipline, track: 'ic', seniority: 'senior' };

    // Any other non-empty namingInPM (e.g. "Tech Writer", "Solution consultant") →
    // IC, fall through to role-name prefix below for seniority.
  }

  // Empty namingInPM (or unrecognized value): classify from role name.
  const roleName = row.role;

  if (/Team Lead|Manager/i.test(roleName)) {
    return { discipline, track: 'lead', seniority: null };
  }

  if (/Architect/i.test(roleName)) {
    return { discipline, track: 'architect', seniority: null };
  }

  // IC track — derive seniority from role-name prefix.
  // "Associate … L1" → junior
  if (/^Associate\b.*L1\b/i.test(roleName)) {
    return { discipline, track: 'ic', seniority: 'junior' };
  }
  // "Associate … L2" → strong_junior
  if (/^Associate\b.*L2\b/i.test(roleName)) {
    return { discipline, track: 'ic', seniority: 'strong_junior' };
  }
  // "Principal …" → senior  (must come before "Senior …" check)
  if (/^Principal\b/i.test(roleName)) {
    return { discipline, track: 'ic', seniority: 'senior' };
  }
  // "Senior …" → strong_middle  (NOT senior — critical gotcha)
  if (/^Senior\b/i.test(roleName)) {
    return { discipline, track: 'ic', seniority: 'strong_middle' };
  }

  // No recognized prefix → middle
  return { discipline, track: 'ic', seniority: 'middle' };
}

/**
 * Returns a sorted, deduplicated array of all role strings from the rows.
 */
export function buildRoleEnum(rows: Array<{ role: string }>): string[] {
  return [...new Set(rows.map((r) => r.role))].sort();
}

/**
 * Returns a sorted, deduplicated array of all discipline strings from the rows.
 */
export function buildDisciplineEnum(rows: Array<{ discipline: string }>): string[] {
  return [...new Set(rows.map((r) => r.discipline))].sort();
}

function seniorityTag(tax: Taxonomy): string {
  if (tax.track === 'lead') return 'lead';
  if (tax.track === 'architect') return 'architect';
  return tax.seniority ?? 'ic';
}

/**
 * Builds a discipline-grouped, human-readable menu string for the LLM prompt.
 * Each role line: "  - {role} [{seniority tag}] — {rate}"
 */
export function buildGroupedMenu(
  rows: Array<{ role: string; discipline: string; namingInPM: string; [key: string]: unknown }>,
  region: string,
): string {
  // Group rows by discipline.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const disc = row.discipline;
    if (!groups.has(disc)) groups.set(disc, []);
    groups.get(disc)!.push(row);
  }

  // Sort disciplines alphabetically.
  const sortedDisciplines = [...groups.keys()].sort();

  const lines: string[] = [];
  for (const disc of sortedDisciplines) {
    lines.push(`### ${disc}`);
    const discRows = groups.get(disc)!;
    for (const row of discRows) {
      const tax = normalizeTaxonomy({
        role: row.role,
        namingInPM: row.namingInPM,
        discipline: row.discipline,
      });
      const tag = seniorityTag(tax);
      const rate = row[region];
      const rateStr = typeof rate === 'number' ? `$${rate}/h` : 'N/A';
      lines.push(`  - ${row.role} [${tag}] — ${rateStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Resolves the internal hourly rate for a given role and region.
 * Returns undefined when the role is not found in the rows.
 */
export function resolveIntRate(
  rows: Array<{ role: string; [key: string]: unknown }>,
  role: string,
  region: string,
): number | undefined {
  const row = rows.find((r) => r.role === role);
  if (!row) return undefined;
  const val = row[region];
  if (typeof val !== 'number') return undefined;
  return val;
}
