import { describe, it, expect, vi } from 'vitest';
import {
  CELL_PAD,
  CHEVRON_SIZE,
  INDENT_PX,
  MAX_HOURS,
  MAX_INDENT_DEPTH,
  MIN_LABEL_WIDTH,
  buildGridRows,
  createEstimateCommitter,
  deleteConfirmMessage,
  deriveDiscipline,
  dropPlacement,
  dropZone,
  formatHours,
  formatHoursInput,
  hitsChevron,
  hitsKebab,
  indentFor,
  indentPlacement,
  kebabLeft,
  KEBAB_SIZE,
  nameEditFor,
  nextDisplayOrder,
  newWbsItemFields,
  firstUnseenId,
  selectionAfterDelete,
  outdentPlacement,
  siblingBelowPlacement,
  structureActionFromKey,
  structureHintText,
  structureShortcutLabel,
  pairsFromEstimates,
  pairsToPayload,
  parseHours,
  phaseEditFor,
  phaseLabel,
  pruneCollapsedIds,
  resourceListRoles,
  displayedWbsRole,
  canonicalWbsRole,
  abbreviateRole,
  abbreviateRoles,
  roleEditFor,
  sameHours,
  samePairs,
  RolePair,
} from './wbsGrid';
import { WbsItem, WbsEstimate, RateCard as RateCardType, ResourceList as ResourceListType } from '../services/api';

function item(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: 1,
    name: 'Item',
    parentId: null,
    phaseName: null,
    displayOrder: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    estimates: [],
    ...overrides,
  };
}

function estimate(overrides: Partial<WbsEstimate>): WbsEstimate {
  return {
    id: 1,
    discipline: 'Engineering',
    role: 'BA',
    hours: 8,
    wbsItemId: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function rateCard(overrides: Partial<RateCardType>): RateCardType {
  return {
    id: 1,
    role: 'Role',
    namingInPM: 'Role',
    discipline: 'Engineering',
    ukraine: 0,
    easternEurope: 0,
    asiaGE: 0,
    asiaARMKZ: 0,
    latam: 0,
    mexico: 0,
    india: 0,
    newYork: 0,
    london: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('parseHours', () => {
  // Matrix row "Invalid hours": blank -> 0; negative/non-numeric reverts.
  it('treats blank (and whitespace) as 0', () => {
    expect(parseHours('')).toEqual({ ok: true, hours: 0 });
    expect(parseHours('   ')).toEqual({ ok: true, hours: 0 });
  });

  it('accepts plain decimals', () => {
    expect(parseHours('8')).toEqual({ ok: true, hours: 8 });
    expect(parseHours('7.5')).toEqual({ ok: true, hours: 7.5 });
    expect(parseHours('.5')).toEqual({ ok: true, hours: 0.5 });
    expect(parseHours(' 12 ')).toEqual({ ok: true, hours: 12 });
    expect(parseHours('0')).toEqual({ ok: true, hours: 0 });
  });

  it('rejects negatives', () => {
    expect(parseHours('-1')).toEqual({ ok: false });
    expect(parseHours('-')).toEqual({ ok: false });
  });

  // These are exactly the strings `<input type="number">` reports as '' —
  // which is why blank and invalid could not be told apart in iteration 1.
  it.each(['1e', '1e5', '1.2.3', '1,5', 'abc', '8h', 'Infinity', 'NaN', '+1'])(
    'rejects the unparseable input %j instead of silently persisting 0',
    (raw) => {
      expect(parseHours(raw)).toEqual({ ok: false });
    }
  );
});

describe('parseHours — round-trip bound', () => {
  it('accepts hours up to the ceiling', () => {
    expect(parseHours(String(MAX_HOURS))).toEqual({ ok: true, hours: MAX_HOURS });
  });

  // An accepted value that `formatHoursInput` renders unparseably would be
  // rejected on its very next commit, so the accepted range must round-trip.
  it('rejects anything past the ceiling, including magnitudes String() renders as an exponent', () => {
    expect(parseHours(String(MAX_HOURS + 1))).toEqual({ ok: false });
    expect(parseHours('1' + '0'.repeat(21))).toEqual({ ok: false });
    expect(String(1e21)).toBe('1e+21'); // ...which parseHours could never read back
  });

  it.each(['0', '0.1', '7.5', '999999.9', String(MAX_HOURS)])(
    'round-trips every accepted value %j through formatHoursInput',
    (raw) => {
      const parsed = parseHours(raw);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parseHours(formatHoursInput(parsed.hours))).toEqual({ ok: true, hours: parsed.hours });
    }
  );
});

describe('sameHours', () => {
  // A float displayed as "0.3" comes back from the input as exactly 0.3;
  // comparing with === would call that a change and issue a full
  // delete-and-recreate write for a no-op edit.
  it('treats a float and its rounded display value as equal', () => {
    expect(sameHours(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('still sees a real change', () => {
    expect(sameHours(0.3, 0.4)).toBe(false);
    expect(sameHours(16, 24)).toBe(false);
  });
});

describe('samePairs', () => {
  const ba = (hours: number): RolePair => ({ role: 'BA', discipline: 'Analysis', hours });

  it('ignores float noise the display already rounds away', () => {
    expect(samePairs([ba(0.1 + 0.2)], [ba(0.3)])).toBe(true);
  });

  it('sees added, removed and changed pairs', () => {
    expect(samePairs([ba(16)], [ba(24)])).toBe(false);
    expect(samePairs([ba(16)], [])).toBe(false);
    expect(samePairs([ba(16)], [{ role: 'UX', discipline: 'Design', hours: 16 }])).toBe(false);
  });
});

describe('roleEditFor', () => {
  const basis: RolePair[] = [
    { role: 'BA', discipline: 'Analysis', hours: 16 },
    { role: 'Removed', discipline: 'Legacy', hours: 8 },
  ];

  it('replaces one role while preserving estimates for roles no longer visible', () => {
    expect(roleEditFor('BA', '24', basis, [rateCard({ role: 'BA', discipline: 'Analysis' })])).toEqual([
      { role: 'Removed', discipline: 'Legacy', hours: 8 },
      { role: 'BA', discipline: 'Analysis', hours: 24 },
    ]);
  });

  it('adds a Resource List role using its derived discipline', () => {
    expect(roleEditFor('QA', '8', basis, [rateCard({ role: 'QA', discipline: 'Quality' })])).toEqual([
      ...basis,
      { role: 'QA', discipline: 'Quality', hours: 8 },
    ]);
  });

  it('treats blank as zero and omits the cleared pair', () => {
    expect(roleEditFor('BA', '', basis, [])).toEqual([
      { role: 'Removed', discipline: 'Legacy', hours: 8 },
    ]);
  });

  it('returns null for invalid and unchanged edits', () => {
    expect(roleEditFor('BA', '-1', basis, [])).toBeNull();
    expect(roleEditFor('BA', 'nope', basis, [])).toBeNull();
    expect(roleEditFor('BA', '16', basis, [])).toBeNull();
  });

  it('replaces a stored rate-card role when the column is the client role', () => {
    const lists = [
      resourceList({
        role: 'Principal Software Developer, Core Technologies',
        clientRole: 'Senior Developer',
      }),
    ];
    const cards = [
      rateCard({ role: 'Principal Software Developer, Core Technologies', discipline: 'Engineering' }),
    ];
    const stored: RolePair[] = [
      { role: 'Principal Software Developer, Core Technologies', discipline: 'Engineering', hours: 16 },
    ];
    expect(roleEditFor('Senior Developer', '24', stored, cards, lists)).toEqual([
      { role: 'Senior Developer', discipline: 'Engineering', hours: 24 },
    ]);
  });
});

describe('formatHours / formatHoursInput', () => {
  it('rounds display hours to one decimal', () => {
    expect(formatHours(0.1 + 0.2)).toBe('0.3');
    expect(formatHours(8)).toBe('8');
  });

  it('renders a non-finite figure as a dash', () => {
    expect(formatHours(Number.NaN)).toBe('—');
  });

  it('produces a locale-independent, re-parseable string for inputs', () => {
    expect(formatHoursInput(0.1 + 0.2)).toBe('0.3');
    expect(parseHours(formatHoursInput(7.5))).toEqual({ ok: true, hours: 7.5 });
  });
});

describe('pair helpers', () => {
  it('round-trips estimates to pairs to a replace payload', () => {
    const estimates = [
      estimate({ id: 1, discipline: 'Engineering', role: 'BA', hours: 16 }),
      estimate({ id: 2, discipline: 'Design', role: 'UX', hours: 8 }),
    ];
    const pairs = pairsFromEstimates(estimates);

    expect(pairs).toEqual([
      { role: 'BA', discipline: 'Engineering', hours: 16 },
      { role: 'UX', discipline: 'Design', hours: 8 },
    ]);
    expect(pairsToPayload(pairs)).toEqual([
      { discipline: 'Engineering', role: 'BA', hours: 16 },
      { discipline: 'Design', role: 'UX', hours: 8 },
    ]);
  });
});

function resourceList(overrides: Partial<ResourceListType>): ResourceListType {
  return {
    id: 1,
    role: 'Role',
    intRate: 0,
    projectId: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('deriveDiscipline', () => {
  it('takes the discipline from the role rate-card row', () => {
    const cards = [rateCard({ role: 'BA', discipline: 'Analysis' })];
    expect(deriveDiscipline('BA', cards)).toBe('Analysis');
  });

  // Matrix row "Empty rate card": free text, accepted by the server's bypass.
  it('falls back to the role itself when the rate card is empty', () => {
    expect(deriveDiscipline('Freelancer', [])).toBe('Freelancer');
  });

  it('resolves a client role through the Resource List rate-card role', () => {
    const cards = [rateCard({ role: 'Principal Software Developer, Core Technologies', discipline: 'Engineering' })];
    const lists = [
      resourceList({
        role: 'Principal Software Developer, Core Technologies',
        clientRole: 'Senior Developer',
      }),
    ];
    expect(deriveDiscipline('Senior Developer', cards, lists)).toBe('Engineering');
  });
});

describe('abbreviateRole', () => {
  it('keeps already-short role names', () => {
    expect(abbreviateRole('BA')).toBe('BA');
    expect(abbreviateRole('UX')).toBe('UX');
    expect(abbreviateRole('QA')).toBe('QA');
    expect(abbreviateRole('SA')).toBe('SA');
  });

  it('abbreviates client-role seniority and title stems', () => {
    expect(abbreviateRole('Junior Developer')).toBe('Jr Dev');
    expect(abbreviateRole('Strong Junior Developer')).toBe('StJr Dev');
    expect(abbreviateRole('Middle Developer')).toBe('Md Dev');
    expect(abbreviateRole('Strong Middle Developer')).toBe('StMd Dev');
    expect(abbreviateRole('Senior Developer')).toBe('Sr Dev');
    expect(abbreviateRole('Team Lead, Core Technologies')).toBe('TL CT');
    expect(abbreviateRole('Team Lead, Advanced Technologies')).toBe('TL AT');
    expect(abbreviateRole('Junior QA Engineer')).toBe('Jr QA');
    expect(abbreviateRole('Strong Junior Business Analyst')).toBe('StJr BA');
    expect(abbreviateRole('Senior Discovery Business Analyst')).toBe('Sr Disc BA');
    expect(abbreviateRole('Junior Project Manager')).toBe('Jr PM');
    expect(abbreviateRole('Strong Junior Product Owner')).toBe('StJr PO');
    expect(abbreviateRole('Junior Data Engineer')).toBe('Jr DE');
    expect(abbreviateRole('DevOps Team Lead')).toBe('TL DevOps');
    expect(abbreviateRole('DevOps Engineer')).toBe('DevOps');
    expect(abbreviateRole('Junior DevOps Engineer')).toBe('Jr DevOps');
    expect(abbreviateRole('Junior Developer, Salesforce')).toBe('Jr Dev SF');
    expect(abbreviateRole('Senior Software Developer')).toBe('Sr Sw Dev');
  });

  it('still recognizes a trailing seniority token', () => {
    expect(abbreviateRole('Dev Sr')).toBe('Sr Dev');
    expect(abbreviateRole('Data Engineer Senior')).toBe('Sr DE');
  });

  it('drops filler words and treats & / as separators', () => {
    expect(abbreviateRole('Engineer of Data and Analytics')).toBe('Eng DA');
    expect(abbreviateRole('QA & UX Designer')).toBe('QA UX Des');
  });
});

describe('abbreviateRoles', () => {
  it('keeps the first compact form and suffixes a later collision', () => {
    expect(abbreviateRoles(['BA', 'Business Analyst'])).toEqual(['BA', 'BA2']);
    expect(abbreviateRoles(['Team Lead, Core Technologies', 'Team Lead, Cloud Technologies'])).toEqual([
      'TL CT',
      'TL C Te',
    ]);
  });
});

describe('resourceListRoles', () => {
  it('lists distinct client roles in first-seen list order', () => {
    const list = [
      resourceList({ id: 1, role: 'UX Designer', clientRole: 'Middle Designer' }),
      resourceList({ id: 2, role: 'Business Analyst', clientRole: 'Senior Business Analyst' }),
      resourceList({
        id: 3,
        role: 'Business Analyst L2',
        clientRole: 'Senior Business Analyst',
        location: 'London',
      }),
    ];
    expect(resourceListRoles(list)).toEqual(['Middle Designer', 'Senior Business Analyst']);
  });

  it('builds columns from mapped client roles when the Client Role field is blank', () => {
    const list = [
      resourceList({ id: 1, role: 'Associate Software Developer L1, Core Technologies' }),
      resourceList({ id: 2, role: 'Principal Software Developer, Core Technologies' }),
    ];
    expect(resourceListRoles(list)).toEqual(['Junior Developer', 'Senior Developer']);
  });

  it('uses the Client Role field, not the rate-card role', () => {
    expect(
      displayedWbsRole(
        resourceList({
          role: 'Principal Software Developer, Core Technologies',
          clientRole: 'Senior Developer',
        })
      )
    ).toBe('Senior Developer');
  });

  it('maps a blank Client Role through the rate-card → client-role table', () => {
    expect(
      displayedWbsRole(
        resourceList({
          role: 'Principal Software Developer, Core Technologies',
          clientRole: '',
        })
      )
    ).toBe('Senior Developer');
  });

  it('maps a Client Role that was left equal to the rate-card name', () => {
    expect(
      displayedWbsRole(
        resourceList({
          role: 'Principal Software Developer, Core Technologies',
          clientRole: 'Principal Software Developer, Core Technologies',
        })
      )
    ).toBe('Senior Developer');
  });

  it('does not create a column from an unmapped rate-card role with no Client Role', () => {
    expect(displayedWbsRole(resourceList({ role: 'Contractor', clientRole: '' }))).toBe('');
    expect(resourceListRoles([resourceList({ id: 1, role: 'Contractor' })])).toEqual([]);
  });

  it('keeps a custom Client Role that has no mapping', () => {
    expect(displayedWbsRole(resourceList({ role: 'Contractor', clientRole: 'External Consultant' }))).toBe(
      'External Consultant'
    );
  });

  it('is empty only for a genuinely empty roster', () => {
    expect(resourceListRoles([])).toEqual([]);
    expect(resourceListRoles([resourceList({ id: 1, role: '', clientRole: '' })])).toEqual([]);
  });
});

describe('canonicalWbsRole', () => {
  const lists = [
    resourceList({
      role: 'Principal Software Developer, Core Technologies',
      clientRole: 'Senior Developer',
    }),
  ];

  it('maps a stored rate-card role onto the roster client role', () => {
    expect(canonicalWbsRole('Principal Software Developer, Core Technologies', lists)).toBe(
      'Senior Developer'
    );
  });

  it('leaves an already-client-role string alone', () => {
    expect(canonicalWbsRole('Senior Developer', lists)).toBe('Senior Developer');
  });
});

describe('buildGridRows', () => {
  const items: WbsItem[] = [
    item({ id: 1, name: 'Root', parentId: null, phaseName: 'Phase 1' }),
    item({
      id: 2,
      name: 'Child',
      parentId: 1,
      phaseName: null,
      estimates: [estimate({ id: 1, discipline: 'Engineering', role: 'BA', hours: 16, wbsItemId: 2 })],
    }),
    item({
      id: 3,
      name: 'Grandchild',
      parentId: 2,
      phaseName: null,
      estimates: [estimate({ id: 2, discipline: 'Design', role: 'UX', hours: 8, wbsItemId: 3 })],
    }),
    item({ id: 4, name: 'Second root', parentId: null, phaseName: null, displayOrder: 1 }),
  ];
  const phaseNames = ['Phase 1', 'Phase 2'];

  it('derives outline, indent depth, phase inheritance, pairs and the hours rollup in one pass', () => {
    const rows = buildGridRows(items, new Set(), phaseNames, ['BA', 'UX']);

    expect(rows.map((r) => [r.outline, r.name, r.depth])).toEqual([
      ['1', 'Root', 0],
      ['1.1', 'Child', 1],
      ['1.1.1', 'Grandchild', 2],
      ['2', 'Second root', 0],
    ]);

    // Parent rows ignore their own estimates and sum descendants only.
    expect(rows[0].roleHours).toEqual({ BA: 0, UX: 8 });
    expect(rows[1].roleHours).toEqual({ BA: 0, UX: 8 });
    expect(rows[2].roleHours).toEqual({ BA: 0, UX: 8 });
    expect(rows[0].totalHours).toBe(8);
    expect(rows[1].totalHours).toBe(8);
    expect(rows[2].totalHours).toBe(8);

    // Only depth-0 rows are section rows.
    expect(rows.map((r) => r.isSection)).toEqual([true, false, false, true]);

    // Pairs are the row's OWN estimates, not the subtree's.
    expect(rows[0].pairs).toEqual([]);
    expect(rows[1].pairs).toEqual([{ role: 'BA', discipline: 'Engineering', hours: 16 }]);
  });

  it('ignores parent-owned estimates and roles not present in the Resource List', () => {
    const withParentEstimate = [
      item({
        id: 1,
        estimates: [estimate({ role: 'BA', hours: 99, wbsItemId: 1 })],
      }),
      item({
        id: 2,
        parentId: 1,
        estimates: [
          estimate({ id: 2, role: 'BA', hours: 16, wbsItemId: 2 }),
          estimate({ id: 3, role: 'Removed', hours: 40, wbsItemId: 2 }),
        ],
      }),
    ];

    const rows = buildGridRows(withParentEstimate, new Set(), phaseNames, ['BA', 'QA']);
    expect(rows[0].roleHours).toEqual({ BA: 16, QA: 0 });
    expect(rows[0].totalHours).toBe(16);
    expect(rows[1].totalHours).toBe(16);
  });

  it('rolls up estimates stored as rate-card roles into client-role columns', () => {
    const lists = [
      resourceList({
        role: 'Principal Software Developer, Core Technologies',
        clientRole: 'Senior Developer',
      }),
    ];
    const mapped = [
      item({
        id: 1,
        estimates: [
          estimate({
            role: 'Principal Software Developer, Core Technologies',
            hours: 24,
            wbsItemId: 1,
          }),
        ],
      }),
    ];
    const rows = buildGridRows(mapped, new Set(), phaseNames, ['Senior Developer'], lists);
    expect(rows[0].roleHours).toEqual({ 'Senior Developer': 24 });
    expect(rows[0].totalHours).toBe(24);
  });

  it('marks inherited phases and leaves an explicit one alone', () => {
    const rows = buildGridRows(items, new Set(), phaseNames, ['BA', 'UX']);

    expect([rows[0].phaseName, rows[0].phaseInherited, rows[0].ownPhaseName]).toEqual([
      'Phase 1',
      false,
      'Phase 1',
    ]);
    expect([rows[1].phaseName, rows[1].phaseInherited, rows[1].ownPhaseName]).toEqual([
      'Phase 1',
      true,
      null,
    ]);
    expect([rows[3].phaseName, rows[3].phaseInherited, rows[3].ownPhaseName]).toEqual([
      null,
      false,
      null,
    ]);
  });

  it('renders a stale phase as Unassigned and never offers it as the picker value', () => {
    const stale = [item({ id: 1, name: 'Root', parentId: null, phaseName: 'Deleted phase' })];
    const [row] = buildGridRows(stale, new Set(), phaseNames, ['BA', 'UX']);

    expect(phaseLabel(row)).toBe('Unassigned');
    expect(row.ownPhaseName).toBeNull();
    // ...but it stays distinguishable from "never set", which is what lets the
    // dead value be cleared instead of persisting forever.
    expect(row.phaseStale).toBe(true);
  });

  it('does not call a never-set or a live phase stale', () => {
    const rows = buildGridRows(items, new Set(), phaseNames, ['BA', 'UX']);
    expect(rows.map((r) => r.phaseStale)).toEqual([false, false, false, false]);
  });

  // Matrix row "Collapsed subtree": descendants hidden, numbers unchanged.
  it('hides descendants of a collapsed row without renumbering the rest', () => {
    const rows = buildGridRows(items, new Set([1]), phaseNames, ['BA', 'UX']);

    expect(rows.map((r) => [r.outline, r.name])).toEqual([
      ['1', 'Root'],
      ['2', 'Second root'],
    ]);
    expect(rows[0].collapsed).toBe(true);
    expect(rows[0].hasChildren).toBe(true);
    // A collapsed parent still reports the whole subtree's hours.
    expect(rows[0].totalHours).toBe(8);
  });

  it('returns no rows for an empty item list', () => {
    expect(buildGridRows([], new Set(), phaseNames)).toEqual([]);
  });
});

describe('nameEditFor', () => {
  it('returns the trimmed name for a real change', () => {
    expect(nameEditFor({ name: 'Old' }, '  New  ')).toEqual({ name: 'New' });
  });

  it('returns null for a blank name so the edit reverts with no request', () => {
    expect(nameEditFor({ name: 'Old' }, '')).toBeNull();
    expect(nameEditFor({ name: 'Old' }, '   ')).toBeNull();
  });

  it('returns null when nothing changed', () => {
    expect(nameEditFor({ name: 'Same' }, 'Same')).toBeNull();
  });
});

describe('phaseEditFor', () => {
  it('returns the selected phase name', () => {
    expect(phaseEditFor({ ownPhaseName: null, phaseStale: false }, 'Phase 2')).toEqual({
      phaseName: 'Phase 2',
    });
  });

  it('returns null when the row already sets that phase itself', () => {
    expect(phaseEditFor({ ownPhaseName: 'Phase 1', phaseStale: false }, 'Phase 1')).toBeNull();
  });

  // Matrix row "Change phase to Unassigned" carried over from WBS-2.
  it('returns an explicit null for Unassigned', () => {
    expect(phaseEditFor({ ownPhaseName: 'Phase 1', phaseStale: false }, null)).toEqual({
      phaseName: null,
    });
  });

  it('treats pinning an inherited phase locally as a real change', () => {
    expect(phaseEditFor({ ownPhaseName: null, phaseStale: false }, 'Phase 1')).toEqual({
      phaseName: 'Phase 1',
    });
  });

  // A stale stored name reads as `ownPhaseName: null` everywhere else, so
  // without the staleness flag choosing Unassigned compares null === null and
  // issues nothing: the dead value would sit in the DB forever and silently
  // reattach the moment a phase of that name is recreated.
  it('issues a write when a STALE stored phase is cleared to Unassigned', () => {
    expect(phaseEditFor({ ownPhaseName: null, phaseStale: true }, null)).toEqual({
      phaseName: null,
    });
  });

  it('still issues nothing when a genuinely unset phase is set to Unassigned', () => {
    expect(phaseEditFor({ ownPhaseName: null, phaseStale: false }, null)).toBeNull();
  });
});

describe('pruneCollapsedIds', () => {
  const items = [item({ id: 1 }), item({ id: 2 })];

  // Ids are recycled, so a leftover entry would start an unrelated new row collapsed.
  it('drops ids whose item is gone', () => {
    expect(Array.from(pruneCollapsedIds(new Set([1, 99]), items))).toEqual([1]);
  });

  it('returns the SAME set when nothing changed, so it is loop-safe as a setState updater', () => {
    const collapsed = new Set([1, 2]);
    expect(pruneCollapsedIds(collapsed, items)).toBe(collapsed);
    const empty = new Set<number>();
    expect(pruneCollapsedIds(empty, [])).toBe(empty);
  });
});

describe('nextDisplayOrder', () => {
  const items = [
    item({ id: 1, parentId: null, displayOrder: 0 }),
    item({ id: 2, parentId: null, displayOrder: 3 }),
    item({ id: 3, parentId: 1, displayOrder: 7 }),
  ];

  it('is max sibling order + 1', () => {
    expect(nextDisplayOrder(items, null)).toBe(4);
    expect(nextDisplayOrder(items, 1)).toBe(8);
  });

  it('starts at 0 when there are no siblings', () => {
    expect(nextDisplayOrder([], null)).toBe(0);
    expect(nextDisplayOrder(items, 99)).toBe(0);
  });
});

describe('sibling / indent / outdent placement', () => {
  const items = [
    item({ id: 1, name: 'A', parentId: null, displayOrder: 0 }),
    item({ id: 2, name: 'B', parentId: null, displayOrder: 1 }),
    item({ id: 3, name: 'C', parentId: null, displayOrder: 2 }),
    item({ id: 4, name: 'B.1', parentId: 2, displayOrder: 0 }),
  ];

  it('places a sibling immediately below and bumps later siblings', () => {
    expect(siblingBelowPlacement(items, 1)).toEqual({
      parentId: null,
      displayOrder: 1,
      shifts: [
        { id: 2, displayOrder: 2 },
        { id: 3, displayOrder: 3 },
      ],
    });
  });

  it('appends after the last sibling with no shifts', () => {
    expect(siblingBelowPlacement(items, 3)).toEqual({
      parentId: null,
      displayOrder: 3,
      shifts: [],
    });
  });

  it('indents onto the previous sibling as its last child', () => {
    expect(indentPlacement(items, 3)).toEqual({ parentId: 2, displayOrder: 1 });
    expect(indentPlacement(items, 1)).toBeNull();
  });

  it('outdents to sit just after the former parent', () => {
    expect(outdentPlacement(items, 4)).toEqual({
      parentId: null,
      displayOrder: 2,
      shifts: [{ id: 3, displayOrder: 3 }],
    });
    expect(outdentPlacement(items, 1)).toBeNull();
  });

  it('builds the shared new-item payload', () => {
    expect(newWbsItemFields(2, 1)).toEqual({
      name: 'New item',
      parentId: 2,
      phaseName: null,
      displayOrder: 1,
    });
  });

  it('picks the first id that was not in the previous set', () => {
    expect(firstUnseenId(new Set([1, 2]), [1, 2, 9])).toBe(9);
    expect(firstUnseenId(new Set([1, 2]), [1, 2])).toBeUndefined();
    expect(firstUnseenId(new Set(), [4])).toBe(4);
  });

  it('selects the visible row above a deleted item, else the next survivor', () => {
    const items = [
      item({ id: 1, parentId: null }),
      item({ id: 2, parentId: 1 }),
      item({ id: 3, parentId: 1, displayOrder: 1 }),
      item({ id: 4, parentId: null, displayOrder: 1 }),
    ];
    const visible = [1, 2, 3, 4];
    expect(selectionAfterDelete(visible, items, 3)).toBe(2);
    expect(selectionAfterDelete(visible, items, 2)).toBe(1);
    expect(selectionAfterDelete(visible, items, 4)).toBe(3);
    expect(selectionAfterDelete(visible, items, 1)).toBe(4);
    expect(selectionAfterDelete([1], [item({ id: 1 })], 1)).toBeUndefined();
    expect(selectionAfterDelete(visible, items, 99)).toBeUndefined();
  });
});

describe('structure shortcuts', () => {
  it('maps keys only when no overlay is open', () => {
    const enter = { key: 'Enter', metaKey: false, ctrlKey: false, shiftKey: false };
    expect(structureActionFromKey(enter, false)).toBe('addSibling');
    expect(structureActionFromKey({ ...enter, metaKey: true }, false)).toBe('addChild');
    expect(structureActionFromKey({ ...enter, ctrlKey: true }, false)).toBe('addChild');
    expect(structureActionFromKey({ key: 'Tab', metaKey: false, ctrlKey: false, shiftKey: false }, false)).toBe(
      'indent'
    );
    expect(structureActionFromKey({ key: 'Tab', metaKey: false, ctrlKey: false, shiftKey: true }, false)).toBe(
      'outdent'
    );
    expect(structureActionFromKey({ key: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false }, false)).toBe(
      'delete'
    );
    expect(structureActionFromKey({ key: 'Backspace', metaKey: false, ctrlKey: false, shiftKey: false }, false)).toBe(
      'delete'
    );
    expect(structureActionFromKey(enter, true)).toBeNull();
    expect(structureActionFromKey({ key: 'Tab', metaKey: false, ctrlKey: false, shiftKey: false }, true)).toBeNull();
  });

  it('uses platform glyphs in the menu and the heading hint', () => {
    expect(structureShortcutLabel('addChild', true)).toBe('⌘↵');
    expect(structureShortcutLabel('addChild', false)).toBe('Ctrl+Enter');
    expect(structureHintText(true)).toContain('⌘Enter child');
    expect(structureHintText(false)).toContain('Ctrl+Enter child');
    expect(structureHintText(true)).toContain('drag to move');
    expect(structureHintText(false)).toContain('drag to move');
  });

  it('keeps the kebab hit box on the right edge of the cell', () => {
    expect(kebabLeft(200)).toBe(200 - 8 - KEBAB_SIZE);
    expect(hitsKebab(200, 34, 200 - 8 - 2, 17)).toBe(true);
    expect(hitsKebab(200, 34, 10, 17)).toBe(false);
  });
});

describe('dropZone', () => {
  const height = 30;

  it('maps the top third to before, the middle to child, and the bottom to after on a leaf', () => {
    expect(dropZone(0, height, false)).toBe('before');
    expect(dropZone(height / 3 - 0.01, height, false)).toBe('before');
    expect(dropZone(height / 3, height, false)).toBe('child');
    expect(dropZone(height / 2, height, false)).toBe('child');
    expect(dropZone((2 * height) / 3 - 0.01, height, false)).toBe('child');
    expect(dropZone((2 * height) / 3, height, false)).toBe('after');
    expect(dropZone(height - 1, height, false)).toBe('after');
  });

  it('maps the bottom third to first-child when the target has visible children', () => {
    expect(dropZone((2 * height) / 3, height, true)).toBe('first-child');
    expect(dropZone(height - 1, height, true)).toBe('first-child');
    expect(dropZone(height / 2, height, true)).toBe('child');
    expect(dropZone(0, height, true)).toBe('before');
  });
});

describe('dropPlacement', () => {
  const items = [
    item({ id: 1, name: 'A', parentId: null, displayOrder: 0 }),
    item({ id: 2, name: 'B', parentId: null, displayOrder: 1 }),
    item({ id: 3, name: 'C', parentId: null, displayOrder: 2 }),
    item({ id: 4, name: 'B.1', parentId: 2, displayOrder: 0 }),
    item({ id: 5, name: 'B.2', parentId: 2, displayOrder: 1 }),
  ];

  it('places a sibling immediately after and bumps later siblings', () => {
    expect(dropPlacement(items, 1, 2, 'after')).toEqual({
      parentId: null,
      displayOrder: 2,
      shifts: [{ id: 3, displayOrder: 3 }],
    });
  });

  it('places a sibling immediately before and bumps the target and later siblings', () => {
    expect(dropPlacement(items, 3, 2, 'before')).toEqual({
      parentId: null,
      displayOrder: 1,
      shifts: [{ id: 2, displayOrder: 2 }],
    });
  });

  it('nests as the last child of the target', () => {
    expect(dropPlacement(items, 1, 2, 'child')).toEqual({
      parentId: 2,
      displayOrder: 2,
      shifts: [],
    });
  });

  it('inserts as the first child of an expanded target', () => {
    expect(dropPlacement(items, 1, 2, 'first-child')).toEqual({
      parentId: 2,
      displayOrder: 0,
      shifts: [
        { id: 4, displayOrder: 1 },
        { id: 5, displayOrder: 2 },
      ],
    });
  });

  it('reparents across branches without compacting the source side', () => {
    expect(dropPlacement(items, 4, 3, 'after')).toEqual({
      parentId: null,
      displayOrder: 3,
      shifts: [],
    });
    expect(dropPlacement(items, 4, 3, 'child')).toEqual({
      parentId: 3,
      displayOrder: 0,
      shifts: [],
    });
  });

  it('rewrites only the dragged node when a parent with children is moved', () => {
    const placed = dropPlacement(items, 2, 3, 'after');
    expect(placed).toEqual({ parentId: null, displayOrder: 3, shifts: [] });
    const mentioned = [2, ...(placed?.shifts.map((shift) => shift.id) ?? [])];
    expect(mentioned).not.toContain(4);
    expect(mentioned).not.toContain(5);
  });

  it('returns null when dropping on a descendant', () => {
    expect(dropPlacement(items, 2, 4, 'before')).toBeNull();
    expect(dropPlacement(items, 2, 5, 'child')).toBeNull();
  });

  it('returns null when dropping on self', () => {
    expect(dropPlacement(items, 1, 1, 'after')).toBeNull();
    expect(dropPlacement(items, 2, 2, 'child')).toBeNull();
  });

  it('returns null when the item is already at that parent and order', () => {
    expect(dropPlacement(items, 2, 1, 'after')).toBeNull();
    expect(dropPlacement(items, 3, 2, 'after')).toBeNull();
    expect(dropPlacement(items, 4, 2, 'first-child')).toBeNull();
    expect(dropPlacement(items, 1, 2, 'before')).toBeNull();
    expect(dropPlacement(items, 5, 2, 'child')).toBeNull();
  });

  it('returns null when the dragged or target item is missing', () => {
    expect(dropPlacement(items, 99, 1, 'after')).toBeNull();
    expect(dropPlacement(items, 1, 99, 'after')).toBeNull();
  });
});

describe('deleteConfirmMessage', () => {
  const items = [
    item({ id: 1, name: 'Root', parentId: null }),
    item({ id: 2, name: 'Child A', parentId: 1 }),
    item({ id: 3, name: 'Child B', parentId: 1 }),
    item({ id: 4, name: 'Grandchild', parentId: 2 }),
  ];

  it('names the descendant count', () => {
    expect(deleteConfirmMessage(items, 1, 'Root')).toContain('3 descendant items');
  });

  it('singularises a lone descendant', () => {
    expect(deleteConfirmMessage(items, 2, 'Child A')).toContain('1 descendant item?');
  });

  it('omits the descendant clause for a leaf', () => {
    expect(deleteConfirmMessage(items, 4, 'Grandchild')).toBe(
      'Delete "Grandchild"? This cannot be undone.'
    );
  });
});

describe('indentFor', () => {
  // The Task Description column's own width, so the numbers below are the real ones.
  const COLUMN = 360;
  const WIDE = 1000;

  it('indents one step per level', () => {
    expect(indentFor(0, WIDE)).toBe(0);
    expect(indentFor(1, WIDE)).toBe(INDENT_PX);
    expect(indentFor(3, WIDE)).toBe(3 * INDENT_PX);
  });

  // A probe that replaced `Math.min(depth, MAX_INDENT_DEPTH)` with `depth`
  // passed the whole suite while this lived in the component. It must not now.
  it('clamps at MAX_INDENT_DEPTH however deep the tree goes', () => {
    expect(indentFor(MAX_INDENT_DEPTH, WIDE)).toBe(MAX_INDENT_DEPTH * INDENT_PX);
    expect(indentFor(MAX_INDENT_DEPTH + 1, WIDE)).toBe(MAX_INDENT_DEPTH * INDENT_PX);
    expect(indentFor(40, WIDE)).toBe(MAX_INDENT_DEPTH * INDENT_PX);
  });

  it('keeps the chevron inside the column at a depth where an unclamped indent would not', () => {
    // Depth 25 is the spec's own "can never be expanded again" example.
    const depth = 25;
    expect(depth * INDENT_PX + CELL_PAD + CHEVRON_SIZE).toBeGreaterThan(COLUMN);
    expect(indentFor(depth, COLUMN) + CELL_PAD + CHEVRON_SIZE).toBeLessThanOrEqual(COLUMN);
  });

  it('gives up indent before it gives up the label, however narrow the column', () => {
    const narrow = 100;
    expect(indentFor(MAX_INDENT_DEPTH, narrow)).toBe(
      narrow - CHEVRON_SIZE - MIN_LABEL_WIDTH - CELL_PAD * 2
    );
    // Narrower than the chevron plus a minimum label: no indent at all, never negative.
    expect(indentFor(MAX_INDENT_DEPTH, 20)).toBe(0);
  });
});

describe('hitsChevron', () => {
  const WIDTH = 360;
  const HEIGHT = 34;
  const left = CELL_PAD + indentFor(1, WIDTH);
  const middle = HEIGHT / 2;

  it('hits the glyph', () => {
    expect(hitsChevron(1, WIDTH, HEIGHT, left + CHEVRON_SIZE / 2, middle)).toBe(true);
  });

  // Ignoring posY gives the chevron the full row height, so a click anywhere
  // down a parent row's left edge toggles instead of selecting — and selection
  // is what enables the toolbar.
  it('misses a click at the same x but the top or bottom of the row', () => {
    expect(hitsChevron(1, WIDTH, HEIGHT, left + CHEVRON_SIZE / 2, 0)).toBe(false);
    expect(hitsChevron(1, WIDTH, HEIGHT, left + CHEVRON_SIZE / 2, HEIGHT)).toBe(false);
  });

  it('misses a click past the glyph horizontally', () => {
    expect(hitsChevron(1, WIDTH, HEIGHT, left - 1, middle)).toBe(false);
    expect(hitsChevron(1, WIDTH, HEIGHT, left + CHEVRON_SIZE + 1, middle)).toBe(false);
  });

  it('follows the indent, so a deeper row has its chevron further right', () => {
    const deep = CELL_PAD + indentFor(3, WIDTH);
    expect(hitsChevron(3, WIDTH, HEIGHT, deep + 1, middle)).toBe(true);
    expect(hitsChevron(3, WIDTH, HEIGHT, left + 1, middle)).toBe(false);
  });
});

describe('createEstimateCommitter', () => {
  const pair = (role: string, hours: number): RolePair => ({ role, discipline: 'Engineering', hours });

  it('sends the item full pair set as a replace payload', async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const committer = createEstimateCommitter(replace);

    await committer.commit(10, [pair('BA', 16), pair('UX', 8)]);

    expect(replace).toHaveBeenCalledWith(10, [
      { discipline: 'Engineering', role: 'BA', hours: 16 },
      { discipline: 'Engineering', role: 'UX', hours: 8 },
    ]);
  });

  it('falls back to the caller pairs when nothing is in flight', () => {
    const committer = createEstimateCommitter(vi.fn().mockResolvedValue(undefined));
    expect(committer.basisFor(10, [pair('BA', 1)])).toEqual([pair('BA', 1)]);
  });

  // Matrix row "Two rapid edits, same row".
  it('serializes same-item commits and hands the second the first result as its basis', async () => {
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    const replace = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise<void>((resolve) => { releaseFirst = resolve; });
      return Promise.resolve();
    });
    const committer = createEstimateCommitter(replace);

    const first = committer.commit(10, [pair('BA', 16)]);
    await Promise.resolve(); // requests are issued off the per-item promise chain
    expect(replace).toHaveBeenCalledTimes(1);

    // Second edit, issued before the first settles, merges on the first result.
    const basis = committer.basisFor(10, []);
    expect(basis).toEqual([pair('BA', 16)]);
    const second = committer.commit(10, [...basis, pair('UX', 8)]);

    // Strictly sequential: the second request has not been issued yet.
    expect(replace).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await first;
    await second;

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[1][1]).toEqual([
      { discipline: 'Engineering', role: 'BA', hours: 16 },
      { discipline: 'Engineering', role: 'UX', hours: 8 },
    ]);
  });

  it('does not let a rejected write survive as a merge basis', async () => {
    const replace = vi.fn().mockRejectedValue(new Error('400'));
    const committer = createEstimateCommitter(replace);

    await expect(committer.commit(10, [pair('BA', 99)])).rejects.toThrow('400');

    // The next edit must build on server truth, not on the rejected value —
    // otherwise the full-set replace would resurrect it.
    expect(committer.basisFor(10, [pair('BA', 16)])).toEqual([pair('BA', 16)]);
  });

  it('does not let one failure block later edits on the same item', async () => {
    const replace = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const committer = createEstimateCommitter(replace);

    await committer.commit(10, [pair('BA', 1)]).catch(() => {});
    await committer.commit(10, [pair('BA', 2)]);

    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('keeps different items independent', async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const committer = createEstimateCommitter(replace);

    await committer.commit(1, [pair('BA', 1)]);
    expect(committer.basisFor(2, [pair('UX', 5)])).toEqual([pair('UX', 5)]);
  });
});
