import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { PrismaClient } from './src/generated/prisma';
import type { DevFixtureName } from './server/auth/dev';

/**
 * Gives one integration test file its own throwaway SQLite database
 * (prisma/test-<name>.db), deleted and recreated fresh on every call. Used by
 * api.integration.test.ts and wbs.integration.test.ts so their concurrent,
 * destructive GlobalRateCard tests can never race each other (each file gets
 * its own file, not a shared one) or touch prisma/dev.db.
 *
 * Sets process.env.DATABASE_URL as a side effect — callers must await this
 * BEFORE dynamically importing ./server, so its `new PrismaClient()` picks up
 * the right file. A static top-level `import './server'` would resolve before
 * this function ever runs (ESM import hoisting), which is why callers use
 * `await import('./server')` inside beforeAll instead.
 *
 * `name` must be unique per caller (e.g. one per integration test file) — two
 * callers sharing a name would silently reintroduce the cross-file race this
 * exists to prevent. Not enforced at runtime: Vitest gives each test file its
 * own process, so there's no shared registry to check against.
 */
export async function isolateTestDb(
  name: string,
  seed?: (prisma: PrismaClient) => Promise<void>
): Promise<void> {
  const dbPath = path.resolve(process.cwd(), 'prisma', `test-${name}.db`);
  const dbUrl = `file:${dbPath}`;

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = dbUrl;

  if (seed) {
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await seed(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }
}

/**
 * Signs a supertest agent in as one of the four dev fixtures (see
 * server/auth/dev.ts) via the same `POST /auth/dev-login` route the dev
 * sign-in chooser uses, so integration tests exercise the real session
 * cookie / requireAuth path instead of bypassing it.
 */
export async function loginAs(app: Express, fixture: DevFixtureName): Promise<request.Agent> {
  const agent = request.agent(app);
  await agent.post('/auth/dev-login').send({ user: fixture });
  return agent;
}
