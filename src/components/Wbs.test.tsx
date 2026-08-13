import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wbs } from './Wbs';
import type { Project, RateCard, WbsItem } from '../services/api';

// Radix Select relies on pointer-capture / scrollIntoView APIs jsdom doesn't
// implement; polyfill them so tests can open the "+ Add discipline" Select
// and the Phase Select via ordinary userEvent clicks.
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

function wbsItem(overrides: Partial<WbsItem>): WbsItem {
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

function rateCard(overrides: Partial<RateCard>): RateCard {
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

const mockProject: Project = {
  id: 1,
  name: 'Test Project',
  description: '',
  daysInFTE: 20,
  clientCurrency: 'USD',
  exchangeRate: 1,
  defaultMargin: 25,
  planningMode: 'weekly',
  phases: JSON.stringify([{ name: 'Phase 1', periodCount: 4, color: '#E3F2FD' }]),
  createdAt: '',
  updatedAt: '',
};

function defaultProps(wbsItems: WbsItem[]) {
  return {
    project: mockProject,
    resourcePlans: [],
    rateCards: [],
    wbsItems,
    onAddWbsItem: vi.fn().mockResolvedValue(wbsItem({ id: 999 })),
    onUpdateWbsItem: vi.fn().mockResolvedValue(undefined),
    onDeleteWbsItem: vi.fn().mockResolvedValue(undefined),
    onReplaceWbsEstimates: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Wbs', () => {
  it('renders an empty state with an Add root item button when there are no items', () => {
    render(<Wbs {...defaultProps([])} />);
    expect(screen.getByText(/no wbs items yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add root item/i })).toBeInTheDocument();
  });

  it('indents a 2-level tree by depth', () => {
    const items = [
      wbsItem({ id: 1, name: 'Root', parentId: null }),
      wbsItem({ id: 2, name: 'Child', parentId: 1 }),
    ];
    render(<Wbs {...defaultProps(items)} />);

    const rootInput = screen.getByDisplayValue('Root') as HTMLInputElement;
    const childInput = screen.getByDisplayValue('Child') as HTMLInputElement;

    expect(rootInput.parentElement).toHaveStyle({ paddingLeft: '0px' });
    expect(childInput.parentElement).toHaveStyle({ paddingLeft: '20px' });
  });

  it('calls onAddWbsItem with a root-level payload when Add root item is clicked', async () => {
    const user = userEvent.setup();
    const props = defaultProps([]);
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: /add root item/i }));

    expect(props.onAddWbsItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New item', parentId: null, displayOrder: 0 })
    );
  });

  it('editing a discipline cell calls onReplaceWbsEstimates with the merged full estimate set', async () => {
    const user = userEvent.setup();
    const items = [
      wbsItem({
        id: 10,
        name: 'Task',
        parentId: null,
        estimates: [
          { id: 1, discipline: 'Engineering', role: '', hours: 5, wbsItemId: 10, createdAt: '', updatedAt: '' },
          { id: 2, discipline: 'Design', role: 'lead', hours: 3, wbsItemId: 10, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    const hoursInput = screen.getByLabelText('Engineering hours for item 10');
    await user.clear(hoursInput);
    await user.type(hoursInput, '8');
    await user.tab();

    expect(props.onReplaceWbsEstimates).toHaveBeenCalledTimes(1);
    const [calledId, calledEstimates] = props.onReplaceWbsEstimates.mock.calls[0];
    expect(calledId).toBe(10);
    expect(calledEstimates).toHaveLength(2);
    expect(calledEstimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ discipline: 'Design', role: 'lead', hours: 3 }),
        expect.objectContaining({ discipline: 'Engineering', role: '', hours: 8 }),
      ])
    );
  });

  it('two rapid edits on different discipline cells of the same row both survive (no lost update)', async () => {
    const user = userEvent.setup();
    const items = [
      wbsItem({
        id: 10,
        name: 'Task',
        parentId: null,
        estimates: [
          { id: 1, discipline: 'Engineering', role: '', hours: 5, wbsItemId: 10, createdAt: '', updatedAt: '' },
        ],
      }),
    ];

    // Controllable/delayed mock: the first replaceWbsEstimates call only
    // resolves once we explicitly release it, after the second edit has
    // already been triggered — reproducing the race.
    let releaseFirstCall: (() => void) | undefined;
    let callCount = 0;
    const onReplaceWbsEstimates = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<void>((resolve) => {
          releaseFirstCall = resolve;
        });
      }
      return Promise.resolve();
    });

    const props = { ...defaultProps(items), onReplaceWbsEstimates };
    render(<Wbs {...props} />);

    // Edit discipline A (Engineering) and blur — commitHours #1 fires and
    // hangs (its onReplaceWbsEstimates promise is not yet resolved).
    const engineeringInput = screen.getByLabelText('Engineering hours for item 10');
    await user.clear(engineeringInput);
    await user.type(engineeringInput, '8');
    await user.tab();
    expect(onReplaceWbsEstimates).toHaveBeenCalledTimes(1);

    // Without awaiting the first edit's resolution, add a second discipline
    // column and edit it on the same row.
    await user.click(screen.getByRole('button', { name: /\+ add discipline/i }));
    await user.type(screen.getByLabelText('New discipline name'), 'Design');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const designInput = screen.getByLabelText('Design hours for item 10');
    await user.clear(designInput);
    await user.type(designInput, '3');
    await user.tab();

    // The second commit is chained after the first and hasn't fired yet.
    expect(onReplaceWbsEstimates).toHaveBeenCalledTimes(1);

    // Now let the first call resolve; the second (queued) call should then fire.
    releaseFirstCall?.();
    await waitFor(() => expect(onReplaceWbsEstimates).toHaveBeenCalledTimes(2));

    const [, secondCallEstimates] = onReplaceWbsEstimates.mock.calls[1];
    expect(secondCallEstimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ discipline: 'Engineering', role: '', hours: 8 }),
        expect.objectContaining({ discipline: 'Design', role: '', hours: 3 }),
      ])
    );
  });

  it('deleting an item with descendants confirms naming the descendant count, then deletes on confirm', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const items = [
      wbsItem({ id: 1, name: 'Root', parentId: null }),
      wbsItem({ id: 2, name: 'Child A', parentId: 1 }),
      wbsItem({ id: 3, name: 'Child B', parentId: 1 }),
      wbsItem({ id: 4, name: 'Grandchild', parentId: 2 }),
    ];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    const rootInput = screen.getByDisplayValue('Root');
    const rootRow = rootInput.closest('tr')!;
    const deleteButton = within(rootRow).getByRole('button', { name: /delete/i });

    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3'));
    expect(props.onDeleteWbsItem).toHaveBeenCalledWith(1);

    vi.unstubAllGlobals();
  });

  it('does not call onDeleteWbsItem when the user cancels the confirm', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    const items = [wbsItem({ id: 1, name: 'Root', parentId: null })];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    expect(props.onDeleteWbsItem).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('clicking a row\'s + Child button calls onAddWbsItem with that row\'s id as parentId', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 7, name: 'Root', parentId: null })];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    const rootInput = screen.getByDisplayValue('Root');
    const rootRow = rootInput.closest('tr')!;
    const addChildButton = within(rootRow).getByRole('button', { name: /\+ child/i });

    await user.click(addChildButton);

    expect(props.onAddWbsItem).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 7 })
    );
  });

  it('selecting Unassigned in the Phase select calls onUpdateWbsItem with phaseName: null', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 1, name: 'Root', parentId: null, phaseName: 'Phase 1' })];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    await user.click(screen.getByLabelText('Phase for item 1'));
    await user.click(screen.getByRole('option', { name: 'Unassigned' }));

    expect(props.onUpdateWbsItem).toHaveBeenCalledWith(1, { phaseName: null });
  });

  it('clearing the Name input to blank and blurring reverts locally without calling onUpdateWbsItem', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 1, name: 'Root', parentId: null })];
    const props = defaultProps(items);
    render(<Wbs {...props} />);

    const nameInput = screen.getByLabelText('Name for item 1');
    await user.clear(nameInput);
    await user.tab();

    expect(props.onUpdateWbsItem).not.toHaveBeenCalled();
    // Reverts to the last-known name rather than staying blank.
    expect(screen.getByDisplayValue('Root')).toBeInTheDocument();
  });

  it('with rate-card entries present, selecting a discipline and clicking Add adds a column with that header', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 1, name: 'Root', parentId: null })];
    const props = {
      ...defaultProps(items),
      rateCards: [rateCard({ discipline: 'Design' }), rateCard({ discipline: 'QA' })],
    };
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: /\+ add discipline/i }));
    await user.click(screen.getByRole('combobox', { name: 'New discipline' }));
    await user.click(screen.getByRole('option', { name: 'QA' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('columnheader', { name: 'QA' })).toBeInTheDocument();
  });

  it('with no rate cards, typing a free-text discipline name and clicking Add adds a column with that name', async () => {
    const user = userEvent.setup();
    const items = [wbsItem({ id: 1, name: 'Root', parentId: null })];
    const props = { ...defaultProps(items), rateCards: [] };
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: /\+ add discipline/i }));
    await user.type(screen.getByLabelText('New discipline name'), 'Marketing');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('columnheader', { name: 'Marketing' })).toBeInTheDocument();
  });

  it('the discipline picker only offers rate-card disciplines not already shown as a column', async () => {
    const user = userEvent.setup();
    const items = [
      wbsItem({
        id: 1,
        name: 'Root',
        parentId: null,
        estimates: [
          { id: 1, discipline: 'Design', role: '', hours: 2, wbsItemId: 1, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    const props = {
      ...defaultProps(items),
      rateCards: [rateCard({ discipline: 'Design' }), rateCard({ discipline: 'QA' })],
    };
    render(<Wbs {...props} />);

    // "Design" is already a column (it has an estimate); only "QA" should be offered.
    await user.click(screen.getByRole('button', { name: /\+ add discipline/i }));
    await user.click(screen.getByRole('combobox', { name: 'New discipline' }));

    expect(screen.getByRole('option', { name: 'QA' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Design' })).not.toBeInTheDocument();
  });

  it('falls back to the free-text Input when every rate-card discipline is already a column', async () => {
    const user = userEvent.setup();
    const items = [
      wbsItem({
        id: 1,
        name: 'Root',
        parentId: null,
        estimates: [
          { id: 1, discipline: 'Design', role: '', hours: 2, wbsItemId: 1, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    const props = {
      ...defaultProps(items),
      // The only rate-card discipline is already shown as a column.
      rateCards: [rateCard({ discipline: 'Design' })],
    };
    render(<Wbs {...props} />);

    await user.click(screen.getByRole('button', { name: /\+ add discipline/i }));

    expect(screen.getByLabelText('New discipline name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New discipline' })).not.toBeInTheDocument();
  });
});
