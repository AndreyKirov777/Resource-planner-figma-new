import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import * as client from 'openid-client';
import type { PrismaClient } from '../../src/generated/prisma';
import { ownershipMigration, resolveGroup } from './groups';
import { SESSION_COOKIE_NAME, clearSessionCookie, createSession, isSecureCookie, parseCookies, setSessionCookie } from './session';

const FLOW_COOKIE_NAME = 'rp_auth_flow';
const FLOW_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

interface AuthFlowState {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
  exp: number;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET must be set when AUTH_MODE=entra');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function encodeFlowCookie(state: AuthFlowState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decodeFlowCookie(raw: string | undefined): AuthFlowState | null {
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthFlowState;
    if (typeof state.exp !== 'number' || Date.now() > state.exp) return null;
    return state;
  } catch {
    return null;
  }
}

/** Only ever redirect within this app; never to an attacker-supplied absolute/external URL. */
function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

let configPromise: Promise<client.Configuration> | null = null;

function getEntraConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const tenantId = process.env.ENTRA_TENANT_ID;
    const clientId = process.env.ENTRA_CLIENT_ID;
    const clientSecret = process.env.ENTRA_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET must be set when AUTH_MODE=entra');
    }
    configPromise = client.discovery(
      new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
      clientId,
      clientSecret
    );
  }
  return configPromise;
}

function requestUrl(req: { protocol: string; get(name: string): string | undefined; originalUrl: string }): URL {
  const host = req.get('host');
  return new URL(req.originalUrl, `${req.protocol}://${host}`);
}

export function createEntraAuthRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/auth/login', async (req, res) => {
    try {
      const config = await getEntraConfig();
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      const returnTo = sanitizeReturnTo(req.query.returnTo);

      const flow: AuthFlowState = {
        codeVerifier,
        state,
        nonce,
        returnTo,
        exp: Date.now() + FLOW_COOKIE_MAX_AGE_MS,
      };
      res.cookie(FLOW_COOKIE_NAME, encodeFlowCookie(flow), {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureCookie(),
        path: '/',
        maxAge: FLOW_COOKIE_MAX_AGE_MS,
      });

      const redirectUri = process.env.ENTRA_REDIRECT_URI;
      if (!redirectUri) {
        throw new Error('ENTRA_REDIRECT_URI must be set when AUTH_MODE=entra');
      }
      const authorizationUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });
      res.redirect(authorizationUrl.href);
    } catch (error) {
      console.error('Error starting Entra sign-in:', error);
      res.status(500).send('Sign-in is temporarily unavailable.');
    }
  });

  router.get('/auth/callback', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const flow = decodeFlowCookie(cookies[FLOW_COOKIE_NAME]);
    res.clearCookie(FLOW_COOKIE_NAME, { path: '/' });

    if (!flow) {
      return res.status(400).send('Sign-in session expired or invalid. Please try again.');
    }

    try {
      const config = await getEntraConfig();
      const tokens = await client.authorizationCodeGrant(config, requestUrl(req), {
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        pkceCodeVerifier: flow.codeVerifier,
      });
      const claims = tokens.claims();
      if (!claims) {
        return res.status(400).send('Sign-in failed: no identity returned.');
      }

      const email = String(claims.email ?? claims.preferred_username ?? '');
      const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
      const group = resolveGroup({ email, groups }, process.env);

      if (!group) {
        return res.redirect('/auth/no-access');
      }

      const entraObjectId = String(claims.oid ?? claims.sub);
      const displayName = typeof claims.name === 'string' ? claims.name : email;
      const user = await prisma.user.upsert({
        where: { entraObjectId },
        update: { email, displayName, group, lastLoginAt: new Date() },
        create: { entraObjectId, email, displayName, group, lastLoginAt: new Date() },
      });

      if (group === 'ADMIN') {
        await ownershipMigration(prisma, user.id);
      }

      const sessionId = await createSession(prisma, user.id);
      setSessionCookie(res, sessionId);
      res.redirect(flow.returnTo);
    } catch (error) {
      console.error('Error completing Entra sign-in:', error);
      res.status(400).send('Sign-in failed. Please try again.');
    }
  });

  router.post('/auth/logout', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    clearSessionCookie(res);

    try {
      const config = await getEntraConfig();
      const host = req.get('host');
      const postLogoutRedirectUri = `${req.protocol}://${host}/auth/login`;
      const endSessionUrl = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: postLogoutRedirectUri,
      });
      res.redirect(endSessionUrl.href);
    } catch {
      res.redirect('/auth/login');
    }
  });

  router.get('/auth/no-access', (_req, res) => {
    res.status(403).send(
      '<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;">' +
        '<h1>No access</h1>' +
        '<p>Your account is not a member of any Resource Planner group. Contact an administrator to be added to the appropriate Entra ID group.</p>' +
        '</body></html>'
    );
  });

  return router;
}

/** Exposed for tests: forces a fresh discovery on next call. */
export function __resetEntraConfigCache(): void {
  configPromise = null;
}
