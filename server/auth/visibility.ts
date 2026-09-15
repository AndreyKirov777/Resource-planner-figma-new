import type { NextFunction, Request, Response } from 'express';

/**
 * Every key that carries an internal (non-client-facing) figure anywhere in
 * the API: internal rates, the project's margin/exchange-rate knobs, and the
 * nine GlobalRateCard regional columns. Checked once here rather than
 * per-route so a new internal field can't leak by omission — see
 * visibility.test.ts, which pins this exact list.
 */
export const INTERNAL_KEYS: readonly string[] = [
  'intRate',
  'intHourlyRate',
  'defaultMargin',
  'exchangeRate',
  'ukraine',
  'easternEurope',
  'asiaGE',
  'asiaARMKZ',
  'latam',
  'mexico',
  'india',
  'newYork',
  'london',
];

const INTERNAL_KEY_SET = new Set(INTERNAL_KEYS);

/** Recursively strips INTERNAL_KEYS from an object/array, leaving every other key untouched. */
export function omitDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEY_SET.has(key)) continue;
      result[key] = omitDeep(val);
    }
    return result as T;
  }
  return value;
}

/**
 * Mounted after requireAuth. For a USER caller: incoming write bodies are
 * stripped of internal keys before any handler sees them (so a spoofed
 * `intHourlyRate` in the body is silently dropped, never stored), and every
 * JSON response is stripped the same way before it reaches the wire. Every
 * other group passes through untouched.
 */
export function userFilterMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.group !== 'USER') {
    return next();
  }
  if (req.body && typeof req.body === 'object') {
    req.body = omitDeep(req.body);
  }
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => originalJson(omitDeep(body))) as Response['json'];
  next();
}
