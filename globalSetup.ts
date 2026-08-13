import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from './src/generated/prisma';

// Runs ONCE before the whole Vitest session (not per test file). Gives the suite a
// throwaway SQLite DB, isolated from prisma/dev.db, so integration tests that
// intentionally mutate/wipe global tables (e.g. GlobalRateCard) can never touch real
// data. Redirection for each test file happens separately in src/test/setup.ts.
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
}
