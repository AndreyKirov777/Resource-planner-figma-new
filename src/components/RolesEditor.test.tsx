import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RolesEditor, NameEditor, PhaseEditor, isInsidePortaledMenu } from './RolesEditor';
import { createEstimateCommitter, RolePair } from '../utils/wbsGrid';
import type { RateCard as RateCardType, WbsEstimate } from '../services/api';

type ReplaceFn = (itemId: number, estimates: Partial<WbsEstimate>[]) => Promise<void>;

// Radix Select relies on pointer-capture / scrollIntoView APIs jsdom doesn't
// implement. This is the only suite that renders a Radix Select now that the
// per-row selects are gone from the grid.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
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

function setup(options: {
  pairs?: RolePair[];
  rateCards?: RateCardType[];
  replace?: ReturnType<typeof vi.fn>;
} = {}) {
  const replace = options.replace ?? vi.fn().mockResolvedValue(undefined);
  const committer = createEstimateCommitter(replace as unknown as ReplaceFn);
  const onClose = vi.fn();
  const utils = render(
    <RolesEditor
      itemId={10}
      pairs={options.pairs ?? []}
      rateCards={options.rateCards ?? []}
      committer={committer}
      onClose={onClose}
    />
  );
  return { replace, committer, onClose, ...utils };
}

describe('RolesEditor — adding and removing pairs', () => {
  it('adds a role picked from the rate card, deriving the discipline from the same row', async () => {
    const user = userEvent.setup();
    const { replace } = setup({
      rateCards: [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })],
    });

    await user.click(screen.getByRole('combobox', { name: 'New role' }));
    await user.click(screen.getByRole('option', { name: 'BA' }));
    await user.type(screen.getByLabelText('New role hours'), '16');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 16 }])
    );
  });

  it('falls back to free text when the rate card is empty, using the role as the discipline', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ rateCards: [] });

    expect(screen.queryByRole('combobox', { name: 'New role' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('New role name'), 'Freelancer');
    await user.type(screen.getByLabelText('New role hours'), '4');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [
        { discipline: 'Freelancer', role: 'Freelancer', hours: 4 },
      ])
    );
  });

  it('persists the item FULL set, preserving every other pair', async () => {
    const user = userEvent.setup();
    const { replace } = setup({
      pairs: [{ role: 'UX', discipline: 'Design', hours: 8 }],
      rateCards: [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })],
    });

    await user.click(screen.getByRole('combobox', { name: 'New role' }));
    await user.click(screen.getByRole('option', { name: 'BA' }));
    await user.type(screen.getByLabelText('New role hours'), '16');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [
        { discipline: 'Design', role: 'UX', hours: 8 },
        { discipline: 'Analysis', role: 'BA', hours: 16 },
      ])
    );
  });

  it('removes a pair and persists the remaining set', async () => {
    const user = userEvent.setup();
    const { replace } = setup({
      pairs: [
        { role: 'BA', discipline: 'Analysis', hours: 16 },
        { role: 'UX', discipline: 'Design', hours: 8 },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Remove BA' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Design', role: 'UX', hours: 8 }])
    );
  });

  it('excludes a role already on the item from the picker', async () => {
    const user = userEvent.setup();
    setup({
      pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }],
      rateCards: [
        rateCard({ id: 1, role: 'BA', discipline: 'Analysis' }),
        rateCard({ id: 2, role: 'UX', discipline: 'Design' }),
      ],
    });

    await user.click(screen.getByRole('combobox', { name: 'New role' }));

    expect(screen.getByRole('option', { name: 'UX' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'BA' })).not.toBeInTheDocument();
  });

  it('never silently overwrites a role that is already on the item', async () => {
    const user = userEvent.setup();
    // Empty card, so free text is the (only) way to name a duplicate at all.
    const { replace } = setup({
      pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }],
      rateCards: [],
    });

    await user.type(screen.getByLabelText('New role name'), 'BA');
    await user.type(screen.getByLabelText('New role hours'), '99');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/already on this item/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('RolesEditor — free text is gated on an EMPTY rate card, not an exhausted one', () => {
  // `deriveDiscipline` hands a free-text role back as its own discipline. The
  // server's bypass accepts that only when the rate-card table is empty, so
  // offering free text against a non-empty card produces a guaranteed 400.
  it('shows an exhausted state, not a free-text input, when a non-empty card has nothing left', () => {
    setup({
      pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }],
      rateCards: [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })],
    });

    expect(screen.getByTestId('roles-exhausted')).toBeInTheDocument();
    expect(screen.queryByLabelText('New role name')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New role' })).not.toBeInTheDocument();
    // No input that cannot succeed: the Add row is gone entirely.
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('still offers the picker while the card has anything left', () => {
    setup({
      pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }],
      rateCards: [
        rateCard({ id: 1, role: 'BA', discipline: 'Analysis' }),
        rateCard({ id: 2, role: 'UX', discipline: 'Design' }),
      ],
    });

    expect(screen.getByRole('combobox', { name: 'New role' })).toBeInTheDocument();
    expect(screen.queryByTestId('roles-exhausted')).not.toBeInTheDocument();
  });

  it('offers free text only for a genuinely empty card', () => {
    setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }], rateCards: [] });

    expect(screen.getByLabelText('New role name')).toBeInTheDocument();
    expect(screen.queryByTestId('roles-exhausted')).not.toBeInTheDocument();
  });
});

describe('RolesEditor — commit paths (Glide preventDefaults Enter and Tab)', () => {
  it('commits typed hours on Enter', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24{Enter}');

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 24 }])
    );
  });

  it('commits typed hours on Tab', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24');
    await user.tab();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 24 }])
    );
  });

  it('commits typed hours on Done, and closes', async () => {
    const user = userEvent.setup();
    const { replace, onClose } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 24 }])
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('commits typed hours when Tab moves focus off the last control (Done)', async () => {
    const user = userEvent.setup();
    const { replace, onClose } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24');

    // Done is the last focusable control; tabbing past it would leave the
    // overlay open with focus outside it and no way back in.
    await act(async () => {
      screen.getByRole('button', { name: 'Done' }).focus();
    });
    await user.tab();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 24 }])
    );
    expect(onClose).toHaveBeenCalled();
  });

  // PRODUCT DECISION: Escape CANCELS. Enter, Tab, Done, blur and outside-click
  // all still commit, so nothing is ever discarded without the user saying so.
  it('discards the in-progress draft on Escape, as an explicit cancel', async () => {
    const user = userEvent.setup();
    const { replace, onClose } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // The field is back to the stored value, not left showing the abandoned draft.
    expect(screen.getByLabelText('Hours for BA')).toHaveValue('16');
  });

  it('does not resurrect a cancelled draft through the unmount flush', async () => {
    const user = userEvent.setup();
    const { replace, unmount } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24{Escape}');
    unmount();

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('commits a draft when an outside click unmounts the editor', async () => {
    const user = userEvent.setup();
    const { replace, unmount } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24');

    // An outside click tears the overlay down without any blur or key event.
    unmount();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 24 }])
    );
  });

  it('adds the pending new pair when Enter is pressed in the add row', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ rateCards: [] });

    await user.type(screen.getByLabelText('New role name'), 'Freelancer');
    await user.type(screen.getByLabelText('New role hours'), '4{Enter}');

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [
        { discipline: 'Freelancer', role: 'Freelancer', hours: 4 },
      ])
    );
  });
});

describe('RolesEditor — invalid hours', () => {
  it('commits blank hours as 0', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '{Enter}');

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(10, [{ discipline: 'Analysis', role: 'BA', hours: 0 }])
    );
  });

  it.each(['1e', '1.2.3', '-4', 'abc'])(
    'reverts unparseable hours (%s) with no request and a visible message',
    async (raw) => {
      const user = userEvent.setup();
      const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

      const input = screen.getByLabelText('Hours for BA');
      await user.clear(input);
      await user.type(input, `${raw}{Enter}`);

      expect(await screen.findByText(/not a valid number of hours/i)).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      // Reverted to the last known good value, not left as 0.
      expect(screen.getByLabelText('Hours for BA')).toHaveValue('16');
    }
  );

  // A write here is a full delete-and-recreate, so a no-op edit must not cause
  // one. The stored float displays as "0.3" and comes back as exactly 0.3.
  it('issues no write when a rounded-for-display float is re-committed unchanged', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 0.1 + 0.2 }] });

    const input = screen.getByLabelText('Hours for BA');
    expect(input).toHaveValue('0.3');
    await user.clear(input);
    await user.type(input, '0.3{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Hours for BA')).toHaveValue('0.3'));
    expect(replace).not.toHaveBeenCalled();
  });

  it('rejects hours beyond the round-trip ceiling instead of accepting a value that cannot re-parse', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }] });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '99999999999999999999999{Enter}');

    expect(await screen.findByText(/not a valid number of hours/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('rejects an unparseable hours value on the add row without adding anything', async () => {
    const user = userEvent.setup();
    const { replace } = setup({ rateCards: [] });

    await user.type(screen.getByLabelText('New role name'), 'Freelancer');
    await user.type(screen.getByLabelText('New role hours'), '1,5');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/not a valid number of hours/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('RolesEditor — failure and race handling', () => {
  it('rolls local state back when the write is rejected', async () => {
    const user = userEvent.setup();
    const replace = vi.fn().mockRejectedValue(new Error('400'));
    const { committer } = setup({
      pairs: [{ role: 'BA', discipline: 'Analysis', hours: 16 }],
      replace,
    });

    const input = screen.getByLabelText('Hours for BA');
    await user.clear(input);
    await user.type(input, '24{Enter}');

    expect(await screen.findByText(/saving failed/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Hours for BA')).toHaveValue('16'));
    // ...and the rejected value must not linger as the next edit merge basis,
    // or the full-set replace would resurrect it.
    expect(committer.basisFor(10, [{ role: 'BA', discipline: 'Analysis', hours: 16 }])).toEqual([
      { role: 'BA', discipline: 'Analysis', hours: 16 },
    ]);
  });

  // Two overlapping writes: the older one's failure must undo ONLY its own
  // change. Rolling back to "whatever was there when I started" either wipes
  // out a newer edit that already shipped (leaving editor and server divergent
  // under a message claiming it reverted) or, when both fail, restores the
  // earlier REJECTED value — which the next full-set write would resurrect.
  const TWO_PAIRS: RolePair[] = [
    { role: 'BA', discipline: 'Analysis', hours: 16 },
    { role: 'UX', discipline: 'Design', hours: 8 },
  ];

  /**
   * Two writes that genuinely OVERLAP: A is still on the wire when B is queued.
   * Letting A settle first (which is what happens if it is simply rejected up
   * front) never exercises the race at all — `userEvent` flushes microtasks
   * between keystrokes, so the two edits would just run in sequence.
   */
  async function overlappingEdits(secondResult: 'resolve' | 'hang') {
    const user = userEvent.setup();
    let rejectFirst: ((error: Error) => void) | undefined;
    let calls = 0;
    const replace = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
      return secondResult === 'resolve' ? Promise.resolve() : new Promise<void>(() => {});
    });

    const harness = setup({ pairs: TWO_PAIRS, replace });

    const ba = screen.getByLabelText('Hours for BA');
    await user.clear(ba);
    await user.type(ba, '24{Enter}');
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    // B is queued while A is still in flight.
    const ux = screen.getByLabelText('Hours for UX');
    await user.clear(ux);
    await user.type(ux, '12{Enter}');
    expect(replace).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst?.(new Error('400'));
    });
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    return { ...harness, replace };
  }

  it('an older failure leaves a newer edit that already shipped alone', async () => {
    // B never settles, so what is on screen is the rollback's own doing rather
    // than a later success quietly healing it.
    const { replace } = await overlappingEdits('hang');

    await waitFor(() => expect(screen.getByLabelText('Hours for BA')).toHaveValue('16'));
    expect(screen.getByLabelText('Hours for UX')).toHaveValue('12');
    // B's payload must not carry A's rejected value to the server either.
    expect(replace.mock.calls[1][1]).toEqual([
      { discipline: 'Analysis', role: 'BA', hours: 16 },
      { discipline: 'Design', role: 'UX', hours: 12 },
    ]);
  });

  it('A rejects then B succeeds: editor and server end up agreeing', async () => {
    await overlappingEdits('resolve');

    await waitFor(() => expect(screen.getByLabelText('Hours for BA')).toHaveValue('16'));
    expect(screen.getByLabelText('Hours for UX')).toHaveValue('12');
  });

  it('A and B both reject: local state lands on server truth, not on A rejected value', async () => {
    const user = userEvent.setup();
    let rejectFirst: ((error: Error) => void) | undefined;
    let calls = 0;
    const replace = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
      return Promise.reject(new Error('400'));
    });
    const { committer } = setup({ pairs: TWO_PAIRS, replace });

    const ba = screen.getByLabelText('Hours for BA');
    await user.clear(ba);
    await user.type(ba, '24{Enter}');
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const ux = screen.getByLabelText('Hours for UX');
    await user.clear(ux);
    await user.type(ux, '12{Enter}');

    await act(async () => {
      rejectFirst?.(new Error('400'));
    });
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));

    // Both edits are gone — and crucially BA is back to 16, not left holding
    // A's REJECTED 24, which the next full-set write would have resurrected.
    await waitFor(() => expect(screen.getByLabelText('Hours for BA')).toHaveValue('16'));
    expect(screen.getByLabelText('Hours for UX')).toHaveValue('8');
    expect(await screen.findByText(/saving failed/i)).toBeInTheDocument();
    expect(committer.basisFor(10, TWO_PAIRS)).toEqual(TWO_PAIRS);
  });

  it('keeps both of two rapid edits to the same row (no lost update)', async () => {
    const user = userEvent.setup();
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    const replace = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise<void>((resolve) => { releaseFirst = resolve; });
      return Promise.resolve();
    });

    setup({
      pairs: [
        { role: 'BA', discipline: 'Analysis', hours: 16 },
        { role: 'UX', discipline: 'Design', hours: 8 },
      ],
      replace,
    });

    // Edit the first pair; its request hangs.
    const ba = screen.getByLabelText('Hours for BA');
    await user.clear(ba);
    await user.type(ba, '24{Enter}');
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    // Edit the second pair before the first has settled.
    const ux = screen.getByLabelText('Hours for UX');
    await user.clear(ux);
    await user.type(ux, '12{Enter}');

    // Strictly sequential: still only one request in flight.
    expect(replace).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));

    // The second payload carries BOTH edits — neither clobbered the other.
    expect(replace.mock.calls[1][1]).toEqual([
      { discipline: 'Analysis', role: 'BA', hours: 24 },
      { discipline: 'Design', role: 'UX', hours: 12 },
    ]);
  });

  it('seeds its draft from the committer, not the prop, so an in-flight edit is not clobbered', async () => {
    const replace = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
    const committer = createEstimateCommitter(replace);
    // An edit on this item is still in flight when the overlay reopens.
    committer.commit(10, [{ role: 'BA', discipline: 'Analysis', hours: 24 }]);

    render(
      <RolesEditor
        itemId={10}
        pairs={[{ role: 'BA', discipline: 'Analysis', hours: 16 }]}
        rateCards={[]}
        committer={committer}
        onClose={vi.fn()}
      />
    );

    // Shows the in-flight value (24), not the stale prop (16).
    expect(screen.getByLabelText('Hours for BA')).toHaveValue('24');
  });
});

describe('overlay dismissal guards', () => {
  it('marks the portaled role menu so Glide ClickOutsideContainer ignores it', async () => {
    const user = userEvent.setup();
    setup({ rateCards: [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })] });

    await user.click(screen.getByRole('combobox', { name: 'New role' }));

    const option = screen.getByRole('option', { name: 'BA' });
    // ClickOutsideContainer walks the target ancestor chain for this class;
    // without it, mousedown on this option dismisses the overlay before
    // onValueChange can fire and the picker is inert.
    expect(option.closest('.click-outside-ignore')).not.toBeNull();
    // ...and DataEditor isOutsideClick guard recognises it too.
    expect(isInsidePortaledMenu(option)).toBe(true);
  });

  it('lifts the rendered menu above #portal z-index:1000', async () => {
    const user = userEvent.setup();
    setup({ rateCards: [rateCard({ id: 1, role: 'BA', discipline: 'Analysis' })] });

    await user.click(screen.getByRole('combobox', { name: 'New role' }));

    // Asserted on the ELEMENT, not on the constant: a constant compared against
    // its own substring passes even when the class is never applied anywhere.
    // Radix copies the content's computed z-index onto its popper wrapper.
    const content = screen.getByRole('option', { name: 'BA' }).closest('[data-slot="select-content"]');
    expect(content).not.toBeNull();
    expect(content).toHaveClass('z-[1100]');
    expect(content).toHaveClass('click-outside-ignore');
  });

  it('applies the same guards to the phase menu', async () => {
    render(<PhaseEditor value={null} phaseOptions={['Phase 1']} onCommit={vi.fn()} onClose={vi.fn()} />);

    const content = (await screen.findByRole('option', { name: 'Phase 1' })).closest(
      '[data-slot="select-content"]'
    );
    expect(content).toHaveClass('z-[1100]');
    expect(content).toHaveClass('click-outside-ignore');
  });

  it('treats anything outside a portaled menu as a genuine outside click', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(isInsidePortaledMenu(div)).toBe(false);
    expect(isInsidePortaledMenu(null)).toBe(false);
    div.remove();
  });
});

describe('NameEditor', () => {
  function setupName() {
    const onCommit = vi.fn();
    const onDraftChange = vi.fn();
    const onCancel = vi.fn();
    render(
      <NameEditor value="Old" onDraftChange={onDraftChange} onCommit={onCommit} onCancel={onCancel} />
    );
    return { onCommit, onDraftChange, onCancel };
  }

  it('commits the typed name on Enter', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupName();

    const input = screen.getByLabelText('Task description');
    await user.clear(input);
    await user.type(input, 'New{Enter}');

    expect(onCommit).toHaveBeenCalledWith('New', [0, 1]);
  });

  it('commits the typed name on Tab', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupName();

    const input = screen.getByLabelText('Task description');
    await user.clear(input);
    await user.type(input, 'New');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith('New', [1, 0]);
  });

  // PRODUCT DECISION: Escape CANCELS the rename rather than committing it.
  it('cancels without committing on Escape', async () => {
    const user = userEvent.setup();
    const { onCommit, onCancel } = setupName();

    const input = screen.getByLabelText('Task description');
    await user.clear(input);
    await user.type(input, 'New{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not let the blur that follows a cancel commit the abandoned draft', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupName();

    const input = screen.getByLabelText('Task description');
    await user.clear(input);
    await user.type(input, 'New{Escape}');
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits only once, however many close paths fire', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupName();

    const input = screen.getByLabelText('Task description');
    await user.type(input, 'X{Enter}');
    await user.tab();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('mirrors each keystroke to Glide so its own close paths still commit', async () => {
    const user = userEvent.setup();
    const { onDraftChange } = setupName();

    await user.type(screen.getByLabelText('Task description'), 'X');

    expect(onDraftChange).toHaveBeenLastCalledWith('OldX');
  });
});

describe('PhaseEditor', () => {
  it('commits the picked phase', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PhaseEditor value={null} phaseOptions={['Phase 1', 'Phase 2']} onCommit={onCommit} onClose={vi.fn()} />
    );

    await user.click(await screen.findByRole('option', { name: 'Phase 2' }));

    expect(onCommit).toHaveBeenCalledWith('Phase 2');
  });

  it('commits null for Unassigned', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PhaseEditor value="Phase 1" phaseOptions={['Phase 1']} onCommit={onCommit} onClose={vi.fn()} />
    );

    await user.click(await screen.findByRole('option', { name: 'Unassigned' }));

    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('only offers live project phases, so a stale value can never be re-picked', async () => {
    render(
      <PhaseEditor value={null} phaseOptions={['Phase 1']} onCommit={vi.fn()} onClose={vi.fn()} />
    );

    expect(await screen.findByRole('option', { name: 'Phase 1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Deleted phase' })).not.toBeInTheDocument();
  });

  // `parsePhases` does not enforce unique names; duplicates would render two
  // SelectItems under identical React keys.
  it('de-duplicates repeated phase names', async () => {
    render(
      <PhaseEditor
        value={null}
        phaseOptions={['Phase 1', 'Phase 1', 'Phase 2']}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findAllByRole('option', { name: 'Phase 1' })).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(3); // Unassigned + two phases
  });

  // PRODUCT DECISION: Escape CANCELS.
  it('closes without committing on Escape', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(
      <PhaseEditor value="Phase 1" phaseOptions={['Phase 1', 'Phase 2']} onCommit={onCommit} onClose={onClose} />
    );

    await screen.findByRole('option', { name: 'Phase 2' });
    // The first Escape belongs to the open menu — the editor deliberately
    // leaves menu-local keys alone. The second reaches the editor itself.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Phase 2' })).toBeNull());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCommit).not.toHaveBeenCalled();
  });
});
