import { describe, it, expect } from 'vitest';
import {
  normalizeTaxonomy,
  buildRoleEnum,
  buildDisciplineEnum,
  buildGroupedMenu,
  resolveIntRate,
} from './rateCard';

// ---------------------------------------------------------------------------
// Fixture rows — NO Prisma, NO DB access.
// ---------------------------------------------------------------------------

const FIXTURE_ROWS = [
  // IC ladder via namingInPM
  {
    id: 1,
    role: 'Associate Software Engineer L1',
    namingInPM: 'Junior',
    discipline: 'Engineering',
    description: null,
    ukraine: 20,
    easternEurope: 25,
    asiaGE: 18,
    asiaARMKZ: 16,
    latam: 22,
    mexico: 21,
    india: 15,
    newYork: 80,
    london: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    role: 'Associate Software Engineer L2',
    namingInPM: 'Strong Junior',
    discipline: 'Engineering',
    description: null,
    ukraine: 25,
    easternEurope: 30,
    asiaGE: 22,
    asiaARMKZ: 20,
    latam: 27,
    mexico: 26,
    india: 19,
    newYork: 90,
    london: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    role: 'Software Engineer',
    namingInPM: 'Middle',
    discipline: 'Engineering',
    description: null,
    ukraine: 35,
    easternEurope: 40,
    asiaGE: 30,
    asiaARMKZ: 28,
    latam: 37,
    mexico: 36,
    india: 25,
    newYork: 110,
    london: 120,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 4,
    role: 'Senior Software Engineer',
    namingInPM: 'Strong Middle',
    discipline: 'Engineering',
    description: null,
    ukraine: 45,
    easternEurope: 50,
    asiaGE: 40,
    asiaARMKZ: 38,
    latam: 47,
    mexico: 46,
    india: 33,
    newYork: 130,
    london: 145,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 5,
    role: 'Principal Software Engineer',
    namingInPM: 'Senior',
    discipline: 'Engineering',
    description: null,
    ukraine: 60,
    easternEurope: 65,
    asiaGE: 55,
    asiaARMKZ: 52,
    latam: 62,
    mexico: 61,
    india: 45,
    newYork: 160,
    london: 175,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Combined band → junior
  {
    id: 6,
    role: 'QA Engineer (combined)',
    namingInPM: 'Junior/Strong Junior',
    discipline: 'QA',
    description: null,
    ukraine: 18,
    easternEurope: 22,
    asiaGE: 16,
    asiaARMKZ: 14,
    latam: 20,
    mexico: 19,
    india: 13,
    newYork: 75,
    london: 85,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Combined band → strong_middle
  {
    id: 7,
    role: 'UX Designer',
    namingInPM: 'Strong Middle/Senior',
    discipline: 'Design',
    description: null,
    ukraine: 40,
    easternEurope: 45,
    asiaGE: 35,
    asiaARMKZ: 33,
    latam: 42,
    mexico: 41,
    india: 28,
    newYork: 120,
    london: 135,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Empty namingInPM → Team Lead → lead
  {
    id: 8,
    role: 'Engineering Team Lead',
    namingInPM: '',
    discipline: 'Engineering',
    description: null,
    ukraine: 55,
    easternEurope: 60,
    asiaGE: 50,
    asiaARMKZ: 47,
    latam: 57,
    mexico: 56,
    india: 40,
    newYork: 150,
    london: 165,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Empty namingInPM → Architect → architect
  {
    id: 9,
    role: 'Solution Architect',
    namingInPM: '',
    discipline: 'Engineering',
    description: null,
    ukraine: 70,
    easternEurope: 75,
    asiaGE: 65,
    asiaARMKZ: 62,
    latam: 72,
    mexico: 71,
    india: 55,
    newYork: 185,
    london: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Empty namingInPM + role starts with Senior → strong_middle (critical gotcha)
  {
    id: 10,
    role: 'Senior UX Designer',
    namingInPM: '',
    discipline: 'Design',
    description: null,
    ukraine: 42,
    easternEurope: 47,
    asiaGE: 37,
    asiaARMKZ: 35,
    latam: 44,
    mexico: 43,
    india: 30,
    newYork: 125,
    london: 140,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Zero-rate row
  {
    id: 11,
    role: 'Offshore Analyst',
    namingInPM: 'Middle',
    discipline: 'Analytics',
    description: null,
    ukraine: 0,
    easternEurope: 0,
    asiaGE: 0,
    asiaARMKZ: 0,
    latam: 0,
    mexico: 0,
    india: 15,
    newYork: 0,
    london: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Manager → lead (via role name)
  {
    id: 12,
    role: 'QA Manager',
    namingInPM: '',
    discipline: 'QA',
    description: null,
    ukraine: 50,
    easternEurope: 55,
    asiaGE: 45,
    asiaARMKZ: 42,
    latam: 52,
    mexico: 51,
    india: 38,
    newYork: 140,
    london: 155,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ---------------------------------------------------------------------------
// normalizeTaxonomy tests
// ---------------------------------------------------------------------------

describe('normalizeTaxonomy', () => {
  it('Junior namingInPM → {track:ic, seniority:junior}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[0]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('junior');
  });

  it('Strong Junior namingInPM → {track:ic, seniority:strong_junior}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[1]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('strong_junior');
  });

  it('Middle namingInPM → {track:ic, seniority:middle}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[2]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('middle');
  });

  it('Strong Middle namingInPM → {track:ic, seniority:strong_middle}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[3]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('strong_middle');
  });

  it('Senior namingInPM → {track:ic, seniority:senior}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[4]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('senior');
  });

  it('Combined band "Junior/Strong Junior" → {track:ic, seniority:junior}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[5]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('junior');
  });

  it('Combined band "Strong Middle/Senior" → {track:ic, seniority:strong_middle}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[6]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('strong_middle');
  });

  it('Empty namingInPM + role contains "Team Lead" → {track:lead, seniority:null}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[7]);
    expect(result.track).toBe('lead');
    expect(result.seniority).toBeNull();
  });

  it('Empty namingInPM + role contains "Architect" → {track:architect, seniority:null}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[8]);
    expect(result.track).toBe('architect');
    expect(result.seniority).toBeNull();
  });

  it('Empty namingInPM + role starts with "Senior" → {track:ic, seniority:strong_middle} (critical gotcha)', () => {
    // "Senior X" in role name = strong_middle, NOT senior
    const result = normalizeTaxonomy(FIXTURE_ROWS[9]);
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('strong_middle');
  });

  it('Empty namingInPM + role contains "Manager" → {track:lead, seniority:null}', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[11]);
    expect(result.track).toBe('lead');
    expect(result.seniority).toBeNull();
  });

  it('discipline is passed through unchanged', () => {
    const result = normalizeTaxonomy(FIXTURE_ROWS[0]);
    expect(result.discipline).toBe('Engineering');
  });

  it('team lead namingInPM → {track:lead, seniority:null}', () => {
    const result = normalizeTaxonomy({
      role: 'Software Engineer TL',
      namingInPM: 'Team lead',
      discipline: 'Engineering',
    });
    expect(result.track).toBe('lead');
    expect(result.seniority).toBeNull();
  });

  it('expert/lead namingInPM → {track:lead, seniority:null}', () => {
    const result = normalizeTaxonomy({
      role: 'BA Expert',
      namingInPM: 'Expert/Lead',
      discipline: 'BA',
    });
    expect(result.track).toBe('lead');
    expect(result.seniority).toBeNull();
  });

  it('architect namingInPM → {track:architect, seniority:null}', () => {
    const result = normalizeTaxonomy({
      role: 'Solutions Architect',
      namingInPM: 'Architect',
      discipline: 'Engineering',
    });
    expect(result.track).toBe('architect');
    expect(result.seniority).toBeNull();
  });

  it('"Junior - Strong Junior" combined band → junior', () => {
    const result = normalizeTaxonomy({
      role: 'QA Engineer',
      namingInPM: 'Junior - Strong Junior',
      discipline: 'QA',
    });
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('junior');
  });

  it('Empty namingInPM + role starts with "Principal" → senior', () => {
    const result = normalizeTaxonomy({
      role: 'Principal Designer',
      namingInPM: '',
      discipline: 'Design',
    });
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('senior');
  });

  it('Empty namingInPM + plain role name (no prefix) → middle', () => {
    const result = normalizeTaxonomy({
      role: 'Business Analyst',
      namingInPM: '',
      discipline: 'BA',
    });
    expect(result.track).toBe('ic');
    expect(result.seniority).toBe('middle');
  });
});

// ---------------------------------------------------------------------------
// buildRoleEnum tests
// ---------------------------------------------------------------------------

describe('buildRoleEnum', () => {
  it('returns unique, sorted role strings', () => {
    const roles = buildRoleEnum(FIXTURE_ROWS);
    expect(roles).toEqual([...new Set(FIXTURE_ROWS.map((r) => r.role))].sort());
  });

  it('deduplicates duplicate roles', () => {
    const rows = [
      { role: 'Developer' },
      { role: 'Developer' },
      { role: 'Analyst' },
    ];
    const result = buildRoleEnum(rows);
    expect(result).toEqual(['Analyst', 'Developer']);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildDisciplineEnum tests
// ---------------------------------------------------------------------------

describe('buildDisciplineEnum', () => {
  it('returns unique, sorted discipline strings', () => {
    const disciplines = buildDisciplineEnum(FIXTURE_ROWS);
    expect(disciplines).toEqual(
      [...new Set(FIXTURE_ROWS.map((r) => r.discipline))].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// buildGroupedMenu tests
// ---------------------------------------------------------------------------

describe('buildGroupedMenu', () => {
  it('groups rows by discipline with discipline headings', () => {
    const menu = buildGroupedMenu(FIXTURE_ROWS, 'ukraine');
    expect(menu).toContain('### Engineering');
    expect(menu).toContain('### QA');
    expect(menu).toContain('### Design');
  });

  it('includes role names with seniority tags and rates', () => {
    const menu = buildGroupedMenu(FIXTURE_ROWS, 'ukraine');
    expect(menu).toContain('Software Engineer [middle]');
    expect(menu).toContain('$35/h');
  });

  it('shows N/A for zero-rate regions when rate is 0 (shows the number)', () => {
    const menu = buildGroupedMenu(FIXTURE_ROWS, 'ukraine');
    // Zero-rate shows as $0/h (it's a valid number, just 0)
    expect(menu).toContain('Offshore Analyst');
    expect(menu).toContain('$0/h');
  });

  it('uses architect tag for architect roles', () => {
    const menu = buildGroupedMenu(FIXTURE_ROWS, 'ukraine');
    expect(menu).toContain('Solution Architect [architect]');
  });

  it('uses lead tag for lead roles', () => {
    const menu = buildGroupedMenu(FIXTURE_ROWS, 'ukraine');
    expect(menu).toContain('Engineering Team Lead [lead]');
  });
});

// ---------------------------------------------------------------------------
// resolveIntRate tests
// ---------------------------------------------------------------------------

describe('resolveIntRate', () => {
  it('returns the correct rate for a known role and region', () => {
    const rate = resolveIntRate(FIXTURE_ROWS, 'Software Engineer', 'ukraine');
    expect(rate).toBe(35);
  });

  it('returns the correct rate for another region', () => {
    const rate = resolveIntRate(FIXTURE_ROWS, 'Software Engineer', 'newYork');
    expect(rate).toBe(110);
  });

  it('returns undefined for an unknown role', () => {
    const rate = resolveIntRate(FIXTURE_ROWS, 'Does Not Exist', 'ukraine');
    expect(rate).toBeUndefined();
  });

  it('returns 0 for a zero-rate row (role exists but rate is 0)', () => {
    const rate = resolveIntRate(FIXTURE_ROWS, 'Offshore Analyst', 'ukraine');
    expect(rate).toBe(0);
  });

  it('returns the correct non-zero rate for the same zero-rate row in a different region', () => {
    const rate = resolveIntRate(FIXTURE_ROWS, 'Offshore Analyst', 'india');
    expect(rate).toBe(15);
  });
});
