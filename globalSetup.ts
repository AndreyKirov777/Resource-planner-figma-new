import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from './src/generated/prisma';

// test.db, test-api.db, Finder leftovers like "test 9.db", and SQLite sidecars.
// Never prisma/dev.db.
const DISPOSABLE_TEST_DB = /^test(?:[ -].+)?\.db(?:-journal|-wal|-shm)?$/;

function removeDisposableTestDbs() {
  const dir = path.resolve(process.cwd(), 'prisma');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!DISPOSABLE_TEST_DB.test(name)) continue;
    try {
      rmSync(path.join(dir, name), { force: true });
    } catch {
      // SQLite may still hold a handle if a worker didn't disconnect.
    }
  }
}

// Runs ONCE before the whole Vitest session (not per test file). Gives the suite a
// throwaway SQLite DB, isolated from prisma/dev.db, so integration tests that
// intentionally mutate/wipe global tables (e.g. GlobalRateCard) can never touch real
// data. Redirection for each test file happens separately in src/test/setup.ts.
// The returned function runs after the suite (or on watch-mode exit) and deletes
// those throwaway files so they don't pile up in prisma/.
export default async function globalSetup() {
  const testDbPath = path.resolve(process.cwd(), 'prisma', 'test.db');
  const testDbUrl = `file:${testDbPath}`;

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${testDbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  try {
    await prisma.globalRateCard.createMany({
      data: [
        {
          role: 'Test Backend Developer',
          namingInPM: 'Middle',
          discipline: 'Backend',
          ukraine: 30, easternEurope: 35, asiaGE: 25, asiaARMKZ: 25,
          latam: 28, mexico: 32, india: 20, newYork: 80, london: 70,
        },
        {
          role: 'Test QA Engineer',
          namingInPM: 'Middle',
          discipline: 'QA',
          ukraine: 25, easternEurope: 28, asiaGE: 20, asiaARMKZ: 20,
          latam: 22, mexico: 26, india: 16, newYork: 65, london: 60,
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }

  return removeDisposableTestDbs;
}
