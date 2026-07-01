import { describe, it, expect } from 'vitest';
import {
  descriptionSuggestsPhaseProposal,
  parsePhasesFromDescription,
} from './phases';

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
