import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { generateResourcePlan } from './generateResourcePlan';
import { StructuredValidationError } from '../llm/index';
import { APP_DEFAULTS } from '../../src/config/defaults';

// ---------------------------------------------------------------------------
// Mock model factory — returns a fixed JSON string as LLM text output.
// Shape matches MockLanguageModelV4 runtime expectations (cast as never for TS).
// ---------------------------------------------------------------------------

function mockModel(obj: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        content: [{ type: 'text', text: JSON.stringify(obj) }],
        warnings: [],
      }) as never,
  });
}

// ---------------------------------------------------------------------------
// Fixture rate card rows — no DB, no network.
// ---------------------------------------------------------------------------

const BASE_ROW = {
  id: 1,
  description: null,
  easternEurope: 40,
  asiaGE: 30,
  asiaARMKZ: 28,
  latam: 35,
  mexico: 34,
  india: 22,
  newYork: 120,
  london: 135,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const FIXTURE_ROWS = [
  {
    ...BASE_ROW,
    id: 1,
    role: 'Software Engineer',
    namingInPM: 'Middle',
    discipline: 'Engineering',
    ukraine: 35,
  },
  {
    ...BASE_ROW,
    id: 2,
    role: 'Senior Software Engineer',
    namingInPM: 'Strong Middle',
    discipline: 'Engineering',
    ukraine: 45,
  },
  {
    ...BASE_ROW,
    id: 3,
    role: 'QA Engineer',
    namingInPM: 'Middle',
    discipline: 'QA',
    ukraine: 28,
  },
  {
    ...BASE_ROW,
    id: 4,
    role: 'Project Manager',
    namingInPM: 'Middle',
    discipline: 'PM',
    ukraine: 38,
  },
  {
    ...BASE_ROW,
    id: 5,
    role: 'UX Designer',
    namingInPM: 'Middle',
    discipline: 'Design',
    ukraine: 32,
  },
];

const DEFAULT_PROJECT = {
  planningMode: 'weekly',
  defaultMargin: 45,
  exchangeRate: 1,
  phases: JSON.stringify([{ name: 'Build', periodCount: 4 }]),
};

// A minimal valid LLM output.
function makeLLMOutput(overrides: Record<string, unknown> = {}) {
  return {
    selectedDisciplines: ['Engineering'],
    teamShape: 'Build-heavy: 1 engineer',
    phases: null,
    resources: [
      {
        role: 'Software Engineer',
        count: 1,
        phaseAllocations: [{ phase: 'Build', allocation: 80 }],
        rationale: 'Core build capacity for the web app.',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateResourcePlan', () => {
  it('happy path: returns correct intHourlyRate from fixture rows', async () => {
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Build a simple web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    expect(result.draft.resourcePlans).toHaveLength(1);
    expect(result.draft.resourcePlans[0].role).toBe('Software Engineer');
    expect(result.draft.resourcePlans[0].intHourlyRate).toBe(35);
  });

  it('happy path: clientHourlyRate computed with margin ÷ 100 (not raw percentage)', async () => {
    // margin=45 → marginDecimal=0.45
    // clientHourlyRate = (35 / (1 - 0.45)) * 1 = 35 / 0.55 ≈ 63.636…
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Build a simple web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    const expectedRate = 35 / (1 - 0.45) * 1;
    expect(result.draft.resourcePlans[0].clientHourlyRate).toBeCloseTo(expectedRate, 4);
    // Sanity: should NOT be 0 (which would indicate 45 was passed raw instead of 0.45)
    expect(result.draft.resourcePlans[0].clientHourlyRate).toBeGreaterThan(0);
  });

  it('count:2 → 2 rows with distinct displayOrder values', async () => {
    const model = mockModel(
      makeLLMOutput({
        resources: [
          {
            role: 'Software Engineer',
            count: 2,
            phaseAllocations: [{ phase: 'Build', allocation: 100 }],
            rationale: 'Two engineers for parallel build work.',
          },
        ],
      }),
    );
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Build a simple web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    expect(result.draft.resourcePlans).toHaveLength(2);
    expect(result.draft.resourcePlans[0].displayOrder).toBe(0);
    expect(result.draft.resourcePlans[1].displayOrder).toBe(1);
  });

  it('project.defaultMargin = null → falls back to APP_DEFAULTS.defaultMargin', async () => {
    const model = mockModel(makeLLMOutput());
    const project = { ...DEFAULT_PROJECT, defaultMargin: null };
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project,
      description: 'Build a simple web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    // APP_DEFAULTS.defaultMargin = 45 → same as DEFAULT_PROJECT, same rate
    const expectedRate = 35 / (1 - APP_DEFAULTS.defaultMargin / 100) * 1;
    expect(result.draft.resourcePlans[0].clientHourlyRate).toBeCloseTo(expectedRate, 4);
  });

  it('project.defaultMargin = 45 → marginDecimal = 0.45 (not 45)', async () => {
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: { ...DEFAULT_PROJECT, defaultMargin: 45 },
      description: 'Test',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    // If 45 were passed raw, margin >= 1 → clientHourlyRate = 0. Must NOT be 0.
    expect(result.draft.resourcePlans[0].clientHourlyRate).toBeGreaterThan(0);
  });

  it('StructuredValidationError propagates when model returns bad JSON', async () => {
    // Return a JSON object that will fail schema validation (role not in enum)
    const badModel = mockModel({ resources: [{ role: 'UNKNOWN_ROLE_XYZ' }] });
    await expect(
      generateResourcePlan({
        rows: FIXTURE_ROWS,
        project: DEFAULT_PROJECT,
        description: 'Test',
        region: 'ukraine',
        applyProposedPhases: false,
        model: badModel,
      }),
    ).rejects.toBeInstanceOf(StructuredValidationError);
  });

  it('soft warning emitted when no PM/Delivery role is present', async () => {
    // Output only has Engineering, no PM role
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Build a web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    const hasPMWarning = result.warnings.some(
      (w) => w.toLowerCase().includes('pm') || w.toLowerCase().includes('delivery'),
    );
    expect(hasPMWarning).toBe(true);
  });

  it('soft warning emitted when no QA is present with dev roles', async () => {
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Build a web app',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    const hasQAWarning = result.warnings.some(
      (w) => w.toLowerCase().includes('qa'),
    );
    expect(hasQAWarning).toBe(true);
  });

  it('phases in draft when applyProposedPhases=true and LLM emits phases', async () => {
    const model = mockModel(
      makeLLMOutput({
        phases: [{ name: 'Discovery', periodCount: 2 }, { name: 'Build', periodCount: 4 }],
      }),
    );
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Phased project',
      region: 'ukraine',
      applyProposedPhases: true,
      model,
    });

    expect(result.draft.phases).toBeDefined();
    expect(result.draft.phases).toHaveLength(2);
  });

  it('no phases in draft when applyProposedPhases=false even if LLM emits phases', async () => {
    const model = mockModel(
      makeLLMOutput({
        phases: [{ name: 'Discovery', periodCount: 2 }],
      }),
    );
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT,
      description: 'Phased project',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    expect(result.draft.phases).toBeUndefined();
  });

  it('allocations are expanded from phaseAllocations to periodNumbers', async () => {
    const model = mockModel(makeLLMOutput());
    const result = await generateResourcePlan({
      rows: FIXTURE_ROWS,
      project: DEFAULT_PROJECT, // Build phase with 4 periods
      description: 'Test',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    const rp = result.draft.resourcePlans[0];
    // 4 periods for the Build phase at 80% each
    expect(rp.allocations).toHaveLength(4);
    expect(rp.allocations[0]).toEqual({ periodNumber: 1, allocation: 80 });
    expect(rp.allocations[3]).toEqual({ periodNumber: 4, allocation: 80 });
  });

  it('warns when resolveIntRate returns undefined (role rate missing)', async () => {
    // Add a role that exists in the output schema but has no rate row
    const sparseRows = [
      ...FIXTURE_ROWS,
      {
        ...BASE_ROW,
        id: 99,
        role: 'Rare Specialist',
        namingInPM: 'Middle',
        discipline: 'Engineering',
        ukraine: 0,
        newYork: 0,
        london: 0,
      },
    ];
    const model = mockModel(
      makeLLMOutput({
        resources: [
          {
            role: 'Rare Specialist',
            count: 1,
            phaseAllocations: [{ phase: 'Build', allocation: 50 }],
            rationale: 'Specialist role for niche requirements.',
          },
        ],
      }),
    );
    const result = await generateResourcePlan({
      rows: sparseRows,
      project: DEFAULT_PROJECT,
      description: 'Test',
      region: 'ukraine',
      applyProposedPhases: false,
      model,
    });

    // Row is included with rate 0, warning emitted
    expect(result.draft.resourcePlans).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('Rare Specialist'))).toBe(true);
  });
});
