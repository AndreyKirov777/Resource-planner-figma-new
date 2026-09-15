import React, { useEffect, useState } from 'react';
import { api, UserInfo } from '../services/api';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Read-only directory of everyone who has signed in. Rendered only for ADMIN (see App.tsx). */
export function UsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading users…</div>;
  }

  if (error) {
    return <div className="text-red-800 bg-red-50 border border-red-200 rounded-md p-4">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Users</h2>
      {users.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">No one has signed in yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Last login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{user.group}</Badge>
                  {!user.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                </TableCell>
                <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
