import { describe, it, expect, vi } from 'vitest';
import {
  CELL_PAD,
  CHEVRON_SIZE,
  CHIP_GAP,
  CHIP_PAD,
  INDENT_PX,
  MAX_HOURS,
  MAX_INDENT_DEPTH,
  MIN_LABEL_WIDTH,
  availableRoles,
  buildGridRows,
  createEstimateCommitter,
  deleteConfirmMessage,
  deriveDiscipline,
  formatHours,
  formatHoursInput,
  hitsChevron,
  hitsKebab,
  indentFor,
  indentPlacement,
  kebabLeft,
  KEBAB_SIZE,
  layoutChips,
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
  pairKey,
  pairLabel,
  pairsFromEstimates,
  pairsSummary,
  pairsToPayload,
  parseHours,
  phaseEditFor,
  phaseLabel,
  pruneCollapsedIds,
  rateCardRoles,
  resourceListRoles,
  rolesUseFreeText,
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
  it('labels a chip as role x hours, rounded', () => {
    expect(pairLabel({ role: 'BA', discipline: 'Engineering', hours: 16 })).toBe('BA ×16');
    expect(pairLabel({ role: 'UX', discipline: 'Design', hours: 0.1 + 0.2 })).toBe('UX ×0.3');
  });

  it('falls back to the discipline for pre-redesign estimates with an empty role', () => {
    expect(pairLabel({ role: '', discipline: 'Engineering', hours: 4 })).toBe('Engineering ×4');
  });

  it('keys pairs unambiguously even when several share an empty role', () => {
    const a = pairKey({ role: '', discipline: 'Engineering', hours: 1 });
    const b = pairKey({ role: '', discipline: 'Design', hours: 1 });
    expect(a).not.toBe(b);
  });

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
    expect(pairsSummary(pairs)).toBe('BA ×16, UX ×8');
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
});

describe('availableRoles', () => {
  it('offers distinct resource-list roles alphabetically', () => {
    const list = [
      resourceList({ id: 1, role: 'UX' }),
      resourceList({ id: 2, role: 'BA' }),
      resourceList({ id: 3, role: 'BA' }),
    ];
    const cards = [
      rateCard({ id: 1, role: 'UX', discipline: 'Design' }),
      rateCard({ id: 2, role: 'BA', discipline: 'Analysis' }),
    ];
    expect(availableRoles(list, [], cards)).toEqual(['BA', 'UX']);
  });

  it('excludes roles already on the item', () => {
    const list = [resourceList({ id: 1, role: 'UX' }), resourceList({ id: 2, role: 'BA' })];
    const cards = [
      rateCard({ id: 1, role: 'UX', discipline: 'Design' }),
      rateCard({ id: 2, role: 'BA', discipline: 'Analysis' }),
    ];
    const taken: RolePair[] = [{ role: 'BA', discipline: 'Analysis', hours: 4 }];
    expect(availableRoles(list, taken, cards)).toEqual(['UX']);
  });

  it('omits a list role that the non-empty rate card cannot map', () => {
    const list = [
      resourceList({ id: 1, role: 'BA' }),
      resourceList({ id: 2, role: 'Contractor' }),
    ];
    const cards = [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })];
    expect(availableRoles(list, [], cards)).toEqual(['BA']);
  });

  it('omits a list role whose rate-card row has an empty discipline', () => {
    const list = [resourceList({ id: 1, role: 'BA' })];
    const cards = [rateCard({ id: 1, role: 'BA', discipline: '' })];
    expect(availableRoles(list, [], cards)).toEqual([]);
  });

  it('keeps unmapped list roles when the rate card is empty', () => {
    const list = [resourceList({ id: 1, role: 'Contractor' })];
    expect(availableRoles(list, [], [])).toEqual(['Contractor']);
  });

  it('is empty for an empty resource list', () => {
    expect(availableRoles([], [], [])).toEqual([]);
    expect(availableRoles([], [], [rateCard({ role: 'BA' })])).toEqual([]);
  });
});

describe('resourceListRoles', () => {
  it('lists every distinct role the roster names, alphabetically', () => {
    const list = [
      resourceList({ id: 1, role: 'UX' }),
      resourceList({ id: 2, role: 'BA' }),
      resourceList({ id: 3, role: 'BA', location: 'London' }),
    ];
    expect(resourceListRoles(list)).toEqual(['BA', 'UX']);
  });

  it('is empty only for a genuinely empty roster', () => {
    expect(resourceListRoles([])).toEqual([]);
    expect(resourceListRoles([resourceList({ id: 1, role: '' })])).toEqual([]);
  });
});

describe('rolesUseFreeText', () => {
  it('is true only when both the roster and the rate card are empty', () => {
    expect(rolesUseFreeText([], [])).toBe(true);
    expect(rolesUseFreeText([], [rateCard({ role: 'BA' })])).toBe(false);
    expect(rolesUseFreeText([resourceList({ role: 'BA' })], [])).toBe(false);
    expect(rolesUseFreeText([resourceList({ role: 'BA' })], [rateCard({ role: 'BA' })])).toBe(false);
  });
});

describe('rateCardRoles', () => {
  it('lists every distinct role the card names, alphabetically', () => {
    const cards = [rateCard({ id: 1, role: 'UX' }), rateCard({ id: 2, role: 'BA' }), rateCard({ id: 3, role: 'BA' })];
    expect(rateCardRoles(cards)).toEqual(['BA', 'UX']);
  });

  it('is empty only for a genuinely empty card', () => {
    expect(rateCardRoles([])).toEqual([]);
    expect(rateCardRoles([rateCard({ id: 1, role: '' })])).toEqual([]);
  });

  // This is the distinction the free-text gate depends on: a non-empty card
  // whose roles are all taken leaves `availableRoles` empty but is NOT empty,
  // and free text against it derives a discipline the server rejects with 400.
  it('stays non-empty when every card role is already on the item, unlike availableRoles', () => {
    const list = [resourceList({ id: 1, role: 'BA' })];
    const cards = [rateCard({ id: 1, role: 'BA' })];
    const taken: RolePair[] = [{ role: 'BA', discipline: 'Analysis', hours: 4 }];
    expect(availableRoles(list, taken, cards)).toEqual([]);
    expect(rateCardRoles(cards)).toEqual(['BA']);
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
    const rows = buildGridRows(items, new Set(), phaseNames);

    expect(rows.map((r) => [r.outline, r.name, r.depth])).toEqual([
      ['1', 'Root', 0],
      ['1.1', 'Child', 1],
      ['1.1.1', 'Grandchild', 2],
      ['2', 'Second root', 0],
    ]);

    // Hours are own + all descendants, all roles merged.
    expect(rows[0].totalHours).toBe(24);
    expect(rows[1].totalHours).toBe(24);
    expect(rows[2].totalHours).toBe(8);

    // Only depth-0 rows are section rows.
    expect(rows.map((r) => r.isSection)).toEqual([true, false, false, true]);

    // Pairs are the row's OWN estimates, not the subtree's.
    expect(rows[0].pairs).toEqual([]);
    expect(rows[1].pairs).toEqual([{ role: 'BA', discipline: 'Engineering', hours: 16 }]);
  });

  it('marks inherited phases and leaves an explicit one alone', () => {
    const rows = buildGridRows(items, new Set(), phaseNames);

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
    const [row] = buildGridRows(stale, new Set(), phaseNames);

    expect(phaseLabel(row)).toBe('Unassigned');
    expect(row.ownPhaseName).toBeNull();
    // ...but it stays distinguishable from "never set", which is what lets the
    // dead value be cleared instead of persisting forever.
    expect(row.phaseStale).toBe(true);
  });

  it('does not call a never-set or a live phase stale', () => {
    const rows = buildGridRows(items, new Set(), phaseNames);
    expect(rows.map((r) => r.phaseStale)).toEqual([false, false, false, false]);
  });

  // Matrix row "Collapsed subtree": descendants hidden, numbers unchanged.
  it('hides descendants of a collapsed row without renumbering the rest', () => {
    const rows = buildGridRows(items, new Set([1]), phaseNames);

    expect(rows.map((r) => [r.outline, r.name])).toEqual([
      ['1', 'Root'],
      ['2', 'Second root'],
    ]);
    expect(rows[0].collapsed).toBe(true);
    expect(rows[0].hasChildren).toBe(true);
    // A collapsed parent still reports the whole subtree's hours.
    expect(rows[0].totalHours).toBe(24);
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
  });

  it('keeps the kebab hit box on the right edge of the cell', () => {
    expect(kebabLeft(200)).toBe(200 - 8 - KEBAB_SIZE);
    expect(hitsKebab(200, 34, 200 - 8 - 2, 17)).toBe(true);
    expect(hitsKebab(200, 34, 10, 17)).toBe(false);
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

describe('layoutChips', () => {
  const pair = (role: string, hours: number): RolePair => ({ role, discipline: 'D', hours });
  // Deterministic stand-in for the canvas metric: 10px per character.
  const measure = (label: string) => label.length * 10;
  const chipWidth = (label: string) => label.length * 10 + CHIP_PAD * 2;

  it('places every chip when they all fit', () => {
    const layout = layoutChips([pair('BA', 16), pair('UX', 8)], 1000, measure);

    expect(layout.chips.map((c) => c.label)).toEqual(['BA ×16', 'UX ×8']);
    expect(layout.chips[0].x).toBe(CELL_PAD);
    expect(layout.chips[1].x).toBe(CELL_PAD + chipWidth('BA ×16') + CHIP_GAP);
    expect(layout.overflow).toBe(0);
    expect(layout.overflowLabel).toBe('');
  });

  // Chips clipped at the column edge give no sign that roles are hidden.
  it('replaces what does not fit with a +N badge', () => {
    const pairs = [pair('BA', 16), pair('UX', 8), pair('QA', 4), pair('PM', 2)];
    const layout = layoutChips(pairs, 140, measure);

    expect(layout.chips.length).toBeLessThan(pairs.length);
    expect(layout.overflow).toBe(pairs.length - layout.chips.length);
    expect(layout.overflowLabel).toBe(`+${layout.overflow}`);
  });

  it('keeps the badge inside the cell', () => {
    const pairs = [pair('BA', 16), pair('UX', 8), pair('QA', 4)];
    const layout = layoutChips(pairs, 140, measure);

    expect(layout.overflowX).toBeGreaterThanOrEqual(CELL_PAD);
    expect(layout.overflowX + layout.overflowWidth).toBeLessThanOrEqual(140 - CELL_PAD);
  });

  // Dropping it instead would render an empty-looking cell for a row that has
  // roles; the renderer's clip is what keeps it off the Hours column.
  it('still places a first chip wider than the whole cell, leaving the clip to cut it', () => {
    const layout = layoutChips([pair('A very long role name indeed', 16)], 80, measure);

    expect(layout.chips).toHaveLength(1);
    expect(layout.chips[0].x).toBe(CELL_PAD);
    expect(layout.chips[0].x + layout.chips[0].width).toBeGreaterThan(80);
    expect(layout.overflow).toBe(0);
  });

  it('badges the rest even when the first chip alone overflows', () => {
    const wide = pair('A very long role name indeed', 16);
    const layout = layoutChips([wide, pair('UX', 8)], 80, measure);

    expect(layout.chips).toHaveLength(1);
    expect(layout.overflow).toBe(1);
    expect(layout.overflowX + layout.overflowWidth).toBeLessThanOrEqual(80 - CELL_PAD);
  });

  it('lays out nothing for a row with no roles', () => {
    expect(layoutChips([], 320, measure)).toMatchObject({ chips: [], overflow: 0, overflowLabel: '' });
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
