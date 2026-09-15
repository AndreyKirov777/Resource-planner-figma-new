import React, { useEffect, useMemo, useState } from 'react';
import { api, ProjectMemberInfo, ProjectRole, UserInfo } from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  /** The current user's role on this project — People management is OWNER/ADMIN only. */
  myRole: ProjectRole;
}

type MemberRole = 'EDITOR' | 'VIEWER';

export function ShareDialog({ open, onOpenChange, projectId, myRole }: ShareDialogProps) {
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  const [members, setMembers] = useState<ProjectMemberInfo[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('EDITOR');

  useEffect(() => {
    if (!open || !canManage) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getMembers(projectId), api.getUsers()])
      .then(([m, u]) => {
        setMembers(m);
        setUsers(u);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sharing info'))
      .finally(() => setLoading(false));
  }, [open, canManage, projectId]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return users
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => u.displayName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [users, memberIds, query]);

  const handleAdd = async (userId: number) => {
    try {
      const member = await api.upsertMember(projectId, userId, addRole);
      setMembers((prev) => [...prev.filter((m) => m.userId !== userId), member]);
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleChangeRole = async (userId: number, role: MemberRole) => {
    try {
      const member = await api.upsertMember(projectId, userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === userId ? member : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const handleRemove = async (userId: number) => {
    try {
      await api.removeMember(projectId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>Manage who can see and edit this project.</DialogDescription>
        </DialogHeader>

        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            Only the project owner or an admin can manage sharing.
          </p>
        ) : (
          <div className="space-y-4" aria-label="People">
            {error && <div className="text-sm text-red-600">{error}</div>}
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{member.displayName}</div>
                        <div className="text-muted-foreground truncate">{member.email}</div>
                      </div>
                      {member.role === 'OWNER' ? (
                        <Badge variant="outline">Owner</Badge>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={member.role}
                            onValueChange={(value: MemberRole) => handleChangeRole(member.userId, value)}
                          >
                            <SelectTrigger className="w-28" aria-label={`Role for ${member.displayName}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EDITOR">Editor</SelectItem>
                              <SelectItem value="VIEWER">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemove(member.userId)}
                            aria-label={`Remove ${member.displayName}`}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or email"
                      aria-label="Search users to add"
                    />
                    <Select value={addRole} onValueChange={(value: MemberRole) => setAddRole(value)}>
                      <SelectTrigger className="w-28" aria-label="Role to add as">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="space-y-1">
                      {searchResults.map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{u.displayName}</div>
                            <div className="text-muted-foreground truncate">{u.email}</div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleAdd(u.id)}>
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {query.trim() && searchResults.length === 0 && (
                    <div className="text-sm text-muted-foreground">No matching user has signed in.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
