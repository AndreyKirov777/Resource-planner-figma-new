import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { isolateTestDb } from './testDb';

let app: Express;
let initializeDefaultProject: () => Promise<void>;

const TEST_PROJECT_NAMES = [
  'Integration Test Project',
  'To Update',
  'Updated Name',
  'Strict Test',
  'Rate Card Test',
  'Role Constraint Test',
  'Status Create Default',
  'Status Put Source',
  'Status Copy Source',
  'Status Copy Source (Copy)',
  'Status List Archived',
];

// Resource plan created by "Resource plans and weekly allocations" test – used for cleanup so it doesn't persist in the DB
const TEST_RESOURCE_PLAN = { role: 'Developer', intHourlyRate: 50, clientHourlyRate: 75 };

async function cleanupTestResourcePlans() {
  const projectsRes = await request(app).get('/api/projects');
  if (projectsRes.status !== 200 || !Array.isArray(projectsRes.body)) return;
  for (const project of projectsRes.body as { id: number }[]) {
    const plansRes = await request(app).get(`/api/projects/${project.id}/resource-plans`);
    if (plansRes.status !== 200 || !Array.isArray(plansRes.body)) continue;
    const testPlans = plansRes.body.filter(
      (p: { role: string; intHourlyRate: number; clientHourlyRate: number }) =>
        p.role === TEST_RESOURCE_PLAN.role &&
        p.intHourlyRate === TEST_RESOURCE_PLAN.intHourlyRate &&
        p.clientHourlyRate === TEST_RESOURCE_PLAN.clientHourlyRate
    );
    for (const plan of testPlans) {
      await request(app).delete(`/api/resource-plans/${plan.id}`);
    }
  }
}

async function cleanupTestProjects() {
  const res = await request(app).get('/api/projects');
  if (res.status !== 200 || !Array.isArray(res.body)) return;
  const toDelete = res.body.filter((p: { name: string }) => TEST_PROJECT_NAMES.includes(p.name));
  for (const p of toDelete) {
    await request(app).delete(`/api/projects/${p.id}`);
  }
}

describe('API integration', () => {
  beforeAll(async () => {
    // Own DB (prisma/test-api.db), never shared with wbs.integration.test.ts — this
    // block's bulk-import/delete tests would otherwise race that file's discipline
    // reads on a shared file. See testDb.ts.
    await isolateTestDb('api');
    ({ app, initializeDefaultProject } = await import('./server'));
    await initializeDefaultProject();
  });

  afterAll(async () => {
    // Guard against beforeAll failing before `app` is assigned (e.g. isolateTestDb
    // throwing) — otherwise this runs anyway and throws its own confusing
    // "Cannot read properties of undefined" instead of surfacing the real error.
    if (!app) return;
    await cleanupTestResourcePlans();
    await cleanupTestProjects();
  });

  describe('GET /api/projects', () => {
    it('returns an array of projects', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project and returns it with id', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Integration Test Project', description: 'For API tests' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Integration Test Project');
    });

    it('rejects missing name with 400', async () => {
      const res = await request(app).post('/api/projects').send({});
      expect(res.status).toBe(400);
    });

    it('rejects extra fields (strict validation)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'P', id: 999, createdAt: 'x' });
      expect(res.status).toBe(400);
    });

    it('defaults status to active when omitted', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Status Create Default' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });

    it('rejects invalid status with 400', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Status Create Default', status: 'paused' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('updates whitelisted fields and returns project with route id', async () => {
      const createRes = await request(app)
        .post('/api/projects')
        .send({ name: 'To Update' });
      const id = createRes.body.id;
      const res = await request(app)
        .put(`/api/projects/${id}`)
        .send({ name: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.id).toBe(id);
    });

    it('rejects body with disallowed id field (strict schema)', async () => {
      const createRes = await request(app).post('/api/projects').send({ name: 'Strict Test' });
      const id = createRes.body.id;
      const res = await request(app)
        .put(`/api/projects/${id}`)
        .send({ name: 'OK', id: 999 });
      expect(res.status).toBe(400);
    });

    it('updates status and still returns archived rows from GET /api/projects', async () => {
      const createRes = await request(app)
        .post('/api/projects')
        .send({ name: 'Status Put Source' });
      const id = createRes.body.id;
      const paused = await request(app)
        .put(`/api/projects/${id}`)
        .send({ status: 'paused' });
      expect(paused.status).toBe(400);

      const archived = await request(app)
        .put(`/api/projects/${id}`)
        .send({ status: 'archived' });
      expect(archived.status).toBe(200);
      expect(archived.body.status).toBe('archived');

      const list = await request(app).get('/api/projects');
      expect(list.status).toBe(200);
      expect(list.body.some((p: { id: number; status: string }) => p.id === id && p.status === 'archived')).toBe(true);
    });
  });

  describe('POST /api/projects/:id/copy', () => {
    it('copies an archived project as active', async () => {
      const createRes = await request(app)
        .post('/api/projects')
        .send({ name: 'Status Copy Source' });
      const id = createRes.body.id;
      await request(app).put(`/api/projects/${id}`).send({ status: 'archived' });

      const copyRes = await request(app)
        .post(`/api/projects/${id}/copy`)
        .send({ name: 'Status Copy Source (Copy)' });
      expect(copyRes.status).toBe(200);
      expect(copyRes.body.status).toBe('active');
      expect(copyRes.body.id).not.toBe(id);

      const source = await request(app).get(`/api/projects/${id}`);
      expect(source.body.status).toBe('archived');
    });
  });

  describe('Global rate card', () => {
    it('bulk import replaces the rate card and records import metadata', async () => {
      const importRes = await request(app)
        .post('/api/rate-cards/bulk')
        .send({ rateCards: [{ role: 'Developer', ukraine: 50 }], fileName: 'rates.xlsx' });
      expect(importRes.status).toBe(200);
      expect(importRes.body.count).toBe(1);

      const metaRes = await request(app).get('/api/rate-cards/meta');
      expect(metaRes.status).toBe(200);
      expect(metaRes.body.fileName).toBe('rates.xlsx');
      expect(metaRes.body.importedAt).toBeTruthy();

      const listRes = await request(app).get('/api/rate-cards');
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].role).toBe('Developer');
    });

    it('DELETE /api/rate-cards clears all rate cards and metadata', async () => {
      await request(app)
        .post('/api/rate-cards/bulk')
        .send({ rateCards: [{ role: 'QA', ukraine: 30 }], fileName: 'qa.xlsx' });

      const res = await request(app).delete('/api/rate-cards');
      expect(res.status).toBe(200);

      const listRes = await request(app).get('/api/rate-cards');
      expect(listRes.body).toHaveLength(0);

      const metaRes = await request(app).get('/api/rate-cards/meta');
      expect(metaRes.body.fileName).toBeNull();
      expect(metaRes.body.importedAt).toBeNull();
    });
  });

  describe('Exchange rates', () => {
    it('GET /api/exchange-rates returns USD/EUR/GBP', async () => {
      const { __resetExchangeRatesCache } = await import('./server/exchangeRates');
      __resetExchangeRatesCache();
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { date: '2026-09-04', base: 'USD', quote: 'EUR', rate: 0.85 },
          { date: '2026-09-04', base: 'USD', quote: 'GBP', rate: 0.74 },
        ],
      } as Response);

      try {
        const res = await request(app).get('/api/exchange-rates');
        expect(res.status).toBe(200);
        expect(res.body.rates).toEqual({ USD: 1, EUR: 0.85, GBP: 0.74 });
        expect(res.body.source).toMatch(/frankfurter|cache/);
      } finally {
        fetchMock.mockRestore();
        __resetExchangeRatesCache();
      }
    });
  });

  describe('Validation regression', () => {
    it('POST /api/projects rejects wrong type for name', async () => {
      const res = await request(app).post('/api/projects').send({ name: 123 });
      expect(res.status).toBe(400);
    });
  });

  describe('Resource plans and weekly allocations', () => {
    it('creates resource plan and reflects in GET', async () => {
      const projectsRes = await request(app).get('/api/projects');
      const projectId = projectsRes.body[0]?.id;
      if (!projectId) return;

      const createPlanRes = await request(app)
        .post(`/api/projects/${projectId}/resource-plans`)
        .send({
          role: 'Developer',
          intHourlyRate: 50,
          clientHourlyRate: 75,
          weeklyAllocations: [{ weekNumber: 1, allocation: 100 }],
        });

      if (createPlanRes.status !== 200) return;
      const planId = createPlanRes.body.id;

      const plansRes = await request(app).get(`/api/projects/${projectId}/resource-plans`);
      expect(plansRes.status).toBe(200);
      const found = plansRes.body.find((p: { id: number }) => p.id === planId);
      expect(found).toBeDefined();
      expect(found?.weeklyAllocations?.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Plan-side role constraint (D6)', () => {
    it('accepts a role matching the project resource list, rejects one that does not, and stays unconstrained when the list is empty', async () => {
      const projectRes = await request(app).post('/api/projects').send({ name: 'Role Constraint Test' });
      expect(projectRes.status).toBe(200);
      const projectId = projectRes.body.id;

      // Empty resource list: any role is accepted (regression guard for existing behavior).
      const unconstrainedRes = await request(app)
        .post(`/api/projects/${projectId}/resource-plans`)
        .send({ role: 'Anything Goes' });
      expect(unconstrainedRes.status).toBe(200);

      const resourceListRes = await request(app)
        .post(`/api/projects/${projectId}/resource-lists`)
        .send({ role: 'Backend Developer', intRate: 40 });
      expect(resourceListRes.status).toBe(200);

      // Non-empty list: a matching role is accepted.
      const matchingRes = await request(app)
        .post(`/api/projects/${projectId}/resource-plans`)
        .send({ role: 'Backend Developer' });
      expect(matchingRes.status).toBe(200);
      const planId = matchingRes.body.id;

      // Non-empty list: a non-matching role is rejected, both on create and update.
      const rejectedCreateRes = await request(app)
        .post(`/api/projects/${projectId}/resource-plans`)
        .send({ role: 'Not On The List' });
      expect(rejectedCreateRes.status).toBe(400);

      const rejectedUpdateRes = await request(app)
        .put(`/api/resource-plans/${planId}`)
        .send({ role: 'Also Not On The List' });
      expect(rejectedUpdateRes.status).toBe(400);

      // Updating a field other than role is unaffected.
      const otherFieldRes = await request(app)
        .put(`/api/resource-plans/${planId}`)
        .send({ intHourlyRate: 55 });
      expect(otherFieldRes.status).toBe(200);
      expect(otherFieldRes.body.role).toBe('Backend Developer');
    });
  });
});
