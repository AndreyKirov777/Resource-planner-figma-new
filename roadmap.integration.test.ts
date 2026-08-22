import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { isolateTestDb } from './testDb';

let app: Express;
let initializeDefaultProject: () => Promise<void>;

/**
 * Project Roadmap (Slice A) integration tests — route behavior against the
 * real app/db, mirroring wbs.integration.test.ts's structure. Own disposable
 * prisma/test-roadmap.db (see testDb.ts): `isolateTestDb` runs BEFORE the
 * dynamic `./server` import so its `new PrismaClient()` picks up this file's
 * DATABASE_URL rather than prisma/dev.db.
 */
describe('Roadmap API integration', () => {
  let projectId: number;
  let otherProjectId: number;

  beforeAll(async () => {
    await isolateTestDb('roadmap');
    ({ app, initializeDefaultProject } = await import('./server'));
    await initializeDefaultProject();

    const projRes = await request(app).post('/api/projects').send({ name: 'Roadmap test project' });
    projectId = projRes.body.id;
    const otherRes = await request(app).post('/api/projects').send({ name: 'Roadmap test project (other)' });
    otherProjectId = otherRes.body.id;
  });

  afterAll(async () => {
    if (!app) return;
    await request(app).delete(`/api/projects/${projectId}`);
    await request(app).delete(`/api/projects/${otherProjectId}`);
  });

  async function makeLane(pid: number, name = 'Backend') {
    const res = await request(app).post(`/api/projects/${pid}/roadmap/lanes`).send({ name });
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  async function makeItem(
    pid: number,
    laneId: number,
    overrides: Partial<{ name: string; kind: 'bar' | 'milestone' | 'spread'; startPeriod: number; periodCount: number }> = {}
  ) {
    const res = await request(app)
      .post(`/api/projects/${pid}/roadmap/items`)
      .send({ laneId, name: 'Item', startPeriod: 1, periodCount: 2, ...overrides });
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  async function makeWbsItem(pid: number, overrides: Record<string, unknown> = {}) {
    const res = await request(app).post(`/api/projects/${pid}/wbs-items`).send({ name: 'Leaf', ...overrides });
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  describe('GET /api/projects/:id/roadmap', () => {
    it('returns an empty lanes array for a project with no roadmap', async () => {
      const res = await request(app).get(`/api/projects/${otherProjectId}/roadmap`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ lanes: [] });
    });

    it('returns lanes with nested items and each item\'s wbsItemIds, in one round trip', async () => {
      const laneId = await makeLane(projectId, 'Platform');
      const itemId = await makeItem(projectId, laneId, { name: 'API', startPeriod: 1, periodCount: 3 });
      const leafId = await makeWbsItem(projectId, { name: 'Auth service' });
      const linkRes = await request(app)
        .put(`/api/roadmap-items/${itemId}/links`)
        .send({ wbsItemIds: [leafId] });
      expect(linkRes.status).toBe(200);

      const res = await request(app).get(`/api/projects/${projectId}/roadmap`);
      expect(res.status).toBe(200);
      const lane = res.body.lanes.find((l: { id: number }) => l.id === laneId);
      expect(lane).toBeDefined();
      expect(lane.items).toHaveLength(1);
      expect(lane.items[0].id).toBe(itemId);
      expect(lane.items[0].wbsItemIds).toEqual([leafId]);
    });
  });

  describe('project invariant on links', () => {
    it('PUT /api/roadmap-items/:id/links rejects a wbsItemId from a different project (400)', async () => {
      const laneId = await makeLane(projectId, 'Cross-project lane');
      const itemId = await makeItem(projectId, laneId);
      const foreignLeafId = await makeWbsItem(otherProjectId, { name: 'Foreign leaf' });

      const res = await request(app)
        .put(`/api/roadmap-items/${itemId}/links`)
        .send({ wbsItemIds: [foreignLeafId] });
      expect(res.status).toBe(400);
    });

    it('PUT /api/wbs-items/:id/roadmap-link rejects a roadmapItemId from a different project (400)', async () => {
      const foreignLaneId = await makeLane(otherProjectId, 'Foreign lane');
      const foreignItemId = await makeItem(otherProjectId, foreignLaneId);
      const leafId = await makeWbsItem(projectId, { name: 'Local leaf' });

      const res = await request(app)
        .put(`/api/wbs-items/${leafId}/roadmap-link`)
        .send({ roadmapItemId: foreignItemId });
      expect(res.status).toBe(400);
    });

    it('POST /api/projects/:id/roadmap/items rejects a laneId from a different project (400)', async () => {
      const foreignLaneId = await makeLane(otherProjectId, 'Foreign lane 2');
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/items`)
        .send({ laneId: foreignLaneId, name: 'Bad', startPeriod: 1, periodCount: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('milestone scope refused', () => {
    it('PUT /api/roadmap-items/:id/links refuses scope on a milestone (400)', async () => {
      const laneId = await makeLane(projectId, 'Milestones');
      const msId = await makeItem(projectId, laneId, { name: 'Launch', kind: 'milestone', startPeriod: 5, periodCount: 0 });
      const leafId = await makeWbsItem(projectId, { name: 'Some leaf' });

      const res = await request(app)
        .put(`/api/roadmap-items/${msId}/links`)
        .send({ wbsItemIds: [leafId] });
      expect(res.status).toBe(400);
    });

    it('PUT /api/wbs-items/:id/roadmap-link refuses linking to a milestone (400)', async () => {
      const laneId = await makeLane(projectId, 'Milestones 2');
      const msId = await makeItem(projectId, laneId, { name: 'Launch 2', kind: 'milestone', startPeriod: 5, periodCount: 0 });
      const leafId = await makeWbsItem(projectId, { name: 'Another leaf' });

      const res = await request(app)
        .put(`/api/wbs-items/${leafId}/roadmap-link`)
        .send({ roadmapItemId: msId });
      expect(res.status).toBe(400);
    });

    it('POST .../items rejects a milestone with a non-zero periodCount (400, via the strict schema)', async () => {
      const laneId = await makeLane(projectId, 'Milestones 3');
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/items`)
        .send({ laneId, name: 'Bad milestone', kind: 'milestone', startPeriod: 1, periodCount: 2 });
      expect(res.status).toBe(400);
    });

    it('PATCH .../items refuses turning a scoped bar into a milestone (400)', async () => {
      const laneId = await makeLane(projectId, 'Milestones 4');
      const itemId = await makeItem(projectId, laneId, { name: 'Scoped bar' });
      const leafId = await makeWbsItem(projectId, { name: 'Scope leaf' });
      await request(app).put(`/api/roadmap-items/${itemId}/links`).send({ wbsItemIds: [leafId] });

      const res = await request(app)
        .patch(`/api/roadmap-items/${itemId}`)
        .send({ kind: 'milestone', periodCount: 0 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/projects/:id/roadmap/bulk', () => {
    it('is refused with 409 when the roadmap is not empty', async () => {
      const laneId = await makeLane(projectId, 'Bulk-blocker lane');
      // A lane alone (no items) already makes the roadmap non-empty.
      void laneId;
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/bulk`)
        .send({ lanes: [{ name: 'Should fail', items: [] }] });
      expect(res.status).toBe(409);
    });

    it('writes lanes/items/links transactionally when the roadmap is empty', async () => {
      const proj = await request(app).post('/api/projects').send({ name: 'Roadmap bulk project' });
      const bulkProjectId = proj.body.id;
      const leafId = await makeWbsItem(bulkProjectId, { name: 'Bulk leaf' });

      const res = await request(app)
        .post(`/api/projects/${bulkProjectId}/roadmap/bulk`)
        .send({
          lanes: [
            {
              name: 'Platform',
              items: [{ name: 'Backend', startPeriod: 1, periodCount: 4, wbsItemIds: [leafId] }],
            },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.lanes).toHaveLength(1);
      expect(res.body.lanes[0].items[0].wbsItemIds).toEqual([leafId]);

      await request(app).delete(`/api/projects/${bulkProjectId}`);
    });
  });

  describe('cascade on lane delete', () => {
    it('deleting a lane deletes its items and their links', async () => {
      const laneId = await makeLane(projectId, 'Doomed lane');
      const itemId = await makeItem(projectId, laneId, { name: 'Doomed item' });
      const leafId = await makeWbsItem(projectId, { name: 'Doomed leaf scope' });
      await request(app).put(`/api/roadmap-items/${itemId}/links`).send({ wbsItemIds: [leafId] });

      const delRes = await request(app).delete(`/api/roadmap-lanes/${laneId}`);
      expect(delRes.status).toBe(200);

      const roadmap = await request(app).get(`/api/projects/${projectId}/roadmap`);
      expect(roadmap.body.lanes.find((l: { id: number }) => l.id === laneId)).toBeUndefined();

      // The WBS node itself survives — only its link is gone.
      const wbsLinkRes = await request(app)
        .put(`/api/wbs-items/${leafId}/roadmap-link`)
        .send({ roadmapItemId: null });
      expect(wbsLinkRes.status).toBe(200);
      expect(wbsLinkRes.body.roadmapItemId).toBeNull();
    });
  });

  describe('link moved by PUT /links', () => {
    it('a wbsItemId already linked to item A moves to item B when replaced there', async () => {
      const laneId = await makeLane(projectId, 'Move lane');
      const itemA = await makeItem(projectId, laneId, { name: 'A' });
      const itemB = await makeItem(projectId, laneId, { name: 'B' });
      const leafId = await makeWbsItem(projectId, { name: 'Movable leaf' });

      const first = await request(app).put(`/api/roadmap-items/${itemA}/links`).send({ wbsItemIds: [leafId] });
      expect(first.status).toBe(200);
      expect(first.body.wbsItemIds).toEqual([leafId]);

      const second = await request(app).put(`/api/roadmap-items/${itemB}/links`).send({ wbsItemIds: [leafId] });
      expect(second.status).toBe(200);
      expect(second.body.wbsItemIds).toEqual([leafId]);

      // A no longer has it.
      const roadmap = await request(app).get(`/api/projects/${projectId}/roadmap`);
      const laneRow = roadmap.body.lanes.find((l: { id: number }) => l.id === laneId);
      const aRow = laneRow.items.find((i: { id: number }) => i.id === itemA);
      const bRow = laneRow.items.find((i: { id: number }) => i.id === itemB);
      expect(aRow.wbsItemIds).toEqual([]);
      expect(bRow.wbsItemIds).toEqual([leafId]);
    });
  });

  describe('startDate round-tripping through project update', () => {
    it('PUT /api/projects/:id persists and returns startDate', async () => {
      const setRes = await request(app)
        .put(`/api/projects/${projectId}`)
        .send({ startDate: '2026-01-05' });
      expect(setRes.status).toBe(200);
      expect(new Date(setRes.body.startDate).toISOString().slice(0, 10)).toBe('2026-01-05');

      const getRes = await request(app).get(`/api/projects/${projectId}`);
      expect(new Date(getRes.body.startDate).toISOString().slice(0, 10)).toBe('2026-01-05');

      const clearRes = await request(app).put(`/api/projects/${projectId}`).send({ startDate: null });
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.startDate).toBeNull();
    });
  });

  describe('the spread kind (Slice B, decision 2)', () => {
    it('POST .../items creates a spread item at its (1, 0) sentinel window', async () => {
      const laneId = await makeLane(projectId, 'PM lane');
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/items`)
        .send({ laneId, name: 'PM', kind: 'spread', startPeriod: 1, periodCount: 0 });
      expect(res.status).toBe(201);
      expect(res.body.kind).toBe('spread');
      expect(res.body.startPeriod).toBe(1);
      expect(res.body.periodCount).toBe(0);
    });

    it('POST .../items rejects a spread item with a non-zero periodCount (400, via the strict schema)', async () => {
      const laneId = await makeLane(projectId, 'PM lane 2');
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/items`)
        .send({ laneId, name: 'Bad spread', kind: 'spread', startPeriod: 1, periodCount: 3 });
      expect(res.status).toBe(400);
    });

    it('POST .../items rejects a spread item with a startPeriod other than 1 (400, via the strict schema)', async () => {
      const laneId = await makeLane(projectId, 'PM lane 3');
      const res = await request(app)
        .post(`/api/projects/${projectId}/roadmap/items`)
        .send({ laneId, name: 'Bad spread 2', kind: 'spread', startPeriod: 5, periodCount: 0 });
      expect(res.status).toBe(400);
    });

    it('PATCH .../items turns a bar into a spread item when both fields are reset to the sentinel', async () => {
      const laneId = await makeLane(projectId, 'PM lane 4');
      const itemId = await makeItem(projectId, laneId, { name: 'Was a bar', startPeriod: 3, periodCount: 5 });

      const res = await request(app)
        .patch(`/api/roadmap-items/${itemId}`)
        .send({ kind: 'spread', startPeriod: 1, periodCount: 0 });
      expect(res.status).toBe(200);
      expect(res.body.kind).toBe('spread');
    });

    it('PATCH .../items rejects turning a bar into a spread item without resetting periodCount (400, merged-row check)', async () => {
      const laneId = await makeLane(projectId, 'PM lane 5');
      const itemId = await makeItem(projectId, laneId, { name: 'Bar', startPeriod: 1, periodCount: 4 });

      // Sends only `kind` — the existing periodCount (4) survives the merge and fails the sentinel rule server-side.
      const res = await request(app).patch(`/api/roadmap-items/${itemId}`).send({ kind: 'spread' });
      expect(res.status).toBe(400);
    });

    it('a spread item CAN carry scope, unlike a milestone', async () => {
      const laneId = await makeLane(projectId, 'PM lane 6');
      const spreadId = await makeItem(projectId, laneId, { name: 'PM spread', kind: 'spread', startPeriod: 1, periodCount: 0 });
      const leafId = await makeWbsItem(projectId, { name: 'PM leaf' });

      const res = await request(app)
        .put(`/api/roadmap-items/${spreadId}/links`)
        .send({ wbsItemIds: [leafId] });
      expect(res.status).toBe(200);
      expect(res.body.wbsItemIds).toEqual([leafId]);
    });
  });

  describe('PATCH /api/projects/:id/roadmap/reorder', () => {
    it('renumbers a single lane contiguously in one request', async () => {
      const laneId = await makeLane(projectId, 'Reorder lane A');
      const a = await makeItem(projectId, laneId, { name: 'A' });
      const b = await makeItem(projectId, laneId, { name: 'B' });
      const c = await makeItem(projectId, laneId, { name: 'C' });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({
          items: [
            { id: c, laneId, displayOrder: 0 },
            { id: a, laneId, displayOrder: 1 },
            { id: b, laneId, displayOrder: 2 },
          ],
        });
      expect(res.status).toBe(200);
      const lane = res.body.lanes.find((l: { id: number }) => l.id === laneId);
      expect(lane.items.map((i: { id: number }) => i.id)).toEqual([c, a, b]);
    });

    it('moves an item to another lane and its window, both lanes renumbered, in ONE request', async () => {
      const laneA = await makeLane(projectId, 'Reorder lane B1');
      const laneB = await makeLane(projectId, 'Reorder lane B2');
      const x = await makeItem(projectId, laneA, { name: 'X', startPeriod: 1, periodCount: 2 });
      const y = await makeItem(projectId, laneB, { name: 'Y' });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({
          items: [
            { id: x, laneId: laneB, displayOrder: 0, startPeriod: 5, periodCount: 3 },
            { id: y, laneId: laneB, displayOrder: 1 },
          ],
        });
      expect(res.status).toBe(200);
      const laneBRow = res.body.lanes.find((l: { id: number }) => l.id === laneB);
      expect(laneBRow.items.map((i: { id: number }) => i.id)).toEqual([x, y]);
      const xRow = laneBRow.items.find((i: { id: number }) => i.id === x);
      expect(xRow.startPeriod).toBe(5);
      expect(xRow.periodCount).toBe(3);
      const laneARow = res.body.lanes.find((l: { id: number }) => l.id === laneA);
      expect(laneARow.items).toEqual([]);
    });

    it('reorders lanes themselves', async () => {
      const l1 = await makeLane(projectId, 'Reorder lane C1');
      const l2 = await makeLane(projectId, 'Reorder lane C2');

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({ lanes: [{ id: l2, displayOrder: 0 }, { id: l1, displayOrder: 1 }] });
      expect(res.status).toBe(200);
      const ids = res.body.lanes
        .filter((l: { id: number }) => l.id === l1 || l.id === l2)
        .sort((a: { displayOrder: number }, b: { displayOrder: number }) => a.displayOrder - b.displayOrder)
        .map((l: { id: number }) => l.id);
      expect(ids).toEqual([l2, l1]);
    });

    it('rejects an item id from a different project (400) and writes NOTHING (atomic)', async () => {
      const laneId = await makeLane(projectId, 'Reorder atomic lane');
      const a = await makeItem(projectId, laneId, { name: 'A', startPeriod: 1, periodCount: 2 });
      const b = await makeItem(projectId, laneId, { name: 'B', startPeriod: 3, periodCount: 2 });
      const foreignLaneId = await makeLane(otherProjectId, 'Foreign reorder lane');
      const foreignItemId = await makeItem(otherProjectId, foreignLaneId, { name: 'Foreign' });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({
          items: [
            { id: b, laneId, displayOrder: 0 },
            { id: a, laneId, displayOrder: 1 },
            { id: foreignItemId, laneId, displayOrder: 2 },
          ],
        });
      expect(res.status).toBe(400);

      // Nothing committed: a and b keep their original order.
      const roadmap = await request(app).get(`/api/projects/${projectId}/roadmap`);
      const lane = roadmap.body.lanes.find((l: { id: number }) => l.id === laneId);
      expect(lane.items.map((i: { id: number }) => i.id)).toEqual([a, b]);
    });

    it('rejects a laneId from a different project (400)', async () => {
      const laneId = await makeLane(projectId, 'Reorder foreign-lane target');
      const itemId = await makeItem(projectId, laneId, { name: 'Item' });
      const foreignLaneId = await makeLane(otherProjectId, 'Foreign target lane');

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({ items: [{ id: itemId, laneId: foreignLaneId, displayOrder: 0 }] });
      expect(res.status).toBe(400);
    });

    it('refuses a window write on a spread item (400), matching the single-item PATCH rule', async () => {
      const laneId = await makeLane(projectId, 'Reorder spread lane');
      const spreadId = await makeItem(projectId, laneId, { name: 'Spread', kind: 'spread', startPeriod: 1, periodCount: 0 });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/roadmap/reorder`)
        .send({ items: [{ id: spreadId, laneId, displayOrder: 0, startPeriod: 1, periodCount: 4 }] });
      expect(res.status).toBe(400);
    });
  });
});
