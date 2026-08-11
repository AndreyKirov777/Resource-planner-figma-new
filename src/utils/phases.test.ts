import { describe, it, expect } from 'vitest';
import {
  descriptionSuggestsPhaseProposal,
  parsePhasesFromDescription,
  phaseStartOffset,
  remapPeriodNumber,
  reorderPhases,
  splitPhase,
  uniquePhaseName,
} from './phases';
import { Phase } from '../services/api';

const USER_DESCRIPTION =
  'AI process automation project. 2 weeks - discovery, 8 weeks - implementation, 1 week - UAT. ';

describe('parsePhasesFromDescription', () => {
  it('parses week-based phase lists from the generate-plan description format', () => {
    expect(parsePhasesFromDescription(USER_DESCRIPTION)).toEqual([
      { name: 'Discovery', periodCount: 2 },
      { name: 'Implementation', periodCount: 8 },
      { name: 'UAT', periodCount: 1 },
    ]);
  });

  it('returns empty array when no week-phase pattern is present', () => {
    expect(parsePhasesFromDescription('Build a simple web app')).toEqual([]);
  });
});

describe('descriptionSuggestsPhaseProposal', () => {
  it('detects explicit week-phase descriptions', () => {
    expect(descriptionSuggestsPhaseProposal(USER_DESCRIPTION)).toBe(true);
  });
});

// Discovery owns weeks 1-2, Build 3-8, UAT 9-10.
const PHASES: Phase[] = [
  { name: 'Discovery', periodCount: 2, color: '#E3F2FD' },
  { name: 'Build', periodCount: 6, color: '#FCE4EC' },
  { name: 'UAT', periodCount: 2, color: '#E8F5E9' },
];

describe('phaseStartOffset', () => {
  it('counts the periods preceding each phase', () => {
    expect(PHASES.map((_, i) => phaseStartOffset(PHASES, i))).toEqual([0, 2, 8]);
  });
});

describe('reorderPhases', () => {
  it('moves a phase and carries its periods with it', () => {
    const { phases, periodMap } = reorderPhases(PHASES, 1, 0);

    expect(phases.map((p) => p.name)).toEqual(['Build', 'Discovery', 'UAT']);
    // Build's weeks 3-8 lead the timeline as 1-6; Discovery's 1-2 follow as 7-8.
    expect([...periodMap.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 7], [2, 8],
      [3, 1], [4, 2], [5, 3], [6, 4], [7, 5], [8, 6],
      [9, 9], [10, 10],
    ]);
  });

  it('moves a phase to the end', () => {
    const { phases, periodMap } = reorderPhases(PHASES, 0, 2);
    expect(phases.map((p) => p.name)).toEqual(['Build', 'UAT', 'Discovery']);
    expect(periodMap.get(1)).toBe(9);
    expect(periodMap.get(3)).toBe(1);
    expect(periodMap.get(9)).toBe(7);
  });

  it('is a no-op for a same-position or out-of-range move', () => {
    expect(reorderPhases(PHASES, 1, 1).phases).toBe(PHASES);
    expect(reorderPhases(PHASES, -1, 0).phases).toBe(PHASES);
    expect(reorderPhases(PHASES, 0, 5).phases).toBe(PHASES);
  });

  it('preserves the timeline length and maps every period exactly once', () => {
    const { periodMap } = reorderPhases(PHASES, 2, 0);
    expect(periodMap.size).toBe(10);
    expect(new Set(periodMap.values()).size).toBe(10);
    expect(Math.max(...periodMap.values())).toBe(10);
  });

  it('tolerates the legacy weekCount field', () => {
    const legacy: Phase[] = [
      { name: 'A', weekCount: 2 },
      { name: 'B', weekCount: 3 },
    ];
    const { phases, periodMap } = reorderPhases(legacy, 1, 0);
    expect(phases.map((p) => p.name)).toEqual(['B', 'A']);
    expect(periodMap.get(3)).toBe(1);
    expect(periodMap.get(1)).toBe(4);
  });
});

describe('remapPeriodNumber', () => {
  it('leaves periods outside the map untouched', () => {
    const { periodMap } = reorderPhases(PHASES, 1, 0);
    expect(remapPeriodNumber(periodMap, 3)).toBe(1);
    expect(remapPeriodNumber(periodMap, 99)).toBe(99);
  });
});

describe('uniquePhaseName', () => {
  it('suffixes until the name is free', () => {
    expect(uniquePhaseName('Build', ['Build'])).toBe('Build 2');
    expect(uniquePhaseName('Build', ['Build', 'Build 2'])).toBe('Build 3');
  });
});

describe('splitPhase', () => {
  it('splits at the given period without changing the timeline length', () => {
    const next = splitPhase(PHASES, 1, 5); // Build (weeks 3-8), new phase starts week 6

    expect(next.map((p) => [p.name, p.periodCount])).toEqual([
      ['Discovery', 2],
      ['Build', 3],
      ['Build 2', 3],
      ['UAT', 2],
    ]);
    const totalBefore = PHASES.reduce((s, p) => s + (p.periodCount ?? 0), 0);
    expect(next.reduce((s, p) => s + (p.periodCount ?? 0), 0)).toBe(totalBefore);
  });

  it('gives the new phase an unused color', () => {
    const next = splitPhase(PHASES, 1, 5);
    expect(next[2].color).toBeDefined();
    expect(next.slice(0, 2).map((p) => p.color)).not.toContain(next[2].color);
  });

  it('refuses split points that would leave a half empty', () => {
    expect(splitPhase(PHASES, 1, 2)).toBe(PHASES); // before the phase starts
    expect(splitPhase(PHASES, 1, 8)).toBe(PHASES); // at the phase end
    expect(splitPhase(PHASES, 0, 2)).toBe(PHASES); // single-period remainder
    expect(splitPhase(PHASES, 9, 3)).toBe(PHASES); // no such phase
  });
});
