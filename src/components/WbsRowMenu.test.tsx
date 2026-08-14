import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WbsRowMenu } from './WbsRowMenu';

const base = {
  open: true,
  onOpenChange: vi.fn(),
  x: 10,
  y: 20,
  isMac: true,
  onAddChild: vi.fn(),
  onAddSibling: vi.fn(),
  onIndent: vi.fn(),
  onOutdent: vi.fn(),
  onDelete: vi.fn(),
};

describe('WbsRowMenu', () => {
  it('lists every action with its shortcut, including disabled no-ops', () => {
    render(<WbsRowMenu {...base} canIndent={false} canOutdent={false} />);

    expect(screen.getByRole('menuitem', { name: /add child/i })).toHaveTextContent('⌘↵');
    expect(screen.getByRole('menuitem', { name: /add sibling below/i })).toHaveTextContent('↵');
    expect(screen.getByRole('menuitem', { name: /indent/i })).toHaveTextContent('⇥');
    expect(screen.getByRole('menuitem', { name: /outdent/i })).toHaveTextContent('⇧⇥');
    expect(screen.getByRole('menuitem', { name: /delete/i })).toHaveTextContent('⌫');
    expect(screen.getByRole('menuitem', { name: /indent/i })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /outdent/i })).toHaveAttribute('data-disabled');
  });

  it('fires the matching callback for an enabled action', async () => {
    const user = userEvent.setup();
    const onAddChild = vi.fn();
    render(<WbsRowMenu {...base} canIndent onOutdent={vi.fn()} canOutdent onAddChild={onAddChild} />);

    await user.click(screen.getByRole('menuitem', { name: /add child/i }));
    expect(onAddChild).toHaveBeenCalled();
  });
});
