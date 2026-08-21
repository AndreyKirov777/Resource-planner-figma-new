import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { isolateTestDb } from './testDb';
import {
  wbsEstimateSchema,
  wbsItemCreateSchema,
  wbsItemUpdateSchema,
  wbsEstimatesReplaceSchema,
} from './server-validation';

let app: Express;
let initializeDefaultProject: () => Promise<void>;

/**
 * WBS-1 (data model, API, client wrapper) tests.
 *
 * Pure Zod-schema edge cases are asserted directly (mirrors server-validation.test.ts).
 * Route behavior (nested create, self-parent, cross-project parent, bulk-replace
 * estimates, cascade delete) is asserted via supertest against the real app/db
 * (mirrors api.integration.test.ts).
 *
 * Deliberately NOT covered here: the "empty rate card" bypass row from the I/O
 * matrix (any discipline accepted unchecked when GlobalRateCard is empty). This
 * file runs against its own disposable prisma/test-wbs.db (see testDb.ts),
 * isolated from every other test file — no cross-file race is possible. The DB
 * is deliberately pre-seeded with 2 fake disciplines in this describe block's
 * own `beforeAll` so `validDisciplineA`/`validDisciplineB` below reflect real
 * validation instead of the empty-card bypass; exercising the bypass itself
 * would mean wiping this file's own seed mid-run, which isn't done. The guard
 * itself (`rows.length === 0 → skip the check`) is a one-line conditional in
 * server.ts's `validWbsDisciplines`, identical in shape to the existing
 * empty-rate-card guard already exercised for generatePlanRequestSchema.
 */

describe('server-validation WBS Zod schemas', () => {
  describe('wbsEstimateSchema', () => {
    it('accepts a valid payload', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend', hours: 40 });
      expect(result.success).toBe(true);
    });

    it('defaults role to empty string when omitted', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend', hours: 40 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('');
      }
    });

    it('rejects missing discipline', () => {
      const result = wbsEstimateSchema.safeParse({ hours: 10 });
      expect(result.success).toBe(false);
    });

    it('rejects empty discipline', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: '', hours: 10 });
      expect(result.success).toBe(false);
    });

    it('rejects missing hours', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend' });
      expect(result.success).toBe(false);
    });

    it('rejects negative hours', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend', hours: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects Infinity hours', () => {
      // A JSON body of `{"hours": 1e400}` parses to Infinity — z.number().min(0)
      // alone accepts it (Infinity >= 0); .finite() is what rejects it.
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend', hours: Infinity });
      expect(result.success).toBe(false);
    });

    it('rejects extra fields (strict)', () => {
      const result = wbsEstimateSchema.safeParse({ discipline: 'Backend', hours: 10, wbsItemId: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('wbsItemCreateSchema', () => {
    it('accepts a minimal payload (root item)', () => {
      const result = wbsItemCreateSchema.safeParse({ name: 'Design' });
      expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
      const result = wbsItemCreateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = wbsItemCreateSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('accepts an explicit null parentId (root item)', () => {
      const result = wbsItemCreateSchema.safeParse({ name: 'Design', parentId: null });
      expect(result.success).toBe(true);
    });

    it('rejects a non-positive parentId', () => {
      const result = wbsItemCreateSchema.safeParse({ name: 'Design', parentId: 0 });
      expect(result.success).toBe(false);
    });

    it('accepts nested estimates', () => {
      const result = wbsItemCreateSchema.safeParse({
        name: 'API',
        estimates: [
          { discipline: 'Backend', hours: 40 },
          { discipline: 'QA', hours: 16 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid nested estimate', () => {
      const result = wbsItemCreateSchema.safeParse({
        name: 'API',
        estimates: [{ discipline: '', hours: 40 }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects duplicate (discipline, role) pairs in nested estimates', () => {
      // Without this check, a nested Prisma create would throw on the DB's
      // @@unique([wbsItemId, discipline, role]) instead of failing validation.
      const result = wbsItemCreateSchema.safeParse({
        name: 'API',
        estimates: [
          { discipline: 'Backend', hours: 10 },
          { discipline: 'Backend', hours: 20 }, // same discipline, same default role ('')
        ],
      });
      expect(result.success).toBe(false);
    });

    it('accepts the same discipline with different roles', () => {
      const result = wbsItemCreateSchema.safeParse({
        name: 'API',
        estimates: [
          { discipline: 'Backend', role: 'Lead', hours: 10 },
          { discipline: 'Backend', role: '', hours: 20 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects extra fields (strict, e.g. projectId supplied by client)', () => {
      const result = wbsItemCreateSchema.safeParse({ name: 'Design', projectId: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('wbsItemUpdateSchema', () => {
    it('accepts a valid partial payload', () => {
      const result = wbsItemUpdateSchema.safeParse({ displayOrder: 2 });
      expect(result.success).toBe(true);
    });

    it('accepts an explicit null parentId (re-parent to root)', () => {
      const result = wbsItemUpdateSchema.safeParse({ parentId: null });
      expect(result.success).toBe(true);
    });

    it('rejects id in body (strict)', () => {
      const result = wbsItemUpdateSchema.safeParse({ name: 'X', id: 999 });
      expect(result.success).toBe(false);
    });

    it('rejects estimates in body (scalar-only endpoint — estimates go through PUT .../estimates)', () => {
      const result = wbsItemUpdateSchema.safeParse({ estimates: [{ discipline: 'QA', hours: 5 }] });
      expect(result.success).toBe(false);
    });
  });

  describe('wbsEstimatesReplaceSchema', () => {
    it('accepts a valid array', () => {
      const result = wbsEstimatesReplaceSchema.safeParse([{ discipline: 'Backend', hours: 10 }]);
      expect(result.success).toBe(true);
    });

    it('accepts an empty array (clears all estimates)', () => {
      const result = wbsEstimatesReplaceSchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it('rejects duplicate (discipline, role) pairs', () => {
      const result = wbsEstimatesReplaceSchema.safeParse([
        { discipline: 'Backend', hours: 10 },
        { discipline: 'Backend', hours: 20 },
      ]);
      expect(result.success).toBe(false);
    });
  });
});

describe('WBS API integration', () => {
  const TEST_PROJECT_NAME = 'WBS Integration Test Project';
  const TEST_PROJECT_NAME_OTHER = 'WBS Integration Test Project (Other)';
  const UNKNOWN_DISCIPLINE = '__wbs_test_unknown_discipline__';

  let projectId: number;
  let otherProjectId: number;
  // Two real, currently-live GlobalRateCard disciplines — read dynamically rather than
  // hardcoded, so these tests don't silently break if someone edits the shared rate
  // card's discipline taxonomy later. Falls back to the "unknown" sentinel only in the
  // (extremely unlikely) case the live card has fewer than two disciplines at test time.
  let validDisciplineA: string;
  let validDisciplineB: string;

  async function cleanupTestProjects() {
    const res = await request(app).get('/api/projects');
    if (res.status !== 200 || !Array.isArray(res.body)) return;
    const toDelete = res.body.filter((p: { name: string }) =>
      p.name.startsWith(TEST_PROJECT_NAME) || p.name.startsWith('WBS-4 ')
    );
    for (const p of toDelete as { id: number }[]) {
      await request(app).delete(`/api/projects/${p.id}`);
    }
  }

  beforeAll(async () => {
    // Own DB (prisma/test-wbs.db), never shared with api.integration.test.ts —
    // that file's rate-card bulk-import/delete tests would otherwise race the
    // discipline reads below on a shared file. See testDb.ts.
    await isolateTestDb('wbs', async (prisma) => {
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
    });
    ({ app, initializeDefaultProject } = await import('./server'));
    await initializeDefaultProject();
    await cleanupTestProjects();
    const projRes = await request(app).post('/api/projects').send({ name: TEST_PROJECT_NAME });
    projectId = projRes.body.id;
    const otherRes = await request(app).post('/api/projects').send({ name: TEST_PROJECT_NAME_OTHER });
    otherProjectId = otherRes.body.id;

    const rateCardsRes = await request(app).get('/api/rate-cards');
    const liveDisciplines = Array.from(
      new Set(((rateCardsRes.body ?? []) as { discipline: string }[]).map((r) => r.discipline))
    );
    validDisciplineA = liveDisciplines[0] ?? UNKNOWN_DISCIPLINE;
    validDisciplineB = liveDisciplines[1] ?? validDisciplineA;
  });

  afterAll(async () => {
    // Guard against beforeAll failing before `app` is assigned (e.g. isolateTestDb
    // throwing) — otherwise this runs anyway and throws its own confusing
    // "Cannot read properties of undefined" instead of surfacing the real error.
    if (!app) return;
    // Deleting the projects cascades (onDelete: Cascade) to their WbsItems and WbsEstimates.
    await cleanupTestProjects();
  });

  describe('GET /api/projects/:projectId/wbs', () => {
    it('returns [] (not 404) for a project with no WBS items', async () => {
      const res = await request(app).get(`/api/projects/${otherProjectId}/wbs`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('orders items deterministically by id when displayOrder ties (both default to 0)', async () => {
      const first = await request(app)
        .post(`/api/projects/${otherProjectId}/wbs-items`)
        .send({ name: 'Tie A' });
      const second = await request(app)
        .post(`/api/projects/${otherProjectId}/wbs-items`)
        .send({ name: 'Tie B' });

      const res = await request(app).get(`/api/projects/${otherProjectId}/wbs`);
      const ids = res.body.map((i: { id: number }) => i.id);
      expect(ids.indexOf(first.body.id)).toBeLessThan(ids.indexOf(second.body.id));
    });
  });

  describe('POST /api/projects/:projectId/wbs-items', () => {
    it('creates a root item with phaseName null (Unassigned) and 201', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Design' });
      expect(res.status).toBe(201);
      expect(res.body.phaseName).toBeNull();
      expect(res.body.parentId).toBeNull();
      expect(res.body.estimates).toEqual([]);
    });

    it('creates an item with nested estimates and 201', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'API', estimates: [{ discipline: validDisciplineA, hours: 40 }] });
      expect(res.status).toBe(201);
      expect(res.body.estimates).toHaveLength(1);
      expect(res.body.estimates[0].discipline).toBe(validDisciplineA);
      expect(res.body.estimates[0].hours).toBe(40);
      expect(res.body.estimates[0].role).toBe('');
    });

    it('rejects an unknown discipline in nested estimates with 400 and writes nothing', async () => {
      const before = await request(app).get(`/api/projects/${projectId}/wbs`);
      const beforeCount = before.body.length;

      const res = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Bad discipline', estimates: [{ discipline: UNKNOWN_DISCIPLINE, hours: 5 }] });
      expect(res.status).toBe(400);

      const after = await request(app).get(`/api/projects/${projectId}/wbs`);
      expect(after.body.length).toBe(beforeCount);
    });

    it('rejects a cross-project parentId with 400', async () => {
      const foreignRootRes = await request(app)
        .post(`/api/projects/${otherProjectId}/wbs-items`)
        .send({ name: 'Foreign root' });
      const foreignParentId = foreignRootRes.body.id;

      const res = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Cross-project child', parentId: foreignParentId });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/wbs-items/:id', () => {
    it('rejects a self-parent with 400', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Self parent test' });
      const id = createRes.body.id;

      const res = await request(app).put(`/api/wbs-items/${id}`).send({ parentId: id });
      expect(res.status).toBe(400);
    });

    it('rejects a cross-project parentId with 400', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Reparent test' });
      const id = createRes.body.id;

      const foreignRes = await request(app)
        .post(`/api/projects/${otherProjectId}/wbs-items`)
        .send({ name: 'Foreign parent' });
      const foreignParentId = foreignRes.body.id;

      const res = await request(app).put(`/api/wbs-items/${id}`).send({ parentId: foreignParentId });
      expect(res.status).toBe(400);
    });

    it('rejects a descendant parentId that would cycle with 400', async () => {
      const rootRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Cycle root' });
      const rootId = rootRes.body.id;
      const childRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Cycle child', parentId: rootId });
      const childId = childRes.body.id;

      const res = await request(app).put(`/api/wbs-items/${rootId}`).send({ parentId: childId });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cycle/i);
    });

    it('rejects a multi-hop ancestor loop with 400', async () => {
      const aRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'A' });
      const aId = aRes.body.id;
      const bRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'B', parentId: aId });
      const bId = bRes.body.id;
      const cRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'C', parentId: bId });
      const cId = cRes.body.id;

      const res = await request(app).put(`/api/wbs-items/${aId}`).send({ parentId: cId });
      expect(res.status).toBe(400);
    });

    it('updates scalar fields', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Rename me' });
      const id = createRes.body.id;

      const res = await request(app)
        .put(`/api/wbs-items/${id}`)
        .send({ name: 'Renamed', phaseName: 'Phase 1', displayOrder: 3 });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
      expect(res.body.phaseName).toBe('Phase 1');
      expect(res.body.displayOrder).toBe(3);
    });
  });

  describe('PUT /api/wbs-items/:id/estimates', () => {
    it('replaces the estimate set (delete-then-recreate)', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Estimates target', estimates: [{ discipline: validDisciplineA, hours: 10 }] });
      const id = createRes.body.id;

      const replaceRes = await request(app)
        .put(`/api/wbs-items/${id}/estimates`)
        .send([
          { discipline: validDisciplineB, hours: 8 },
          { discipline: validDisciplineA, hours: 20 },
        ]);
      expect(replaceRes.status).toBe(200);
      expect(replaceRes.body).toHaveLength(2);
      const disciplines = replaceRes.body.map((e: { discipline: string }) => e.discipline).sort();
      expect(disciplines).toEqual([validDisciplineA, validDisciplineB].sort());

      const getRes = await request(app).get(`/api/projects/${projectId}/wbs`);
      const item = getRes.body.find((i: { id: number }) => i.id === id);
      expect(item.estimates).toHaveLength(2);
      // Old estimate (validDisciplineA: 10h) is gone — replaced by the new one (20h).
      const replaced = item.estimates.find((e: { discipline: string }) => e.discipline === validDisciplineA);
      expect(replaced.hours).toBe(20);
    });

    it('rejects an unknown discipline with 400 and writes nothing', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Estimates reject target', estimates: [{ discipline: validDisciplineA, hours: 10 }] });
      const id = createRes.body.id;

      const res = await request(app)
        .put(`/api/wbs-items/${id}/estimates`)
        .send([{ discipline: UNKNOWN_DISCIPLINE, hours: 5 }]);
      expect(res.status).toBe(400);

      const getRes = await request(app).get(`/api/projects/${projectId}/wbs`);
      const item = getRes.body.find((i: { id: number }) => i.id === id);
      expect(item.estimates).toHaveLength(1); // unchanged
      expect(item.estimates[0].discipline).toBe(validDisciplineA);
    });

    it('returns 404 for a non-existent WBS item instead of a raw 500', async () => {
      const res = await request(app)
        .put('/api/wbs-items/999999999/estimates')
        .send([{ discipline: validDisciplineA, hours: 5 }]);
      expect(res.status).toBe(404);
    });

    it('rejects a payload with duplicate (discipline, role) pairs with 400 and writes nothing (no partial delete)', async () => {
      // Regression guard: without the duplicate-pair check, deleteMany would
      // succeed and createMany would then throw on the unique constraint,
      // permanently losing the existing estimate below (delete-then-recreate
      // is not wrapped in a transaction, per this endpoint's stated convention).
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Duplicate payload target', estimates: [{ discipline: validDisciplineA, hours: 10 }] });
      const id = createRes.body.id;

      const res = await request(app)
        .put(`/api/wbs-items/${id}/estimates`)
        .send([
          { discipline: validDisciplineB, hours: 8 },
          { discipline: validDisciplineB, hours: 9 },
        ]);
      expect(res.status).toBe(400);

      const getRes = await request(app).get(`/api/projects/${projectId}/wbs`);
      const item = getRes.body.find((i: { id: number }) => i.id === id);
      expect(item.estimates).toHaveLength(1); // original estimate survives untouched
      expect(item.estimates[0].discipline).toBe(validDisciplineA);
      expect(item.estimates[0].hours).toBe(10);
    });
  });

  describe('DELETE /api/wbs-items/:id (cascade)', () => {
    it('deletes the item, its subtree, and all their estimates', async () => {
      const rootRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Cascade root', estimates: [{ discipline: validDisciplineA, hours: 5 }] });
      const rootId = rootRes.body.id;

      const childRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({ name: 'Cascade child', parentId: rootId, estimates: [{ discipline: validDisciplineB, hours: 3 }] });
      const childId = childRes.body.id;

      const grandchildRes = await request(app)
        .post(`/api/projects/${projectId}/wbs-items`)
        .send({
          name: 'Cascade grandchild',
          parentId: childId,
          estimates: [{ discipline: validDisciplineA, role: 'Lead', hours: 2 }],
        });
      const grandchildId = grandchildRes.body.id;

      const delRes = await request(app).delete(`/api/wbs-items/${rootId}`);
      expect(delRes.status).toBe(200);

      const getRes = await request(app).get(`/api/projects/${projectId}/wbs`);
      const ids = getRes.body.map((i: { id: number }) => i.id);
      expect(ids).not.toContain(rootId);
      expect(ids).not.toContain(childId);
      expect(ids).not.toContain(grandchildId);
    });
  });

  describe('GET /export and POST /import (WBS-4)', () => {
    async function deleteProject(id: number) {
      await request(app).delete(`/api/projects/${id}`);
    }

    it('round-trips a nested WBS with estimates, lists, and plans', async () => {
      const proj = await request(app).post('/api/projects').send({ name: 'WBS-4 round-trip source' });
      const srcId = proj.body.id;

      const listRes = await request(app)
        .post(`/api/projects/${srcId}/resource-lists`)
        .send({ role: 'Developer', intRate: 40 });
      expect(listRes.status).toBe(200);

      const planRes = await request(app)
        .post(`/api/projects/${srcId}/resource-plans`)
        .send({
          role: 'Developer',
          intHourlyRate: 50,
          clientHourlyRate: 75,
          allocations: [{ periodNumber: 1, allocation: 100 }],
        });
      expect(planRes.status).toBe(200);

      const rootRes = await request(app)
        .post(`/api/projects/${srcId}/wbs-items`)
        .send({
          name: 'Root task',
          phaseName: 'Phase 1',
          displayOrder: 1,
          estimates: [
            { discipline: validDisciplineA, role: 'Lead', hours: 16 },
            { discipline: validDisciplineB, role: '', hours: 8 },
          ],
        });
      expect(rootRes.status).toBe(201);
      const rootId = rootRes.body.id;

      const childRes = await request(app)
        .post(`/api/projects/${srcId}/wbs-items`)
        .send({
          name: 'Child task',
          parentId: rootId,
          phaseName: null,
          displayOrder: 2,
          estimates: [{ discipline: validDisciplineA, hours: 4 }],
        });
      expect(childRes.status).toBe(201);

      const exportRes = await request(app).get(`/api/projects/${srcId}/export`);
      expect(exportRes.status).toBe(200);
      expect(exportRes.body.schemaVersion).toBe(4);
      expect(exportRes.body.data.wbsItems).toHaveLength(2);

      const importRes = await request(app).post('/api/projects/import').send(exportRes.body);
      expect(importRes.status).toBe(200);
      const newId = importRes.body.projectId;

      const wbs = (await request(app).get(`/api/projects/${newId}/wbs`)).body as Array<{
        id: number;
        name: string;
        parentId: number | null;
        phaseName: string | null;
        displayOrder: number;
        estimates: Array<{ discipline: string; role: string; hours: number }>;
      }>;
      expect(wbs).toHaveLength(2);
      const newRoot = wbs.find((i) => i.name === 'Root task');
      const newChild = wbs.find((i) => i.name === 'Child task');
      expect(newRoot).toBeDefined();
      expect(newChild).toBeDefined();
      expect(newRoot!.parentId).toBeNull();
      expect(newChild!.parentId).toBe(newRoot!.id);
      expect(newRoot!.phaseName).toBe('Phase 1');
      expect(newChild!.phaseName).toBeNull();
      expect(newRoot!.displayOrder).toBe(1);
      expect(newRoot!.estimates.map((e) => e.role).sort()).toEqual(['', 'Lead']);
      expect(newRoot!.estimates.find((e) => e.role === 'Lead')!.hours).toBe(16);
      expect(newChild!.estimates).toHaveLength(1);
      expect(newChild!.estimates[0].hours).toBe(4);
      expect(newRoot!.id).not.toBe(rootId);

      const lists = (await request(app).get(`/api/projects/${newId}/resource-lists`)).body;
      expect(lists.some((r: { role: string }) => r.role === 'Developer')).toBe(true);
      const plans = (await request(app).get(`/api/projects/${newId}/resource-plans`)).body;
      expect(plans.some((p: { role: string }) => p.role === 'Developer')).toBe(true);

      await deleteProject(srcId);
      await deleteProject(newId);
    });

    it('exports empty wbsItems and schemaVersion 4 when the project has no WBS', async () => {
      const proj = await request(app).post('/api/projects').send({ name: 'WBS-4 empty source' });
      const srcId = proj.body.id;

      const exportRes = await request(app).get(`/api/projects/${srcId}/export`);
      expect(exportRes.status).toBe(200);
      expect(exportRes.body.schemaVersion).toBe(4);
      expect(exportRes.body.data.wbsItems).toEqual([]);

      const importRes = await request(app).post('/api/projects/import').send(exportRes.body);
      expect(importRes.status).toBe(200);
      const wbs = (await request(app).get(`/api/projects/${importRes.body.projectId}/wbs`)).body;
      expect(wbs).toEqual([]);

      await deleteProject(srcId);
      await deleteProject(importRes.body.projectId);
    });

    it('imports a v2 payload (no wbsItems) and a raw unwrapped body as empty WBS', async () => {
      const v2 = await request(app).post('/api/projects/import').send({
        schemaVersion: 2,
        data: {
          name: 'WBS-4 v2 wrapped',
          resourceLists: [{ role: 'BA', intRate: 10 }],
        },
      });
      expect(v2.status).toBe(200);
      expect((await request(app).get(`/api/projects/${v2.body.projectId}/wbs`)).body).toEqual([]);
      const lists = (await request(app).get(`/api/projects/${v2.body.projectId}/resource-lists`)).body;
      expect(lists.some((r: { role: string }) => r.role === 'BA')).toBe(true);

      const raw = await request(app).post('/api/projects/import').send({
        name: 'WBS-4 v2 raw',
        resourcePlans: [{
          role: 'QA',
          intHourlyRate: 1,
          clientHourlyRate: 2,
          allocations: [{ periodNumber: 1, allocation: 50 }],
        }],
      });
      expect(raw.status).toBe(200);
      expect((await request(app).get(`/api/projects/${raw.body.projectId}/wbs`)).body).toEqual([]);

      await deleteProject(v2.body.projectId);
      await deleteProject(raw.body.projectId);
    });

    it('promotes orphan and cyclic parentId items to roots', async () => {
      const orphan = await request(app).post('/api/projects/import').send({
        schemaVersion: 3,
        data: {
          name: 'WBS-4 orphan',
          wbsItems: [
            { id: 1, name: 'Orphan child', parentId: 99, displayOrder: 0, estimates: [] },
          ],
        },
      });
      expect(orphan.status).toBe(200);
      const orphanWbs = (await request(app).get(`/api/projects/${orphan.body.projectId}/wbs`)).body;
      expect(orphanWbs).toHaveLength(1);
      expect(orphanWbs[0].parentId).toBeNull();

      const cycle = await request(app).post('/api/projects/import').send({
        schemaVersion: 3,
        data: {
          name: 'WBS-4 cycle',
          wbsItems: [
            { id: 10, name: 'A', parentId: 11, displayOrder: 0 },
            { id: 11, name: 'B', parentId: 10, displayOrder: 1 },
          ],
        },
      });
      expect(cycle.status).toBe(200);
      const cycleWbs = (await request(app).get(`/api/projects/${cycle.body.projectId}/wbs`)).body as Array<{
        parentId: number | null;
      }>;
      expect(cycleWbs).toHaveLength(2);
      expect(cycleWbs.every((i) => i.parentId == null)).toBe(true);

      await deleteProject(orphan.body.projectId);
      await deleteProject(cycle.body.projectId);
    });

    it('writes an estimate whose discipline is not on the live rate card', async () => {
      const res = await request(app).post('/api/projects/import').send({
        schemaVersion: 3,
        data: {
          name: 'WBS-4 unknown discipline',
          wbsItems: [{
            id: 1,
            name: 'Unmapped hours',
            parentId: null,
            displayOrder: 0,
            estimates: [{ discipline: UNKNOWN_DISCIPLINE, role: '', hours: 12 }],
          }],
        },
      });
      expect(res.status).toBe(200);
      const wbs = (await request(app).get(`/api/projects/${res.body.projectId}/wbs`)).body;
      expect(wbs[0].estimates[0].discipline).toBe(UNKNOWN_DISCIPLINE);
      expect(wbs[0].estimates[0].hours).toBe(12);

      await deleteProject(res.body.projectId);
    });

    it('skips malformed estimate rows and coerces displayOrder/hours without 500', async () => {
      const res = await request(app).post('/api/projects/import').send({
        schemaVersion: 3,
        data: {
          name: 'WBS-4 malformed estimates',
          wbsItems: [{
            id: 1,
            name: 'Messy',
            parentId: null,
            displayOrder: '2',
            estimates: [
              null,
              { discipline: validDisciplineA, role: '', hours: 5 },
              { discipline: validDisciplineA, role: '', hours: 9 },
              { discipline: validDisciplineB, role: '', hours: 'Infinity' },
            ],
          }],
        },
      });
      expect(res.status).toBe(200);
      const wbs = (await request(app).get(`/api/projects/${res.body.projectId}/wbs`)).body;
      expect(wbs[0].displayOrder).toBe(2);
      expect(wbs[0].estimates).toHaveLength(2);
      expect(wbs[0].estimates.find((e: { discipline: string }) => e.discipline === validDisciplineA).hours).toBe(5);
      expect(wbs[0].estimates.find((e: { discipline: string }) => e.discipline === validDisciplineB).hours).toBe(0);

      await deleteProject(res.body.projectId);
    });
  });
});
