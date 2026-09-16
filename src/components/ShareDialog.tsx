import React, { useEffect, useState } from 'react';
import { api, DirectoryUser, ProjectMemberInfo, ProjectRole, ShareLink, ShareLinkDays } from '../services/api';
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

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  return Promise.resolve();
}

export function ShareDialog({ open, onOpenChange, projectId, myRole }: ShareDialogProps) {
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  // Any write role can create/copy/revoke a client link; only VIEWER cannot.
  const canWriteLinks = myRole !== 'VIEWER';
  const [members, setMembers] = useState<ProjectMemberInfo[]>([]);
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('EDITOR');

  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [newLinkDays, setNewLinkDays] = useState<ShareLinkDays>(30);
  const [creatingLink, setCreatingLink] = useState(false);

  useEffect(() => {
    if (!open || !canManage) return;
    setLoading(true);
    setError(null);
    api.getMembers(projectId)
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load sharing info'))
      .finally(() => setLoading(false));
  }, [open, canManage, projectId]);

  useEffect(() => {
    if (!open || !canManage) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.searchDirectoryUsers(projectId, q, controller.signal)
        .then((hits) => {
          if (!controller.signal.aborted) setResults(hits);
        })
        .catch((err) => {
          if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
          setError(err instanceof Error ? err.message : 'Failed to search directory');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, canManage, projectId]);

  useEffect(() => {
    if (!open || !canWriteLinks) return;
    setLinksLoading(true);
    setLinksError(null);
    api.getShareLinks(projectId)
      .then(setShareLinks)
      .catch((err) => setLinksError(err instanceof Error ? err.message : 'Failed to load client links'))
      .finally(() => setLinksLoading(false));
  }, [open, canWriteLinks, projectId]);

  const handleCreateLink = async () => {
    setCreatingLink(true);
    setLinksError(null);
    try {
      const link = await api.createShareLink(projectId, newLinkDays);
      setShareLinks((prev) => [link, ...prev]);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : 'Failed to create client link');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (id: number) => {
    try {
      await api.revokeShareLink(id);
      setShareLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, revokedAt: new Date().toISOString() } : l))
      );
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : 'Failed to revoke client link');
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/client/${token}`;
    copyToClipboard(url).then(() => alert('Client link copied to clipboard'));
  };

  const handleAdd = async (entraObjectId: string) => {
    try {
      const member = await api.addMember(projectId, entraObjectId, addRole);
      setMembers((prev) => [...prev.filter((m) => m.userId !== member.userId), member]);
      setQuery('');
      setResults([]);
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

        {!canManage && !canWriteLinks && (
          <p className="text-sm text-muted-foreground">
            Only the project owner or an admin can manage sharing.
          </p>
        )}

        {canManage && (
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
                  {results.length > 0 && (
                    <div className="space-y-1">
                      {results.map((u) => (
                        <div key={u.entraObjectId} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{u.displayName}</div>
                            <div className="text-muted-foreground truncate">{u.email}</div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleAdd(u.entraObjectId)}>
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {query.trim().length >= 2 && !searching && results.length === 0 && (
                    <div className="text-sm text-muted-foreground">No matching people in the directory.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {canWriteLinks && (
          <div className={`space-y-3 text-sm ${canManage ? 'border-t pt-4' : ''}`} aria-label="Client links">
            <div className="font-medium">Client links</div>
            {linksError && <div className="text-sm text-red-600">{linksError}</div>}
            <div className="flex items-center gap-2">
              <Select value={String(newLinkDays)} onValueChange={(value) => setNewLinkDays(Number(value) as ShareLinkDays)}>
                <SelectTrigger className="w-32" aria-label="Link validity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleCreateLink} disabled={creatingLink}>
                {creatingLink ? 'Creating…' : 'Create link'}
              </Button>
            </div>
            {linksLoading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : shareLinks.length === 0 ? (
              <div className="text-muted-foreground">No client links yet.</div>
            ) : (
              <div className="space-y-2">
                {shareLinks.map((link) => {
                  const revoked = !!link.revokedAt;
                  const expired = !revoked && new Date(link.expiresAt).getTime() <= Date.now();
                  const inactive = revoked || expired;
                  return (
                    <div key={link.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-muted-foreground">
                          {window.location.origin}/client/{link.token}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {revoked
                            ? 'Revoked'
                            : expired
                              ? 'Expired'
                              : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                          {link.createdBy?.displayName ? ` · Created by ${link.createdBy.displayName}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(link.token)}
                          disabled={inactive}
                        >
                          Copy
                        </Button>
                        {!revoked && (
                          <Button variant="outline" size="sm" onClick={() => handleRevokeLink(link.id)}>
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
