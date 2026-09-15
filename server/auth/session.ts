import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../../src/generated/prisma';
import type { Group } from './groups';

export const SESSION_COOKIE_NAME = 'rp_session';

const SLIDING_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const TOUCH_THROTTLE_MS = 5 * 60 * 1000; // 5min

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
  group: Group;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: { id: string; userId: number };
    }
  }
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        const key = decodeURIComponent(part.slice(0, idx));
        const value = decodeURIComponent(part.slice(idx + 1));
        return [key, value];
      })
  );
}

export function isSecureCookie(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

function cookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureCookie(env),
    path: '/',
  };
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    ...cookieOptions(),
    maxAge: ABSOLUTE_LIFETIME_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { ...cookieOptions() });
}

function computeExpiry(createdAt: Date, from: Date): Date {
  const sliding = from.getTime() + SLIDING_WINDOW_MS;
  const absolute = createdAt.getTime() + ABSOLUTE_LIFETIME_MS;
  return new Date(Math.min(sliding, absolute));
}

export async function createSession(prisma: PrismaClient, userId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  const now = new Date();
  await prisma.session.create({
    data: {
      id,
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: computeExpiry(now, now),
    },
  });
  return id;
}

export async function pruneExpired(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/**
 * Mounted on `/api`. Loads the session + user for the cookie in one query;
 * 401 (JSON) when missing, expired, or the user was deactivated. Touches
 * `lastSeenAt`/`expiresAt` at most once per 5 minutes (fire-and-forget) so
 * repeated requests don't hammer SQLite under `connection_limit=1`.
 */
export function requireAuth(prisma: PrismaClient) {
  return async function requireAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || !session.user || !session.user.isActive) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    if (now.getTime() > session.expiresAt.getTime()) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
      const expiresAt = computeExpiry(session.createdAt, now);
      prisma.session
        .update({ where: { id: sessionId }, data: { lastSeenAt: now, expiresAt } })
        .catch(() => {});
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      group: session.user.group,
      isActive: session.user.isActive,
    };
    req.session = { id: session.id, userId: session.userId };
    next();
  };
}
