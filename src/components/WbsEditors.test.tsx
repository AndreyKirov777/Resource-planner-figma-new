import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NameEditor,
  PhaseEditor,
  RoadmapLinkEditor,
  isInsidePortaledMenu,
} from './WbsEditors';

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

describe('NameEditor', () => {
  it('commits typed names on Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <NameEditor
        value="Old"
        onDraftChange={vi.fn()}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Task description');
    await user.clear(input);
    await user.type(input, 'New{Enter}');
    expect(onCommit).toHaveBeenCalledWith('New', [0, 1]);
  });
});

describe('PhaseEditor', () => {
  it('commits the picked phase and keeps its portal above Glide', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PhaseEditor
        value={null}
        phaseOptions={['Phase 1']}
        onCommit={onCommit}
        onClose={vi.fn()}
      />
    );

    const option = await screen.findByRole('option', { name: 'Phase 1' });
    const content = option.closest('[data-slot="select-content"]');
    expect(content).toHaveClass('z-[1100]');
    expect(isInsidePortaledMenu(option)).toBe(true);
    await user.click(option);
    expect(onCommit).toHaveBeenCalledWith('Phase 1');
  });

  it('closes without committing on Escape', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(
      <PhaseEditor
        value="Phase 1"
        phaseOptions={['Phase 1', 'Phase 2']}
        onCommit={onCommit}
        onClose={onClose}
      />
    );

    await screen.findByRole('option', { name: 'Phase 2' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Phase 2' })).toBeNull());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('RoadmapLinkEditor', () => {
  it('commits null for None', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <RoadmapLinkEditor
        value={10}
        options={[{ id: 10, name: 'API' }]}
        onCommit={onCommit}
        onClose={vi.fn()}
      />
    );

    await user.click(await screen.findByRole('option', { name: 'None' }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });
});
