import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GraphError,
  __resetGraphTokenCache,
  directoryGroupIds,
  searchDirectoryUsers,
} from './graph';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('server/auth/graph', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetGraphTokenCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.ENTRA_TENANT_ID = 'tenant-1';
    process.env.ENTRA_CLIENT_ID = 'client-1';
    process.env.ENTRA_CLIENT_SECRET = 'secret-1';
    process.env.ENTRA_GROUP_ADMIN = 'grp-admin';
    process.env.ENTRA_GROUP_MANAGER = 'grp-manager';
    process.env.ENTRA_GROUP_USER = 'grp-user';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetGraphTokenCache();
  });

  it('reuses the app token until shortly before expiry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: 'oid-1', displayName: 'Ada', mail: 'ada@example.test' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: 'oid-1', displayName: 'Ada', mail: 'ada@example.test' }],
      }));

    await searchDirectoryUsers('ada');
    await searchDirectoryUsers('ada');

    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/oauth2/v2.0/token')
    );
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends $search with ConsistencyLevel: eventual and drops hits with no mail or UPN', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        value: [
          { id: 'oid-1', displayName: 'Has Mail', mail: 'has@example.test' },
          { id: 'oid-2', displayName: 'No Address' },
          { id: 'oid-3', displayName: 'Has UPN', userPrincipalName: 'upn@example.test' },
        ],
      }));

    const hits = await searchDirectoryUsers('sad');

    expect(hits).toEqual([
      { entraObjectId: 'oid-1', email: 'has@example.test', displayName: 'Has Mail' },
      { entraObjectId: 'oid-3', email: 'upn@example.test', displayName: 'Has UPN' },
    ]);

    const [, searchCall] = fetchMock.mock.calls;
    const searchUrl = new URL(String(searchCall[0]));
    expect(searchUrl.origin + searchUrl.pathname).toBe('https://graph.microsoft.com/v1.0/users');
    expect(searchUrl.searchParams.get('$search')).toBe(
      '"displayName:sad" OR "mail:sad" OR "userPrincipalName:sad"'
    );
    expect(searchUrl.searchParams.get('$count')).toBe('true');
    expect(searchUrl.searchParams.get('$top')).toBe('10');
    const searchHeaders = new Headers((searchCall[1] as RequestInit).headers);
    expect(searchHeaders.get('ConsistencyLevel')).toBe('eventual');
  });

  it('returns no hits and does not call Graph for a short query', async () => {
    const hits = await searchDirectoryUsers('x');
    expect(hits).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses checkMemberGroups value', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ value: ['grp-admin'] }));

    const groups = await directoryGroupIds('oid-1');
    expect(groups).toEqual(['grp-admin']);

    const [, groupCall] = fetchMock.mock.calls;
    expect(String(groupCall[0])).toBe(
      'https://graph.microsoft.com/v1.0/users/oid-1/checkMemberGroups'
    );
    expect(groupCall[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ groupIds: ['grp-admin', 'grp-manager', 'grp-user'] }),
    }));
  });

  it('turns a Graph error into a 502-class failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));

    const error = await searchDirectoryUsers('ada').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GraphError);
    expect(error).toMatchObject({ status: 502 });
  });

  it('maps Graph 403 to an authorized-directory message', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'Authorization_RequestDenied', message: 'Insufficient privileges' },
      }, 403));

    const error = await searchDirectoryUsers('ada').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GraphError);
    expect(error).toMatchObject({
      status: 502,
      message: 'Directory lookup is not authorized',
    });
  });
});
