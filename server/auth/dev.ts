import { Router } from 'express';
import type { PrismaClient } from '../../src/generated/prisma';
import type { Group } from './groups';
import { ownershipMigration } from './groups';
import { SESSION_COOKIE_NAME, clearSessionCookie, createSession, parseCookies, setSessionCookie } from './session';
import { devLoginSchema } from '../../server-validation';

if (process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV === 'production') {
  console.error('AUTH_MODE=dev is not allowed when NODE_ENV=production.');
  process.exit(1);
}

export type DevFixtureName = 'admin' | 'manager' | 'user' | 'user2';

export const DEV_FIXTURES: Record<DevFixtureName, { entraObjectId: string; email: string; displayName: string; group: Group }> = {
  admin: { entraObjectId: 'dev-admin', email: 'admin@example.test', displayName: 'Dev Admin', group: 'ADMIN' },
  manager: { entraObjectId: 'dev-manager', email: 'manager@example.test', displayName: 'Dev Manager', group: 'MANAGER' },
  user: { entraObjectId: 'dev-user', email: 'user@example.test', displayName: 'Dev User', group: 'USER' },
  user2: { entraObjectId: 'dev-user2', email: 'user2@example.test', displayName: 'Dev User 2', group: 'USER' },
};

function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createDevAuthRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/auth/login', (req, res) => {
    const returnTo = escapeHtml(sanitizeReturnTo(req.query.returnTo));
    const buttons = (Object.keys(DEV_FIXTURES) as DevFixtureName[])
      .map(
        (name) => `
        <form method="post" action="/auth/dev-login" style="margin:0.5rem 0;">
          <input type="hidden" name="user" value="${name}" />
          <input type="hidden" name="returnTo" value="${returnTo}" />
          <button type="submit" style="padding:0.5rem 1rem;">
            Sign in as ${DEV_FIXTURES[name].displayName} (${DEV_FIXTURES[name].group})
          </button>
        </form>`
      )
      .join('\n');
    res.status(200).send(
      `<!doctype html><html><body style="font-family:sans-serif;max-width:24rem;margin:4rem auto;">` +
        `<h1>Dev sign-in</h1>${buttons}</body></html>`
    );
  });

  router.post('/auth/dev-login', async (req, res) => {
    const parsed = devLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const fixture = DEV_FIXTURES[parsed.data.user];
    const user = await prisma.user.upsert({
      where: { entraObjectId: fixture.entraObjectId },
      update: { lastLoginAt: new Date() },
      create: { ...fixture, lastLoginAt: new Date() },
    });

    if (user.group === 'ADMIN') {
      await ownershipMigration(prisma, user.id);
    }

    const sessionId = await createSession(prisma, user.id);
    setSessionCookie(res, sessionId);
    res.redirect(sanitizeReturnTo(req.body.returnTo));
  });

  router.post('/auth/logout', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    clearSessionCookie(res);
    res.redirect('/auth/login');
  });

  return router;
}
