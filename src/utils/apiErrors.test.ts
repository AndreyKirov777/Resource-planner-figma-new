import { describe, it, expect } from 'vitest';
import { API_UNREACHABLE_MESSAGE, describeError, isNetworkFetchError } from './apiErrors';

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
