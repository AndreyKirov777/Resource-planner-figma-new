import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_UNREACHABLE_MESSAGE, ConflictError, describeError, isConflict, isNetworkFetchError, redirectToLogin } from './apiErrors';

describe('describeError', () => {
  it('rewrites the browser\'s native fetch TypeError into an actionable API-down message', () => {
    expect(describeError(new TypeError('Failed to fetch'), 'fallback')).toBe(API_UNREACHABLE_MESSAGE);
    expect(describeError(new TypeError('Load failed'), 'fallback')).toBe(API_UNREACHABLE_MESSAGE);
    expect(describeError(new TypeError('NetworkError when attempting to fetch resource'), 'fallback')).toBe(
      API_UNREACHABLE_MESSAGE
    );
  });

  it('passes through other Error messages and non-Error values via the fallback', () => {
    expect(describeError(new Error('Failed to create resource plan'), 'fallback')).toBe(
      'Failed to create resource plan'
    );
    expect(describeError(new TypeError("Cannot read properties of undefined (reading 'id')"), 'fallback')).toBe(
      "Cannot read properties of undefined (reading 'id')"
    );
    expect(describeError('not-an-error', 'fallback')).toBe('fallback');
  });
});

describe('isNetworkFetchError', () => {
  it('is true only for the native network-failure messages', () => {
    expect(isNetworkFetchError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFetchError(new Error('Failed to fetch projects'))).toBe(false);
  });
});

describe('redirectToLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigates to /auth/login with the current path and query as returnTo', () => {
    const location = { pathname: '/projects/5', search: '?tab=plan', href: '' };
    vi.stubGlobal('location', location);

    redirectToLogin();

    expect(location.href).toBe('/auth/login?returnTo=%2Fprojects%2F5%3Ftab%3Dplan');
  });

  it('does nothing on the public /client/:token page', () => {
    const location = { pathname: '/client/abc123', search: '', href: 'https://example.test/client/abc123' };
    vi.stubGlobal('location', location);

    redirectToLogin();

    expect(location.href).toBe('https://example.test/client/abc123');
  });
});

describe('ConflictError / isConflict', () => {
  it('carries who last wrote the row and when', () => {
    const err = new ConflictError('Dev Manager', '2026-09-15T10:00:00Z');
    expect(err.updatedBy).toBe('Dev Manager');
    expect(err.updatedAt).toBe('2026-09-15T10:00:00Z');
    expect(err.name).toBe('ConflictError');
    expect(err).toBeInstanceOf(Error);
  });

  it('isConflict narrows only ConflictError instances', () => {
    expect(isConflict(new ConflictError(null, '2026-09-15T10:00:00Z'))).toBe(true);
    expect(isConflict(new Error('plain error'))).toBe(false);
    expect(isConflict('not-an-error')).toBe(false);
  });
});
