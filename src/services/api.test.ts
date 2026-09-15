import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('api 401 handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects to /auth/login on a 401 response, outside /client/', async () => {
    const location = { pathname: '/projects', search: '', href: '' };
    vi.stubGlobal('location', location);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401)));

    await expect(api.getMe()).rejects.toThrow('Failed to fetch current user');

    expect(location.href).toBe('/auth/login?returnTo=%2Fprojects');
  });

  it('does not redirect on a 401 while on the public client view', async () => {
    const location = { pathname: '/client/abc123', search: '', href: '' };
    vi.stubGlobal('location', location);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Not found' }, 401)));

    await expect(api.getMe()).rejects.toThrow('Failed to fetch current user');

    expect(location.href).toBe('');
  });
});
