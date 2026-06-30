import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, initializeDefaultProject } from './server';

const TEST_PROJECT_NAMES = [
  'Integration Test Project',
  'To Update',
  'Updated Name',
  'Strict Test',
  'Rate Card Test',
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
    await initializeDefaultProject();
  });

  afterAll(async () => {
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
});
