import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { isConflict } from '../utils/apiErrors';

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

describe('optimistic concurrency: 409 becomes a ConflictError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updateProject throws ConflictError with updatedBy/updatedAt from a stale-version 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Conflict', updatedBy: 'Dev Manager', updatedAt: '2026-09-15T10:00:00Z', version: 3 }, 409)
      )
    );

    const err = await api.updateProject(1, { name: 'X', version: 2 }).catch((e) => e);
    expect(isConflict(err)).toBe(true);
    if (isConflict(err)) {
      expect(err.updatedBy).toBe('Dev Manager');
      expect(err.updatedAt).toBe('2026-09-15T10:00:00Z');
    }
  });

  it('a 409 that is not a version conflict (e.g. an unrelated business rule) stays a plain Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Rate card is empty.' }, 409)));

    const err = await api.updateProject(1, { name: 'X' }).catch((e) => e);
    expect(isConflict(err)).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Rate card is empty.');
  });
});
