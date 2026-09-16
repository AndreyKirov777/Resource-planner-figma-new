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
    searchDirectoryUsers: vi.fn(),
    addMember: vi.fn(),
    upsertMember: vi.fn(),
    removeMember: vi.fn(),
    getShareLinks: vi.fn(),
    createShareLink: vi.fn(),
    revokeShareLink: vi.fn(),
  },
}));

const MEMBERS = [
  { userId: 1, role: 'OWNER' as const, email: 'admin@example.test', displayName: 'Dev Admin', group: 'ADMIN' as const },
  { userId: 2, role: 'EDITOR' as const, email: 'manager@example.test', displayName: 'Dev Manager', group: 'MANAGER' as const },
];

const DIRECTORY_HIT = {
  entraObjectId: 'dev-user',
  email: 'user@example.test',
  displayName: 'Dev User',
  userId: 3,
};

const SHARE_LINKS = [
  {
    id: 1,
    token: 'tok-abc123',
    projectId: 1,
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdById: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    createdBy: { displayName: 'Dev Admin' },
  },
];

beforeEach(() => {
  vi.mocked(api.getMembers).mockReset();
  vi.mocked(api.searchDirectoryUsers).mockReset();
  vi.mocked(api.addMember).mockReset();
  vi.mocked(api.upsertMember).mockReset();
  vi.mocked(api.removeMember).mockReset();
  vi.mocked(api.getShareLinks).mockReset();
  vi.mocked(api.createShareLink).mockReset();
  vi.mocked(api.revokeShareLink).mockReset();

  vi.mocked(api.getMembers).mockResolvedValue(MEMBERS);
  vi.mocked(api.searchDirectoryUsers).mockResolvedValue([DIRECTORY_HIT]);
  vi.mocked(api.addMember).mockResolvedValue({
    userId: 3, role: 'EDITOR', email: 'user@example.test', displayName: 'Dev User', group: 'USER',
  });
  vi.mocked(api.upsertMember).mockResolvedValue({
    userId: 3, role: 'EDITOR', email: 'user@example.test', displayName: 'Dev User', group: 'USER',
  });
  vi.mocked(api.removeMember).mockResolvedValue(undefined);
  vi.mocked(api.getShareLinks).mockResolvedValue([]);
  vi.mocked(api.createShareLink).mockResolvedValue(SHARE_LINKS[0]);
  vi.mocked(api.revokeShareLink).mockResolvedValue(undefined);
});

describe('ShareDialog — People section', () => {
  it('shows no People section for an EDITOR (but does show Client links, an EDITOR write action)', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="EDITOR" />);
    await waitFor(() => {
      expect(screen.getByLabelText('Client links')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('People')).not.toBeInTheDocument();
    expect(screen.queryByText(/only the project owner or an admin/i)).not.toBeInTheDocument();
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

  it('does not search for fewer than two characters', async () => {
    const user = userEvent.setup();
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'D');
    await new Promise((r) => setTimeout(r, 400));
    expect(api.searchDirectoryUsers).not.toHaveBeenCalled();
  });

  it('searches the directory and adds by entraObjectId', async () => {
    const user = userEvent.setup();
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'Dev User');
    const addButton = await screen.findByRole('button', { name: 'Add' });
    await user.click(addButton);

    await waitFor(() => {
      expect(api.searchDirectoryUsers).toHaveBeenCalledWith(1, 'Dev User', expect.any(AbortSignal));
      expect(api.addMember).toHaveBeenCalledWith(1, 'dev-user', 'EDITOR');
    });
  });

  it('adds a directory hit who has never signed in', async () => {
    const user = userEvent.setup();
    vi.mocked(api.searchDirectoryUsers).mockResolvedValue([{
      entraObjectId: 'oid-new',
      email: 'new@example.test',
      displayName: 'New Person',
      userId: null,
    }]);
    vi.mocked(api.addMember).mockResolvedValue({
      userId: 9, role: 'EDITOR', email: 'new@example.test', displayName: 'New Person', group: 'USER',
    });
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'New');
    await user.click(await screen.findByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(api.addMember).toHaveBeenCalledWith(1, 'oid-new', 'EDITOR');
    });
    expect(await screen.findByText('New Person')).toBeInTheDocument();
  });

  it('shows the 403 message when add is refused', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addMember).mockRejectedValue(new Error('This person does not have access to Resource Planner'));
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'Dev User');
    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(await screen.findByText('This person does not have access to Resource Planner')).toBeInTheDocument();
  });

  it('shows empty directory copy when nothing matches', async () => {
    const user = userEvent.setup();
    vi.mocked(api.searchDirectoryUsers).mockResolvedValue([]);
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);
    await screen.findByText('Dev Admin');

    await user.type(screen.getByLabelText('Search users to add'), 'zz');
    expect(await screen.findByText('No matching people in the directory.')).toBeInTheDocument();
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

describe('ShareDialog — Client links section', () => {
  it('a VIEWER sees no Client links section at all', async () => {
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="VIEWER" />);
    await waitFor(() => {
      expect(screen.getByText(/only the project owner or an admin/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Client links')).not.toBeInTheDocument();
    expect(api.getShareLinks).not.toHaveBeenCalled();
  });

  it('lists existing links for an EDITOR and creates a new one', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getShareLinks).mockResolvedValue(SHARE_LINKS);
    vi.mocked(api.createShareLink).mockResolvedValue({ ...SHARE_LINKS[0], id: 2, token: 'tok-newnew' });
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="EDITOR" />);

    await screen.findByText(/tok-abc123/);

    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(api.createShareLink).toHaveBeenCalledWith(1, 30);
    });
  });

  it('revokes an active link', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getShareLinks).mockResolvedValue(SHARE_LINKS);
    render(<ShareDialog open onOpenChange={vi.fn()} projectId={1} myRole="OWNER" />);

    await screen.findByText(/tok-abc123/);
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(api.revokeShareLink).toHaveBeenCalledWith(1);
    });
  });
});
