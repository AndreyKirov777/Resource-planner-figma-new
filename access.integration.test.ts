import type { Express } from 'express';
import type request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';
import { isolateTestDb, loginAs } from './testDb';
import { clientHourlyRate } from './src/utils/calculations';

let app: Express;
let admin: request.Agent;
let manager: request.Agent;
let user: request.Agent;
let user2: request.Agent;

// P1: owned by admin. manager=EDITOR, user=VIEWER. user2 has no access.
let p1: number;
let p1ResourceListId: number;
let p1ResourcePlanId: number;

// P2: owned by manager, not shared with admin — exercises the ADMIN bypass.
let p2: number;

// P3: owned by admin, user=EDITOR — exercises USER write access (dev fixture
// `user` is group USER but needs project-level write access for these tests).
let p3: number;

describe('Access control integration', () => {
  beforeAll(async () => {
    await isolateTestDb('access', async (prisma) => {
      await prisma.globalRateCard.createMany({
        data: [
          {
            role: 'Test Developer',
            namingInPM: 'Middle',
            discipline: 'Backend',
            ukraine: 30, easternEurope: 35, asiaGE: 25, asiaARMKZ: 25,
            latam: 28, mexico: 32, india: 20, newYork: 80, london: 70,
          },
        ],
      });
    });
    ({ app } = await import('./server'));
    admin = await loginAs(app, 'admin');
    manager = await loginAs(app, 'manager');
    user = await loginAs(app, 'user');
    user2 = await loginAs(app, 'user2');

    const p1Res = await admin.post('/api/projects').send({ name: 'P1 Access Test' });
    p1 = p1Res.body.id;
    const managerId = (await manager.get('/api/me')).body.id;
    const userId = (await user.get('/api/me')).body.id;
    await admin.put(`/api/projects/${p1}/members/${managerId}`).send({ role: 'EDITOR' });
    await admin.put(`/api/projects/${p1}/members/${userId}`).send({ role: 'VIEWER' });

    const rlRes = await admin.post(`/api/projects/${p1}/resource-lists`).send({ role: 'Dev', intRate: 30 });
    p1ResourceListId = rlRes.body.id;
    const rpRes = await admin.post(`/api/projects/${p1}/resource-plans`).send({
      role: 'Dev', intHourlyRate: 30, clientHourlyRate: 60,
    });
    p1ResourcePlanId = rpRes.body.id;

    const p2Res = await manager.post('/api/projects').send({ name: 'P2 Manager Owned' });
    p2 = p2Res.body.id;

    const p3Res = await admin.post('/api/projects').send({ name: 'P3 USER write access' });
    p3 = p3Res.body.id;
    await admin.put(`/api/projects/${p3}/members/${userId}`).send({ role: 'EDITOR' });
  });

  describe('project invisibility (404, not 403)', () => {
    it('404s a path-scoped route for a caller with no membership', async () => {
      const res = await user2.get(`/api/projects/${p1}`);
      expect(res.status).toBe(404);
    });

    it('404s a row-scoped route resolved through a foreign row', async () => {
      const res = await user2.put(`/api/resource-lists/${p1ResourceListId}`).send({ intRate: 99 });
      expect(res.status).toBe(404);
    });

    it('404s DELETE on a row in an invisible project', async () => {
      const res = await user2.delete(`/api/resource-plans/${p1ResourcePlanId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('role enforcement', () => {
    it('VIEWER gets 403 on a write endpoint', async () => {
      const res = await user.put(`/api/resource-lists/${p1ResourceListId}`).send({ intRate: 50 });
      expect(res.status).toBe(403);
    });

    it('VIEWER can still read', async () => {
      const res = await user.get(`/api/projects/${p1}`);
      expect(res.status).toBe(200);
      expect(res.body.access).toBe('VIEWER');
    });

    it('EDITOR gets 403 adding a member (share is OWNER/ADMIN only)', async () => {
      const userId = (await user.get('/api/me')).body.id;
      const res = await manager.put(`/api/projects/${p1}/members/${userId}`).send({ role: 'EDITOR' });
      expect(res.status).toBe(403);
    });

    it('EDITOR gets 403 deleting the project', async () => {
      const res = await manager.delete(`/api/projects/${p1}`);
      expect(res.status).toBe(403);
    });

    it('EDITOR can write ordinary content', async () => {
      const res = await manager.put(`/api/resource-lists/${p1ResourceListId}`).send({ intRate: 40 });
      expect(res.status).toBe(200);
    });

    it('OWNER can add and remove a member', async () => {
      const userId = (await user.get('/api/me')).body.id;
      const upsert = await admin.put(`/api/projects/${p1}/members/${userId}`).send({ role: 'VIEWER' });
      expect(upsert.status).toBe(200);
      const remove = await admin.delete(`/api/projects/${p1}/members/${userId}`);
      expect(remove.status).toBe(204);
      // restore for later tests in this file
      await admin.put(`/api/projects/${p1}/members/${userId}`).send({ role: 'VIEWER' });
    });

    it('rejects OWNER as a member role', async () => {
      const userId = (await user.get('/api/me')).body.id;
      const res = await admin.put(`/api/projects/${p1}/members/${userId}`).send({ role: 'OWNER' });
      expect(res.status).toBe(400);
    });
  });

  describe('ADMIN bypass', () => {
    it('reads, edits, and shares a project ADMIN is not a member of', async () => {
      const getRes = await admin.get(`/api/projects/${p2}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.access).toBe('ADMIN');

      const putRes = await admin.put(`/api/projects/${p2}`).send({ description: 'edited by admin' });
      expect(putRes.status).toBe(200);

      const userId = (await user.get('/api/me')).body.id;
      const shareRes = await admin.put(`/api/projects/${p2}/members/${userId}`).send({ role: 'VIEWER' });
      expect(shareRes.status).toBe(200);
    });
  });

  describe('project list scopes', () => {
    it('"mine" returns only owned projects', async () => {
      const res = await manager.get('/api/projects?scope=mine');
      expect(res.status).toBe(200);
      const ids = res.body.map((p: { id: number }) => p.id);
      expect(ids).toContain(p2);
      expect(ids).not.toContain(p1);
      expect(res.body.find((p: { id: number }) => p.id === p2).myRole).toBe('OWNER');
    });

    it('"shared" returns projects the caller is a member of, but not owner', async () => {
      const res = await manager.get('/api/projects?scope=shared');
      expect(res.status).toBe(200);
      const ids = res.body.map((p: { id: number }) => p.id);
      expect(ids).toContain(p1);
      expect(ids).not.toContain(p2);
      expect(res.body.find((p: { id: number }) => p.id === p1).myRole).toBe('EDITOR');
    });

    it('"all" is ADMIN-only', async () => {
      const forbidden = await manager.get('/api/projects?scope=all');
      expect(forbidden.status).toBe(403);

      const ok = await admin.get('/api/projects?scope=all');
      expect(ok.status).toBe(200);
      const ids = ok.body.map((p: { id: number }) => p.id);
      expect(ids).toContain(p1);
      expect(ids).toContain(p2);
    });
  });

  describe('archived projects are read-only for non-owners', () => {
    it('EDITOR gets 403 writing to an archived project; OWNER still can', async () => {
      const archiveRes = await admin.put(`/api/projects/${p1}`).send({ status: 'archived' });
      expect(archiveRes.status).toBe(200);

      const editorWrite = await manager.put(`/api/resource-lists/${p1ResourceListId}`).send({ intRate: 41 });
      expect(editorWrite.status).toBe(403);

      const ownerWrite = await admin.put(`/api/resource-lists/${p1ResourceListId}`).send({ intRate: 42 });
      expect(ownerWrite.status).toBe(200);

      const restore = await admin.put(`/api/projects/${p1}`).send({ status: 'active' });
      expect(restore.status).toBe(200);
    });

    it('archiving itself requires OWNER/ADMIN, not just write access', async () => {
      const res = await manager.put(`/api/projects/${p1}`).send({ status: 'archived' });
      expect(res.status).toBe(403);
    });
  });

  describe('ownership of copy and import', () => {
    it('copy is owned by the copier, not the source owner', async () => {
      const res = await manager.post(`/api/projects/${p1}/copy`).send({ name: 'P1 Copy by manager' });
      expect(res.status).toBe(200);
      const managerId = (await manager.get('/api/me')).body.id;
      expect(res.body.ownerId).toBe(managerId);

      const membersRes = await manager.get(`/api/projects/${res.body.id}/members`);
      expect(membersRes.body).toContainEqual(expect.objectContaining({ userId: managerId, role: 'OWNER' }));
    });

    it('import is owned by the importer', async () => {
      const res = await user.post('/api/projects/import').send({ data: { name: 'Imported by user' } });
      expect(res.status).toBe(200);
      const project = await user.get(`/api/projects/${res.body.projectId}`);
      const userId = (await user.get('/api/me')).body.id;
      expect(project.body.ownerId).toBe(userId);
    });
  });

  describe('reorder rejects rows from another project', () => {
    it('400s when orderedIds includes a row from a different project', async () => {
      const otherPlan = await manager.post(`/api/projects/${p2}/resource-plans`).send({
        role: 'Other', intHourlyRate: 10, clientHourlyRate: 20,
      });
      const res = await admin
        .put(`/api/projects/${p1}/resource-plans/reorder`)
        .send({ orderedIds: [p1ResourcePlanId, otherPlan.body.id] });
      expect(res.status).toBe(400);
    });
  });

  describe('per-user AI rate limit', () => {
    it('limits by signed-in user, not shared across users', async () => {
      let lastStatus = 0;
      for (let i = 0; i < 11; i++) {
        const res = await admin.post('/api/projects/generate-plan').send({
          mode: 'new',
          description: 'test',
          region: 'ukraine',
        });
        lastStatus = res.status;
        if (i < 10) expect(res.status).not.toBe(429);
      }
      expect(lastStatus).toBe(429);

      const otherUserRes = await manager.post('/api/projects/generate-plan').send({
        mode: 'new',
        description: 'test',
        region: 'ukraine',
      });
      expect(otherUserRes.status).not.toBe(429);
    });
  });

  describe('USER visibility ceiling', () => {
    it('strips every internal key from a project GET for USER, keeps them for MANAGER', async () => {
      const userRes = await user.get(`/api/projects/${p1}`);
      expect(userRes.status).toBe(200);
      expect(userRes.body.defaultMargin).toBeUndefined();
      expect(userRes.body.exchangeRate).toBeUndefined();

      const managerRes = await manager.get(`/api/projects/${p1}`);
      expect(managerRes.status).toBe(200);
      expect(managerRes.body.defaultMargin).not.toBeUndefined();
      expect(managerRes.body.exchangeRate).not.toBeUndefined();
    });

    it('strips intRate from resource-list rows and intHourlyRate from resource-plan rows for USER, keeps them for MANAGER', async () => {
      const listRes = await user.get(`/api/projects/${p1}/resource-lists`);
      expect(listRes.status).toBe(200);
      for (const row of listRes.body) expect(row.intRate).toBeUndefined();

      const planRes = await user.get(`/api/projects/${p1}/resource-plans`);
      expect(planRes.status).toBe(200);
      for (const row of planRes.body) expect(row.intHourlyRate).toBeUndefined();

      const managerListRes = await manager.get(`/api/projects/${p1}/resource-lists`);
      for (const row of managerListRes.body) expect(row.intRate).not.toBeUndefined();
      const managerPlanRes = await manager.get(`/api/projects/${p1}/resource-plans`);
      for (const row of managerPlanRes.body) expect(row.intHourlyRate).not.toBeUndefined();
    });

    it('strips every internal key from the export payload for USER', async () => {
      const res = await user.get(`/api/projects/${p1}/export`);
      expect(res.status).toBe(200);
      expect(res.body.data.defaultMargin).toBeUndefined();
      expect(res.body.data.exchangeRate).toBeUndefined();
      for (const row of res.body.data.resourceLists) expect(row.intRate).toBeUndefined();
      for (const row of res.body.data.resourcePlans) expect(row.intHourlyRate).toBeUndefined();
    });

    it('ignores intRate in a USER write body — the stored value is unchanged, other fields still apply', async () => {
      const rlRes = await admin.post(`/api/projects/${p3}/resource-lists`).send({ role: 'Dev', intRate: 30 });
      const listId = rlRes.body.id;

      const writeRes = await user.put(`/api/resource-lists/${listId}`).send({ intRate: 999, role: 'Dev renamed' });
      expect(writeRes.status).toBe(200);

      const stored = await admin.get(`/api/projects/${p3}/resource-lists`);
      const row = stored.body.find((r: { id: number }) => r.id === listId);
      expect(row.intRate).toBe(30);
      expect(row.role).toBe('Dev renamed');
    });
  });

  describe('from-rate-card / from-resource-list rate derivation', () => {
    it('from-rate-card computes hourlyRate via clientHourlyRate; callable by USER, who never sees intRate', async () => {
      const rateCardsRes = await admin.get('/api/rate-cards');
      const rateCard = rateCardsRes.body.find((rc: { role: string }) => rc.role === 'Test Developer');
      const projectRes = await admin.get(`/api/projects/${p3}`);
      const marginPct = (projectRes.body.defaultMargin ?? 45) / 100;
      const expectedHourlyRate = clientHourlyRate(rateCard.ukraine, marginPct, projectRes.body.exchangeRate);

      const res = await user.post(`/api/projects/${p3}/resource-lists/from-rate-card`).send({
        rateCardId: rateCard.id,
        region: 'ukraine',
      });
      expect(res.status).toBe(201);

      const stored = await admin.get(`/api/projects/${p3}/resource-lists`);
      const created = stored.body.find((r: { id: number }) => r.id === res.body.id);
      expect(created.intRate).toBe(rateCard.ukraine);
      expect(created.hourlyRate).toBeCloseTo(expectedHourlyRate, 5);
    });

    it('from-resource-list computes clientHourlyRate for a new plan row via the same fallback formula', async () => {
      const created = await admin.post(`/api/projects/${p3}/resource-lists`).send({ role: 'RL Dev', intRate: 40 });
      const listRow = created.body;
      const projectRes = await admin.get(`/api/projects/${p3}`);
      const expectedClientHourlyRate = listRow.hourlyRate > 0
        ? listRow.hourlyRate
        : clientHourlyRate(listRow.intRate, (projectRes.body.defaultMargin || 25.0) / 100, projectRes.body.exchangeRate);

      const res = await user.post(`/api/projects/${p3}/resource-plans/from-resource-list`).send({
        resourceListId: listRow.id,
      });
      expect(res.status).toBe(201);

      const plansRes = await admin.get(`/api/projects/${p3}/resource-plans`);
      const plan = plansRes.body.find((p: { id: number }) => p.id === res.body.id);
      expect(plan.intHourlyRate).toBe(listRow.intRate);
      expect(plan.clientHourlyRate).toBeCloseTo(expectedClientHourlyRate, 5);
    });
  });

  describe('rate-card write access is ADMIN-only', () => {
    it('403s POST/PUT/DELETE for MANAGER and USER, allows ADMIN', async () => {
      const managerCreate = await manager.post('/api/rate-cards').send({ role: 'Blocked' });
      expect(managerCreate.status).toBe(403);
      const userCreate = await user.post('/api/rate-cards').send({ role: 'Blocked' });
      expect(userCreate.status).toBe(403);

      const adminCreate = await admin.post('/api/rate-cards').send({ role: 'Allowed' });
      expect(adminCreate.status).toBe(200);
      const rateCardId = adminCreate.body.id;

      const managerUpdate = await manager.put(`/api/rate-cards/${rateCardId}`).send({ role: 'Still Blocked' });
      expect(managerUpdate.status).toBe(403);
      const userDelete = await user.delete(`/api/rate-cards/${rateCardId}`);
      expect(userDelete.status).toBe(403);

      const adminUpdate = await admin.put(`/api/rate-cards/${rateCardId}`).send({ role: 'Allowed Renamed' });
      expect(adminUpdate.status).toBe(200);
      const adminDelete = await admin.delete(`/api/rate-cards/${rateCardId}`);
      expect(adminDelete.status).toBe(200);
    });

    it('read access is open to every group', async () => {
      for (const agent of [admin, manager, user]) {
        const res = await agent.get('/api/rate-cards');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('generate-plan is unavailable to USER', () => {
    it('403s for USER before validation (an invalid mode would otherwise 400)', async () => {
      const userRes = await user.post('/api/projects/generate-plan').send({
        mode: 'new',
        description: 'test',
        region: 'ukraine',
      });
      expect(userRes.status).toBe(403);
    });
  });
});
