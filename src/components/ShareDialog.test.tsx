import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareDialog } from './ShareDialog';
import { api } from '../services/api';

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

vi.mock('../services/api', () => ({
  api: {
    getMembers: vi.fn(),
    getUsers: vi.fn(),
    upsertMember: vi.fn(),
    removeMember: vi.fn(),
  },
}));

const MEMBERS = [
  { userId: 1, role: 'OWNER' as const, email: 'admin@example.test', displayName: 'Dev Admin', group: 'ADMIN' as const },
  { userId: 2, role: 'EDITOR' as const, email: 'manager@example.test', displayName: 'Dev Manager', group: 'MANAGER' as const },
];

const USERS = [
  { id: 1, email: 'admin@example.test', displayName: 'Dev Admin', group: 'ADMIN' as const, isActive: true, lastLoginAt: null },
  { id: 2, email: 'manager@example.test', displayName: 'Dev Manager', group: 'MANAGER' as const, isActive: true, lastLoginAt: null },
  { id: 3, email: 'user@example.test', displayName: 'Dev User', group: 'USER' as const, isActive: true, lastLoginAt: null },
];

beforeEach(() => {
  vi.mocked(api.getMembers).mockResolvedValue(MEMBERS);
  vi.mocked(api.getUsers).mockResolvedValue(USERS);
  vi.mocked(api.upsertMember).mockResolvedValue({
    userId: 3, role: 'EDITOR', email: 'user@example.test', displayName: 'Dev User', group: 'USER',
  });
  vi.mocked(api.removeMember).mockResolvedValue(undefined);
});

describe('ShareDialog — People section', () => {
  it('shows no People section for an EDITOR', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="EDITOR" />);
    await waitFor(() => {
      expect(screen.getByText(/only the project owner or an admin/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('People')).not.toBeInTheDocument();
    expect(api.getMembers).not.toHaveBeenCalled();
  });

  it('shows no People section for a VIEWER', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="VIEWER" />);
    await waitFor(() => {
      expect(screen.getByText(/only the project owner or an admin/i)).toBeInTheDocument();
    });
    expect(api.getMembers).not.toHaveBeenCalled();
  });

  it('lists current members for an OWNER', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Dev Manager')).toBeInTheDocument();
  });

  it('lists current members for an ADMIN', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="ADMIN" />);
    await screen.findByText('Dev Admin');
    expect(api.getMembers).toHaveBeenCalledWith(1);
  });

  it('searches and adds a new member', async () => {
    const user = userEvent.setup();
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'Dev User');
    const addButton = await screen.findByRole('button', { name: 'Add' });
    await user.click(addButton);

    await waitFor(() => {
      expect(api.upsertMember).toHaveBeenCalledWith(1, 3, 'EDITOR');
    });
  });

  it('changes an existing member role', async () => {
    const user = userEvent.setup();
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Manager');

    await user.click(screen.getByRole('combobox', { name: 'Role for Dev Manager' }));
    await user.click(await screen.findByRole('option', { name: 'Viewer' }));

    await waitFor(() => {
      expect(api.upsertMember).toHaveBeenCalledWith(1, 2, 'VIEWER');
    });
  });

  it('removes a member', async () => {
    const user = userEvent.setup();
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Manager');

    await user.click(screen.getByRole('button', { name: 'Remove Dev Manager' }));

    await waitFor(() => {
      expect(api.removeMember).toHaveBeenCalledWith(1, 2);
    });
  });

  it('never offers to change or remove the OWNER row', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');
    expect(screen.queryByRole('button', { name: 'Remove Dev Admin' })).not.toBeInTheDocument();
  });
});
