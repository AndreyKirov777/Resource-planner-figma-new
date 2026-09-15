import type { Express } from 'express';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { isolateTestDb, loginAs } from './testDb';
import { PrismaClient } from './src/generated/prisma';

let app: Express;

describe('Auth integration', () => {
  beforeAll(async () => {
    await isolateTestDb('auth');
    ({ app } = await import('./server'));
  });

  it('returns 200 with no auth required on GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 401 JSON on a protected route with no session cookie', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('signs in via the dev fixture chooser and reaches /api/me', async () => {
    const agent = await loginAs(app, 'admin');
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'admin@example.test',
      displayName: 'Dev Admin',
      group: 'ADMIN',
    });
  });

  it('rejects an unknown fixture name with 400', async () => {
    const res = await request(app).post('/auth/dev-login').send({ user: 'root' });
    expect(res.status).toBe(400);
  });

  it('invalidates the session on logout: /api/me 401s afterwards', async () => {
    const agent = await loginAs(app, 'manager');
    expect((await agent.get('/api/me')).status).toBe(200);

    await agent.post('/auth/logout');

    const res = await agent.get('/api/me');
    expect(res.status).toBe(401);
  });

  it('401s once the session row has expired', async () => {
    const agent = await loginAs(app, 'user');
    expect((await agent.get('/api/me')).status).toBe(200);

    const prisma = new PrismaClient();
    try {
      await prisma.session.updateMany({
        where: { user: { email: 'user@example.test' } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    } finally {
      await prisma.$disconnect();
    }

    const res = await agent.get('/api/me');
    expect(res.status).toBe(401);
  });

  it('touches lastSeenAt at most once per 5 minutes across rapid requests', async () => {
    const agent = await loginAs(app, 'user2');
    for (let i = 0; i < 10; i++) {
      expect((await agent.get('/api/me')).status).toBe(200);
    }

    const prisma = new PrismaClient();
    try {
      const sessions = await prisma.session.findMany({ where: { user: { email: 'user2@example.test' } } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].lastSeenAt.getTime()).toBe(sessions[0].createdAt.getTime());
    } finally {
      await prisma.$disconnect();
    }
  });

  it('exits non-zero when AUTH_MODE=dev and NODE_ENV=production', () => {
    expect(() =>
      execFileSync('npx', ['tsx', '-e', "import('./server/auth/dev.ts')"], {
        cwd: process.cwd(),
        env: { ...process.env, AUTH_MODE: 'dev', NODE_ENV: 'production' },
        stdio: 'pipe',
      })
    ).toThrow();
  });
});
