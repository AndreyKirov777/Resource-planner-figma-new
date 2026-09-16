export class GraphError extends Error {
  status = 502 as const;

  constructor(message = 'Directory lookup failed') {
    super(message);
    this.name = 'GraphError';
  }
}

export interface DirectoryHit {
  entraObjectId: string;
  email: string;
  displayName: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/** Exposed for tests: drop the in-memory app token. */
export function __resetGraphTokenCache(): void {
  tokenCache = null;
}

function escapeOData(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function configuredGroupIds(): string[] {
  return [process.env.ENTRA_GROUP_ADMIN, process.env.ENTRA_GROUP_MANAGER, process.env.ENTRA_GROUP_USER]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
}

async function graphJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let code = '';
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? '';
      console.error(`Graph ${response.status} ${code}: ${body.error?.message ?? fallback}`);
    } catch {
      console.error(`Graph ${response.status}: ${fallback}`);
    }
    if (response.status === 403 || code === 'Authorization_RequestDenied') {
      throw new GraphError('Directory lookup is not authorized');
    }
    throw new GraphError(fallback);
  }
  return response.json() as Promise<T>;
}

async function getAppToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new GraphError('Directory lookup is not configured');
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const body = await graphJson<{ access_token?: string; expires_in?: number }>(
    response,
    'Failed to obtain a directory token'
  );
  if (!body.access_token) {
    throw new GraphError('Failed to obtain a directory token');
  }

  const ttlMs = Math.max(0, ((body.expires_in ?? 3600) - 60) * 1000);
  tokenCache = { accessToken: body.access_token, expiresAt: Date.now() + ttlMs };
  return body.access_token;
}

async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAppToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

function hitFromGraphUser(row: {
  id?: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
}): DirectoryHit | null {
  if (!row.id) return null;
  const email = (row.mail || row.userPrincipalName || '').trim();
  if (!email) return null;
  return {
    entraObjectId: row.id,
    email,
    displayName: (row.displayName || email).trim() || email,
  };
}

export async function searchDirectoryUsers(q: string): Promise<DirectoryHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const escaped = escapeOData(query);
  const url = new URL('https://graph.microsoft.com/v1.0/users');
  url.searchParams.set('$search', `"displayName:${escaped}" OR "mail:${escaped}" OR "userPrincipalName:${escaped}"`);
  url.searchParams.set('$select', 'id,displayName,mail,userPrincipalName');
  url.searchParams.set('$count', 'true');
  url.searchParams.set('$top', '10');

  const response = await graphFetch(url.toString(), { headers: { ConsistencyLevel: 'eventual' } });
  const body = await graphJson<{ value?: Array<Parameters<typeof hitFromGraphUser>[0]> }>(
    response,
    'Directory search failed'
  );
  return (body.value ?? []).flatMap((row) => {
    const hit = hitFromGraphUser(row);
    return hit ? [hit] : [];
  });
}

export async function getDirectoryUser(entraObjectId: string): Promise<DirectoryHit | null> {
  const response = await graphFetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(entraObjectId)}?$select=id,displayName,mail,userPrincipalName`
  );
  if (response.status === 404) return null;
  const row = await graphJson<Parameters<typeof hitFromGraphUser>[0]>(response, 'Directory lookup failed');
  return hitFromGraphUser(row);
}

export async function directoryGroupIds(entraObjectId: string): Promise<string[]> {
  const groupIds = configuredGroupIds();
  if (groupIds.length === 0) return [];

  const response = await graphFetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(entraObjectId)}/checkMemberGroups`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    }
  );
  const body = await graphJson<{ value?: string[] }>(response, 'Directory group check failed');
  return body.value ?? [];
}
