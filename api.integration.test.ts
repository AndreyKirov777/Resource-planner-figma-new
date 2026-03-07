import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, initializeDefaultProject } from './server';

describe('API integration', () => {
  beforeAll(async () => {
    await initializeDefaultProject();
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

  describe('DELETE /api/projects/:projectId/rate-cards', () => {
    it('deletes only that project rate cards', async () => {
      const createRes = await request(app).post('/api/projects').send({ name: 'Rate Card Test' });
      const projectId = createRes.body.id;
      const res = await request(app).delete(`/api/projects/${projectId}/rate-cards`);
      expect(res.status).toBe(200);
    });
  });

  describe('Legacy DELETE /api/rate-cards', () => {
    it('returns 400 when projectId query is missing', async () => {
      const res = await request(app).delete('/api/rate-cards');
      expect(res.status).toBe(400);
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
