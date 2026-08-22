import path from 'path';

// Use a stable database path so data persists across all runs (same file every time)
if (!process.env.DATABASE_URL) {
  const dbPath = path.join(__dirname, 'prisma', 'dev.db').replace(/\\/g, '/');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

import express from 'express';
import cors from 'cors';
import { PrismaClient } from './src/generated/prisma';
import {
  projectCreateSchema,
  projectUpdateSchema,
  rateCardUpdateSchema,
  resourceListCreateSchema,
  resourceListUpdateSchema,
  resourcePlanCreateSchema,
  resourcePlanUpdateSchema,
  reorderSchema,
  allocationSchema,
  allocationUpdateSchema,
  convertPlanningModeSchema,
  generatePlanRequestSchema,
  wbsItemCreateSchema,
  wbsItemUpdateSchema,
  wbsEstimatesReplaceSchema,
  roadmapLaneCreateSchema,
  roadmapLaneUpdateSchema,
  roadmapItemCreateSchema,
  roadmapItemUpdateSchema,
  roadmapLinksReplaceSchema,
  wbsRoadmapLinkSchema,
  bootstrapRoadmapSchema,
} from './server-validation';
import { generateResourcePlan } from './server/planner/generateResourcePlan';
import { loadAIConfig } from './server/llm/config';
import { StructuredValidationError } from './server/llm/index';
import { buildDisciplineEnum } from './server/planner/rateCard';
import { parseProjectPhases, phaseLength } from './server/planner/phases';
import {
  convertWeeklyToMonthly,
  convertMonthlyToWeekly,
  convertPhasesToMonthly,
  convertPhasesToWeekly,
  getWeeksPerMonth,
} from './src/utils/modeConversion';
import { APP_DEFAULTS } from './src/config/defaults';
import { wouldCreateCycle } from './src/utils/wbsTree';
import { convertRoadmapItemsToMonthly, convertRoadmapItemsToWeekly } from './src/utils/roadmap';

const app = express();
const prisma = new PrismaClient();
const PORT = 3001;

// In-memory per-IP sliding-window rate limit store for POST /api/projects/generate-plan.
// Key: IP address, Value: array of request timestamps (ms).
const rateLimitStore = new Map<string, number[]>();

app.use(cors());
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

/**
 * Prisma's SQLite DateTime column requires a full ISO-8601 datetime — a
 * date-only string like "2026-01-05" (what a date picker naturally sends)
 * throws "premature end of input" if handed straight to the client.
 * `startDateSchema` already checked parseability; this only reshapes it.
 * `undefined` (field omitted) passes through unchanged so Prisma leaves the
 * column alone; `null` (explicit clear) also passes through unchanged.
 */
function normalizeStartDate(value: string | null | undefined): string | null | undefined {
  if (value == null || value === '') return value === '' ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

// Initialize default project if none exists
async function initializeDefaultProject() {
  const existingProject = await prisma.project.findFirst();
  if (!existingProject) {
    await prisma.project.create({
      data: {
        name: 'Default Project',
        description: 'Default project for resource planning',
        daysInFTE: APP_DEFAULTS.daysInFTE,
        clientCurrency: APP_DEFAULTS.clientCurrency,
        exchangeRate: APP_DEFAULTS.exchangeRate,
        defaultMargin: APP_DEFAULTS.defaultMargin,
      }
    });
  }
}

// Project endpoints
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        resourceLists: true,
        resourcePlans: {
          include: {
            allocations: true
          }
        }
      }
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const parsed = projectCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        daysInFTE: parsed.data.daysInFTE ?? APP_DEFAULTS.daysInFTE,
        clientCurrency: parsed.data.clientCurrency ?? APP_DEFAULTS.clientCurrency,
        exchangeRate: parsed.data.exchangeRate ?? APP_DEFAULTS.exchangeRate,
        defaultMargin: parsed.data.defaultMargin ?? APP_DEFAULTS.defaultMargin,
        planningMode: parsed.data.planningMode ?? APP_DEFAULTS.planningMode,
        defaultLocation: parsed.data.defaultLocation ?? APP_DEFAULTS.defaultLocation,
        phases: parsed.data.phases ?? undefined,
        startDate: normalizeStartDate(parsed.data.startDate),
      }
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const project = await prisma.project.update({
      where: { id: parseInt(req.params.id) },
      data: { ...parsed.data, startDate: normalizeStartDate(parsed.data.startDate) },
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    await prisma.project.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Project copy endpoint
app.post('/api/projects/:id/copy', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        resourceLists: true,
        resourcePlans: {
          include: { allocations: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const newName = req.body?.name || `${project.name} (Copy)`;

    const copy = await prisma.project.create({
      data: {
        name: newName,
        description: project.description,
        daysInFTE: project.daysInFTE,
        clientCurrency: project.clientCurrency,
        exchangeRate: project.exchangeRate,
        defaultMargin: project.defaultMargin,
        planningMode: project.planningMode,
        defaultLocation: project.defaultLocation ?? APP_DEFAULTS.defaultLocation,
        phases: project.phases ?? undefined,
      }
    });

    // Rate cards are global (shared across all projects) and are not copied.

    if (project.resourceLists.length > 0) {
      await prisma.resourceList.createMany({
        data: project.resourceLists.map((rl) => ({
          role: rl.role,
          clientRole: rl.clientRole,
          name: rl.name,
          intRate: rl.intRate,
          location: rl.location,
          description: rl.description,
          projectId: copy.id,
        }))
      });
    }

    for (const rp of project.resourcePlans) {
      await prisma.resourcePlan.create({
        data: {
          role: rp.role,
          clientRole: rp.clientRole,
          name: rp.name,
          intHourlyRate: rp.intHourlyRate,
          clientHourlyRate: rp.clientHourlyRate,
          displayOrder: rp.displayOrder,
          projectId: copy.id,
          allocations: {
            create: rp.allocations.map((a) => ({
              periodNumber: a.periodNumber,
              allocation: a.allocation,
            }))
          }
        }
      });
    }

    res.json(copy);
  } catch (error) {
    console.error('Error copying project:', error);
    res.status(500).json({ error: 'Failed to copy project' });
  }
});

// Project export endpoint
app.get('/api/projects/:id/export', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        resourceLists: true,
        resourcePlans: {
          include: { allocations: true }
        },
        wbsItems: {
          include: { estimates: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Rate cards are global and intentionally excluded from per-project export.

    const roadmap = await fetchRoadmapPayload(projectId);

    // Wrap to allow future schema versioning. schemaVersion 4 adds
    // `Project.startDate` (already on `project`, a plain scalar column) and
    // `roadmapLanes` (lanes -> items -> wbsItemIds); a schemaVersion 3
    // payload is what this looked like before the roadmap existed and still
    // imports cleanly — the roadmap is simply absent.
    const payload = {
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      data: { ...project, roadmapLanes: roadmap.lanes },
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  } catch (error) {
    console.error('Error exporting project:', error);
    res.status(500).json({ error: 'Failed to export project' });
  }
});

/**
 * Snapshot-restore WBS on import. Remaps ids; unknown/cyclic parentId → root.
 * Does not validate disciplines. Returns the old-id -> new-id map so callers
 * (roadmap link rematerialization) can remap references to these items.
 */
async function rematerializeWbsItems(wbsItems: any[], newProjectId: number): Promise<Map<number, number>> {
  const items = Array.isArray(wbsItems) ? wbsItems.filter((i) => i && typeof i === 'object') : [];
  if (items.length === 0) return new Map();

  const payloadIds = new Set(
    items
      .map((i) => i.id)
      .filter((id) => id != null && Number.isFinite(Number(id)))
      .map((id) => Number(id))
  );
  const idMap = new Map<number, number>();
  let remaining = items.slice();

  while (remaining.length > 0) {
    const ready: any[] = [];
    const blocked: any[] = [];
    for (const item of remaining) {
      const oldParent = item.parentId == null ? null : Number(item.parentId);
      const parentInPayload = oldParent != null && payloadIds.has(oldParent);
      if (!parentInPayload || idMap.has(oldParent)) {
        ready.push(item);
      } else {
        blocked.push(item);
      }
    }

    const forceRoot = ready.length === 0;
    const batch = forceRoot ? blocked : ready;

    for (const item of batch) {
      const oldParent = item.parentId == null ? null : Number(item.parentId);
      const parentInPayload = !forceRoot && oldParent != null && payloadIds.has(oldParent);
      const newParentId = parentInPayload ? (idMap.get(oldParent) ?? null) : null;
      const rawEstimates = (Array.isArray(item.estimates) ? item.estimates : [])
        .filter((e: any) => e && typeof e === 'object' && !Array.isArray(e));
      const seenPairs = new Set<string>();
      const estimates = [];
      for (const e of rawEstimates) {
        const discipline = e.discipline ?? '';
        const role = e.role ?? '';
        const pairKey = `${discipline}\0${role}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const hours = Number(e.hours);
        estimates.push({
          discipline,
          role,
          hours: Number.isFinite(hours) ? hours : 0,
        });
      }
      const order = parseInt(item.displayOrder, 10);
      const created = await prisma.wbsItem.create({
        data: {
          name: item.name || '',
          phaseName: item.phaseName ?? null,
          displayOrder: Number.isFinite(order) ? order : 0,
          projectId: newProjectId,
          parentId: newParentId,
          ...(estimates.length > 0 ? { estimates: { create: estimates } } : {}),
        },
      });
      if (item.id != null && Number.isFinite(Number(item.id))) {
        idMap.set(Number(item.id), created.id);
      }
    }

    if (forceRoot) break;
    remaining = blocked;
  }

  return idMap;
}

/**
 * Snapshot-restore the roadmap on import: lanes and items are recreated
 * fresh, and each item's DIRECT links are remapped through `wbsIdMap` (a
 * source id absent from the map — e.g. a WBS node the import payload didn't
 * include — is silently dropped, mirroring `rematerializeWbsItems`' own
 * "unknown parent -> root" tolerance rather than failing the whole import).
 * `lanes` is the same `{ name, items: [{ ...item, wbsItemIds }] }` shape
 * `GET .../roadmap` returns, so export and import share one wire format.
 */
async function rematerializeRoadmap(lanes: any[], newProjectId: number, wbsIdMap: Map<number, number>) {
  const laneList = Array.isArray(lanes) ? lanes.filter((l) => l && typeof l === 'object') : [];
  for (const laneData of laneList) {
    const laneOrder = parseInt(laneData.displayOrder, 10);
    const lane = await prisma.roadmapLane.create({
      data: {
        name: laneData.name || '',
        displayOrder: Number.isFinite(laneOrder) ? laneOrder : 0,
        projectId: newProjectId,
      },
    });

    const itemsData = Array.isArray(laneData.items) ? laneData.items : [];
    for (const itemData of itemsData) {
      const kind = itemData.kind === 'milestone' ? 'milestone' : 'bar';
      const startPeriod = parseInt(itemData.startPeriod, 10);
      const periodCount = parseInt(itemData.periodCount, 10);
      const order = parseInt(itemData.displayOrder, 10);
      const item = await prisma.roadmapItem.create({
        data: {
          name: itemData.name || '',
          kind,
          startPeriod: Number.isFinite(startPeriod) && startPeriod >= 1 ? startPeriod : 1,
          periodCount: Number.isFinite(periodCount) && periodCount >= 0 ? periodCount : (kind === 'milestone' ? 0 : 1),
          displayOrder: Number.isFinite(order) ? order : 0,
          laneId: lane.id,
          projectId: newProjectId,
        },
      });

      const rawWbsItemIds: any[] = Array.isArray(itemData.wbsItemIds) ? itemData.wbsItemIds : [];
      const remapped = rawWbsItemIds
        .map((oldId) => wbsIdMap.get(Number(oldId)))
        .filter((id): id is number => id != null);
      if (kind !== 'milestone' && remapped.length > 0) {
        await prisma.roadmapLink.createMany({
          data: remapped.map((wbsItemId) => ({ wbsItemId, roadmapItemId: item.id })),
        });
      }
    }
  }
}

/** Same shape `GET /api/projects/:id/roadmap` returns — the export/import wire format too. */
async function fetchRoadmapPayload(projectId: number) {
  const lanes = await prisma.roadmapLane.findMany({
    where: { projectId },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: {
      items: {
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        include: { links: true },
      },
    },
  });
  return {
    lanes: lanes.map((lane) => ({
      ...lane,
      items: lane.items.map(({ links, ...item }) => ({
        ...item,
        wbsItemIds: links.map((l) => l.wbsItemId),
      })),
    })),
  };
}

// Project import endpoint
app.post('/api/projects/import', async (req, res) => {
  try {
    const body = req.body;
    const projectData = body?.data || body; // support raw or wrapped JSON

    if (!projectData || !projectData.name) {
      return res.status(400).json({ error: 'Invalid import payload' });
    }

    // Create the project first
    const createdProject = await prisma.project.create({
      data: {
        name: projectData.name + ' (Imported)',
        description: projectData.description || null,
        daysInFTE: projectData.daysInFTE ?? APP_DEFAULTS.daysInFTE,
        clientCurrency: projectData.clientCurrency ?? APP_DEFAULTS.clientCurrency,
        exchangeRate: projectData.exchangeRate ?? APP_DEFAULTS.exchangeRate,
        defaultMargin: projectData.defaultMargin ?? APP_DEFAULTS.defaultMargin,
        planningMode: projectData.planningMode ?? APP_DEFAULTS.planningMode,
        defaultLocation: projectData.defaultLocation ?? APP_DEFAULTS.defaultLocation,
        phases: projectData.phases ?? undefined,
        startDate: normalizeStartDate(projectData.startDate ?? null) ?? null,
      }
    });

    const newProjectId = createdProject.id;

    // Rate cards are global (shared across all projects) and are not imported per project.

    // Import resource lists (bulk if present)
    const resourceLists = Array.isArray(projectData.resourceLists) ? projectData.resourceLists : [];
    if (resourceLists.length > 0) {
      await prisma.resourceList.createMany({
        data: resourceLists.map((rl: any) => ({
          role: rl.role || '',
          clientRole: rl.clientRole || null,
          name: rl.name || null,
          intRate: parseFloat(rl.intRate) || 0,
          location: rl.location || null,
          description: rl.description || null,
          projectId: newProjectId,
        }))
      });
    }

    // Import resource plans with nested allocations
    // Backward compat: accept both old format (weeklyAllocations/weekNumber) and new (allocations/periodNumber)
    const resourcePlans = Array.isArray(projectData.resourcePlans) ? projectData.resourcePlans : [];
    for (const rp of resourcePlans) {
      const rawAllocations = Array.isArray(rp.allocations) ? rp.allocations
        : Array.isArray(rp.weeklyAllocations) ? rp.weeklyAllocations : [];
      await prisma.resourcePlan.create({
        data: {
          role: rp.role || '',
          clientRole: rp.clientRole || null,
          name: rp.name || null,
          intHourlyRate: parseFloat(rp.intHourlyRate) || 0,
          clientHourlyRate: parseFloat(rp.clientHourlyRate) || 0,
          displayOrder: parseInt(rp.displayOrder) || 0,
          projectId: newProjectId,
          allocations: {
            create: rawAllocations.map((a: any) => ({
              periodNumber: parseInt(a.periodNumber ?? a.weekNumber) || 0,
              allocation: parseInt(a.allocation) || 0,
            })).filter((a: any) => a.periodNumber > 0)
          }
        }
      });
    }

    // WBS tree — Prisma-direct snapshot restore (no discipline re-validation).
    const wbsIdMap = await rematerializeWbsItems(projectData.wbsItems, newProjectId);

    // Roadmap — absent on a schemaVersion 3 payload (or any payload predating
    // the feature); the roadmap is simply left empty, exactly like an
    // import that never had one.
    if (Array.isArray(projectData.roadmapLanes)) {
      await rematerializeRoadmap(projectData.roadmapLanes, newProjectId, wbsIdMap);
    }

    res.json({ message: 'Import completed', projectId: newProjectId });
  } catch (error) {
    console.error('Error importing project:', error);
    res.status(500).json({ error: 'Failed to import project' });
  }
});

// Rate Card endpoints
// The rate card is global: a single shared set common to all projects.

const RATE_CARD_META_ID = 1;

// Coerce an incoming rate card payload into the GlobalRateCard scalar shape.
function toGlobalRateCardData(rateCard: any) {
  return {
    role: rateCard.role || '',
    namingInPM: rateCard.namingInPM || rateCard.role || '',
    discipline: rateCard.discipline || 'General',
    description: rateCard.description || '',
    ukraine: parseFloat(rateCard.ukraine) || 0,
    easternEurope: parseFloat(rateCard.easternEurope) || 0,
    asiaGE: parseFloat(rateCard.asiaGE) || 0,
    asiaARMKZ: parseFloat(rateCard.asiaARMKZ) || 0,
    latam: parseFloat(rateCard.latam) || 0,
    mexico: parseFloat(rateCard.mexico) || 0,
    india: parseFloat(rateCard.india) || 0,
    newYork: parseFloat(rateCard.newYork) || 0,
    london: parseFloat(rateCard.london) || 0,
  };
}

app.get('/api/rate-cards', async (req, res) => {
  try {
    const rateCards = await prisma.globalRateCard.findMany();
    res.json(rateCards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rate cards' });
  }
});

// Import metadata (file name + timestamp of the last import)
app.get('/api/rate-cards/meta', async (req, res) => {
  try {
    const meta = await prisma.rateCardImportMeta.findUnique({
      where: { id: RATE_CARD_META_ID }
    });
    res.json({ fileName: meta?.fileName ?? null, importedAt: meta?.importedAt ?? null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rate card import metadata' });
  }
});

app.post('/api/rate-cards', async (req, res) => {
  try {
    const rateCard = await prisma.globalRateCard.create({
      data: toGlobalRateCardData(req.body)
    });
    res.json(rateCard);
  } catch (error) {
    console.error('Error creating rate card:', error);
    res.status(500).json({
      error: 'Failed to create rate card',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Bulk import: atomically replaces the entire global rate card and records
// the import metadata (file name + timestamp).
app.post('/api/rate-cards/bulk', async (req, res) => {
  try {
    const rateCards = Array.isArray(req.body) ? req.body : req.body?.rateCards;
    if (!Array.isArray(rateCards)) {
      return res.status(400).json({ error: 'rateCards array required' });
    }
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : null;
    const rateCardsData = rateCards.map(toGlobalRateCardData);

    const count = await prisma.$transaction(async (tx) => {
      await tx.globalRateCard.deleteMany({});
      const result = await tx.globalRateCard.createMany({ data: rateCardsData });
      await tx.rateCardImportMeta.upsert({
        where: { id: RATE_CARD_META_ID },
        create: { id: RATE_CARD_META_ID, fileName, importedAt: new Date() },
        update: { fileName, importedAt: new Date() },
      });
      return result.count;
    });

    res.json({ message: `Successfully created ${count} rate cards`, count });
  } catch (error) {
    console.error('Error creating bulk rate cards:', error);
    res.status(500).json({
      error: 'Failed to create bulk rate cards',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.put('/api/rate-cards/:id', async (req, res) => {
  try {
    const parsed = rateCardUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const rateCard = await prisma.globalRateCard.update({
      where: { id: parseInt(req.params.id) },
      data: parsed.data
    });
    res.json(rateCard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rate card' });
  }
});

app.delete('/api/rate-cards/:id', async (req, res) => {
  try {
    await prisma.globalRateCard.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Rate card deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rate card' });
  }
});

// Delete the entire global rate card and clear the import metadata.
app.delete('/api/rate-cards', async (req, res) => {
  try {
    const count = await prisma.$transaction(async (tx) => {
      const result = await tx.globalRateCard.deleteMany({});
      await tx.rateCardImportMeta.upsert({
        where: { id: RATE_CARD_META_ID },
        create: { id: RATE_CARD_META_ID, fileName: null, importedAt: null },
        update: { fileName: null, importedAt: null },
      });
      return result.count;
    });
    res.json({ message: `${count} rate cards deleted` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rate cards' });
  }
});

// Resource List endpoints
app.get('/api/projects/:projectId/resource-lists', async (req, res) => {
  try {
    const resourceLists = await prisma.resourceList.findMany({
      where: { projectId: parseInt(req.params.projectId) }
    });
    res.json(resourceLists);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resource lists' });
  }
});

app.post('/api/projects/:projectId/resource-lists', async (req, res) => {
  try {
    const parsed = resourceListCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const resourceList = await prisma.resourceList.create({
      data: {
        role: parsed.data.role,
        clientRole: parsed.data.clientRole ?? null,
        name: parsed.data.name ?? null,
        intRate: parsed.data.intRate ?? 0,
        location: parsed.data.location ?? null,
        description: parsed.data.description ?? null,
        projectId: parseInt(req.params.projectId)
      }
    });
    res.json(resourceList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create resource list' });
  }
});

app.put('/api/resource-lists/:id', async (req, res) => {
  try {
    const parsed = resourceListUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const resourceList = await prisma.resourceList.update({
      where: { id: parseInt(req.params.id) },
      data: parsed.data
    });
    res.json(resourceList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resource list' });
  }
});

app.delete('/api/resource-lists/:id', async (req, res) => {
  try {
    await prisma.resourceList.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Resource list deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete resource list' });
  }
});

// Resource Plan endpoints
app.get('/api/projects/:projectId/resource-plans', async (req, res) => {
  try {
    const resourcePlans = await prisma.resourcePlan.findMany({
      where: { projectId: parseInt(req.params.projectId) },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      include: {
        allocations: {
          orderBy: { periodNumber: 'asc' }
        }
      }
    });
    res.json(resourcePlans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resource plans' });
  }
});

app.post('/api/projects/:projectId/resource-plans', async (req, res) => {
  try {
    const parsed = resourcePlanCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const validAllocations = (parsed.data.allocations || [])
      .filter(a => a.periodNumber > 0)
      .map(a => ({ periodNumber: a.periodNumber, allocation: a.allocation }));
    const maxOrder = await prisma.resourcePlan.aggregate({
      where: { projectId: parseInt(req.params.projectId) },
      _max: { displayOrder: true }
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;
    const resourcePlan = await prisma.resourcePlan.create({
      data: {
        role: parsed.data.role,
        clientRole: parsed.data.clientRole ?? null,
        name: parsed.data.name ?? null,
        intHourlyRate: parsed.data.intHourlyRate ?? 0,
        clientHourlyRate: parsed.data.clientHourlyRate ?? 0,
        displayOrder: nextOrder,
        projectId: parseInt(req.params.projectId),
        allocations: {
          create: validAllocations
        }
      },
      include: {
        allocations: true
      }
    });
    res.json(resourcePlan);
  } catch (error) {
    console.error('Error creating resource plan:', error);
    res.status(500).json({ 
      error: 'Failed to create resource plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.put('/api/resource-plans/:id', async (req, res) => {
  try {
    const parsed = resourcePlanUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { allocations: incomingAllocations, ...updateData } = parsed.data;

    // Update resource plan (whitelisted fields only)
    const resourcePlan = await prisma.resourcePlan.update({
      where: { id: parseInt(req.params.id) },
      data: updateData,
      include: {
        allocations: true
      }
    });

    // Update allocations if provided
    if (incomingAllocations && incomingAllocations.length > 0) {
      const validAllocations = incomingAllocations
        .filter((a): a is { periodNumber: number; allocation: number } => a != null && a.periodNumber > 0)
        .map(a => ({
          periodNumber: a.periodNumber,
          allocation: a.allocation,
          resourcePlanId: parseInt(req.params.id)
        }));

      await prisma.allocation.deleteMany({
        where: { resourcePlanId: parseInt(req.params.id) }
      });

      if (validAllocations.length > 0) {
        await prisma.allocation.createMany({
          data: validAllocations
        });
      }

      const updatedResourcePlan = await prisma.resourcePlan.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          allocations: {
            orderBy: { periodNumber: 'asc' }
          }
        }
      });

      return res.json(updatedResourcePlan);
    }
    
    res.json(resourcePlan);
  } catch (error) {
    console.error('Error updating resource plan:', error);

    // Provide more specific error messages
    const err = error as { code?: string; message?: string };
    if (err.code === 'P2002') {
      return res.status(400).json({
        error: 'Resource plan update failed',
        details: 'A resource plan with this role already exists'
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Resource plan not found',
        details: 'The resource plan you are trying to update does not exist'
      });
    }

    res.status(500).json({
      error: 'Failed to update resource plan',
      details: err.message || 'An unexpected error occurred'
    });
  }
});

app.delete('/api/resource-plans/:id', async (req, res) => {
  try {
    await prisma.resourcePlan.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Resource plan deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete resource plan' });
  }
});

app.put('/api/projects/:projectId/resource-plans/reorder', async (req, res) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { orderedIds } = parsed.data;
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.resourcePlan.update({
          where: { id },
          data: { displayOrder: index },
        })
      )
    );
    res.json({ message: 'Resource plans reordered' });
  } catch (error) {
    console.error('Error reordering resource plans:', error);
    res.status(500).json({ error: 'Failed to reorder resource plans' });
  }
});

// Allocation endpoints
app.get('/api/resource-plans/:resourcePlanId/allocations', async (req, res) => {
  try {
    const allocations = await prisma.allocation.findMany({
      where: { resourcePlanId: parseInt(req.params.resourcePlanId) },
      orderBy: { periodNumber: 'asc' }
    });
    res.json(allocations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

app.post('/api/resource-plans/:resourcePlanId/allocations', async (req, res) => {
  try {
    const parsed = allocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const alloc = await prisma.allocation.create({
      data: {
        periodNumber: parsed.data.periodNumber,
        allocation: parsed.data.allocation,
        resourcePlanId: parseInt(req.params.resourcePlanId)
      }
    });
    res.json(alloc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create allocation' });
  }
});

app.put('/api/allocations/:id', async (req, res) => {
  try {
    const parsed = allocationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const alloc = await prisma.allocation.update({
      where: { id: parseInt(req.params.id) },
      data: parsed.data
    });
    res.json(alloc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update allocation' });
  }
});

app.delete('/api/allocations/:id', async (req, res) => {
  try {
    await prisma.allocation.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Allocation deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete allocation' });
  }
});

// Convert planning mode endpoint
app.post('/api/projects/:id/convert-planning-mode', async (req, res) => {
  try {
    const parsed = convertPlanningModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { targetMode } = parsed.data;
    const projectId = parseInt(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        resourcePlans: {
          include: { allocations: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.planningMode === targetMode) {
      return res.status(400).json({ error: `Project is already in ${targetMode} mode` });
    }

    const weeksPerMonth = getWeeksPerMonth(project.daysInFTE);

    // Convert phases
    const phases = parseProjectPhases(project.phases);

    const convertedPhases = targetMode === 'monthly'
      ? convertPhasesToMonthly(phases, weeksPerMonth)
      : convertPhasesToWeekly(phases, weeksPerMonth);
    const convertedProjectPeriodCount = convertedPhases.reduce(
      (sum: number, p: any) => sum + phaseLength(p),
      0
    );

    // Perform conversion in a transaction
    await prisma.$transaction(async (tx) => {
      // Update project
      await tx.project.update({
        where: { id: projectId },
        data: {
          planningMode: targetMode,
          phases: JSON.stringify(convertedPhases),
        }
      });

      // Convert allocations for each resource plan
      for (const rp of project.resourcePlans) {
        const currentAllocations = rp.allocations.map(a => ({
          periodNumber: a.periodNumber,
          allocation: a.allocation,
        }));

        const totalPeriods = phases.reduce((sum: number, p: any) => sum + phaseLength(p), 0);

        let convertedAllocations: { periodNumber: number; allocation: number }[];
        if (targetMode === 'monthly') {
          convertedAllocations = convertWeeklyToMonthly(currentAllocations, totalPeriods, weeksPerMonth);
        } else {
          convertedAllocations = convertMonthlyToWeekly(currentAllocations, totalPeriods, weeksPerMonth);
        }

        // Delete old allocations
        await tx.allocation.deleteMany({
          where: { resourcePlanId: rp.id }
        });

        // Create new converted allocations
        if (convertedAllocations.length > 0) {
          await tx.allocation.createMany({
            data: convertedAllocations.map(a => ({
              periodNumber: a.periodNumber,
              allocation: a.allocation,
              resourcePlanId: rp.id,
            }))
          });
        }
      }

      // Convert roadmap items the same way phases are scaled (decision:
      // ceil-coarsening weekly->monthly, round-splitting monthly->weekly).
      // Milestones keep periodCount 0 and map startPeriod by boundary only.
      const roadmapItems = await tx.roadmapItem.findMany({ where: { projectId } });
      if (roadmapItems.length > 0) {
        const converted = targetMode === 'monthly'
          ? convertRoadmapItemsToMonthly(roadmapItems, weeksPerMonth, convertedProjectPeriodCount)
          : convertRoadmapItemsToWeekly(roadmapItems, weeksPerMonth, convertedProjectPeriodCount);
        for (let i = 0; i < roadmapItems.length; i++) {
          const orig = roadmapItems[i];
          const next = converted[i];
          if (next.startPeriod !== orig.startPeriod || next.periodCount !== orig.periodCount) {
            await tx.roadmapItem.update({
              where: { id: orig.id },
              data: { startPeriod: next.startPeriod, periodCount: next.periodCount },
            });
          }
        }
      }
    });

    // Return updated project with all data
    const updatedProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        resourceLists: true,
        resourcePlans: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          include: {
            allocations: {
              orderBy: { periodNumber: 'asc' }
            }
          }
        }
      }
    });

    res.json(updatedProject);
  } catch (error) {
    console.error('Error converting planning mode:', error);
    res.status(500).json({ error: 'Failed to convert planning mode' });
  }
});

// POST /api/projects/generate-plan
// Generates a draft resource plan from natural-language description + rate card.
// Read-only: zero DB writes. Must stay ABOVE the SPA catch-all.
app.post('/api/projects/generate-plan', async (req, res) => {
  try {
    // Validate request body.
    const parsed = generatePlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { mode, projectId, description, region, applyProposedPhases = false } = parsed.data;

    // Check rate card is not empty.
    const rows = await prisma.globalRateCard.findMany();
    if (rows.length === 0) {
      return res.status(409).json({ error: 'Rate card is empty. Import a rate card before generating a plan.' });
    }

    // Sliding-window rate limit (per-IP).
    const cfg = await loadAIConfig();
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const windowMs = cfg.rateLimit.windowSeconds * 1000;
    const hits = (rateLimitStore.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= cfg.rateLimit.maxPerUser) {
      const oldest = Math.min(...hits);
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
    }
    rateLimitStore.set(ip, [...hits, now]);

    // Load project for mode:current; use defaults for mode:new.
    let project: {
      planningMode: string;
      defaultMargin: number | null;
      exchangeRate: number;
      phases: string | null;
    };

    if (mode === 'current') {
      const dbProject = await prisma.project.findUnique({ where: { id: projectId! } });
      if (!dbProject) {
        return res.status(404).json({ error: 'Project not found' });
      }
      project = {
        planningMode: dbProject.planningMode,
        defaultMargin: dbProject.defaultMargin,
        exchangeRate: dbProject.exchangeRate,
        phases: dbProject.phases ?? null,
      };
    } else {
      // mode:new — use application defaults.
      project = {
        planningMode: APP_DEFAULTS.planningMode,
        defaultMargin: APP_DEFAULTS.defaultMargin,
        exchangeRate: APP_DEFAULTS.exchangeRate,
        phases: null,
      };
    }

    // AbortSignal for client disconnect.
    const ac = new AbortController();
    req.on('close', () => ac.abort());

    const result = await generateResourcePlan({
      rows,
      project,
      description,
      region,
      applyProposedPhases,
      model: undefined,
      signal: ac.signal,
    });

    res.json(result);
  } catch (err) {
    if (
      err instanceof StructuredValidationError ||
      (err as { name?: string })?.name === 'StructuredValidationError'
    ) {
      return res.status(422).json({
        error: 'LLM output did not match the expected schema',
        details: (err as { text?: string }).text,
      });
    }
    console.error('Error generating plan:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('not installed') || msg.includes('Unknown LLM provider')) {
      return res.status(503).json({ error: 'AI provider not configured', details: msg });
    }
    res.status(502).json({ error: 'AI provider error', details: msg });
  }
});

// WBS endpoints (WBS-1: data model & API only — no reorder endpoint, no
// reconciliation endpoint). Cycle detection on PUT parentId was lifted for
// the structure-edit slice — see spec-wbs-structure-edit.

// Validates a set of disciplines against the live GlobalRateCard-derived enum.
// Mirrors the empty-rate-card guard used elsewhere in this feature: an empty
// rate card skips the check (a hard enum check against an empty enum would
// brick every write).
async function validWbsDisciplines(disciplines: string[]): Promise<boolean> {
  if (disciplines.length === 0) return true;
  const rows = await prisma.globalRateCard.findMany();
  if (rows.length === 0) return true;
  const enumValues = new Set(buildDisciplineEnum(rows));
  return disciplines.every((d) => enumValues.has(d));
}

// GET /api/projects/:projectId/wbs — flat list (tree assembled client-side), with estimates.
app.get('/api/projects/:projectId/wbs', async (req, res) => {
  try {
    const items = await prisma.wbsItem.findMany({
      where: { projectId: parseInt(req.params.projectId) },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      include: { estimates: true },
    });
    res.json(items);
  } catch (error) {
    console.error('Error fetching WBS items:', error);
    res.status(500).json({ error: 'Failed to fetch WBS items' });
  }
});

// POST /api/projects/:projectId/wbs-items — create a WBS item, optionally with nested estimates.
app.post('/api/projects/:projectId/wbs-items', async (req, res) => {
  try {
    const parsed = wbsItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const projectId = parseInt(req.params.projectId);
    const { parentId, estimates, ...rest } = parsed.data;

    // Cross-project parent guard: parentId, if provided, must belong to the same project.
    if (parentId != null) {
      const parent = await prisma.wbsItem.findUnique({ where: { id: parentId } });
      if (!parent || parent.projectId !== projectId) {
        return res.status(400).json({ error: 'parentId must reference a WBS item in the same project' });
      }
    }

    if (estimates && estimates.length > 0) {
      const valid = await validWbsDisciplines(estimates.map((e) => e.discipline));
      if (!valid) {
        return res.status(400).json({ error: 'One or more estimates reference a discipline not present in the rate card' });
      }
    }

    const item = await prisma.wbsItem.create({
      data: {
        name: rest.name,
        phaseName: rest.phaseName ?? null,
        displayOrder: rest.displayOrder ?? 0,
        projectId,
        parentId: parentId ?? null,
        estimates: estimates && estimates.length > 0
          ? { create: estimates.map((e) => ({ discipline: e.discipline, role: e.role, hours: e.hours })) }
          : undefined,
      },
      include: { estimates: true },
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating WBS item:', error);
    res.status(500).json({ error: 'Failed to create WBS item' });
  }
});

// PUT /api/wbs-items/:id — update scalar fields only (name, parentId, phaseName, displayOrder).
// Estimates are replaced via the dedicated PUT .../estimates endpoint below.
app.put('/api/wbs-items/:id', async (req, res) => {
  try {
    const parsed = wbsItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const id = parseInt(req.params.id);
    const existing = await prisma.wbsItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'WBS item not found' });
    }

    const { parentId } = parsed.data;
    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) {
        return res.status(400).json({ error: 'A WBS item cannot be its own parent' });
      }
      const parent = await prisma.wbsItem.findUnique({ where: { id: parentId } });
      if (!parent || parent.projectId !== existing.projectId) {
        return res.status(400).json({ error: 'parentId must reference a WBS item in the same project' });
      }
      const projectItems = await prisma.wbsItem.findMany({
        where: { projectId: existing.projectId },
        select: { id: true, parentId: true },
      });
      if (wouldCreateCycle(projectItems, id, parentId)) {
        return res.status(400).json({ error: 'parentId would create a cycle' });
      }
    }

    const item = await prisma.wbsItem.update({
      where: { id },
      data: parsed.data,
      include: { estimates: true },
    });
    res.json(item);
  } catch (error) {
    console.error('Error updating WBS item:', error);
    res.status(500).json({ error: 'Failed to update WBS item' });
  }
});

// DELETE /api/wbs-items/:id — cascades (DB-level onDelete: Cascade) to the item's
// subtree and all estimates under the whole subtree.
app.delete('/api/wbs-items/:id', async (req, res) => {
  try {
    await prisma.wbsItem.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'WBS item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete WBS item' });
  }
});

// PUT /api/wbs-items/:id/estimates — bulk-replace: delete-then-recreate as two
// sequential calls (matches the existing ResourcePlan/Allocation convention).
// Duplicate (discipline, role) pairs are rejected by wbsEstimatesReplaceSchema
// before either call runs, so a bad payload can't delete existing estimates
// and then fail to recreate them.
app.put('/api/wbs-items/:id/estimates', async (req, res) => {
  try {
    const parsed = wbsEstimatesReplaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const wbsItemId = parseInt(req.params.id);

    const existing = await prisma.wbsItem.findUnique({ where: { id: wbsItemId } });
    if (!existing) {
      return res.status(404).json({ error: 'WBS item not found' });
    }

    const valid = await validWbsDisciplines(parsed.data.map((e) => e.discipline));
    if (!valid) {
      return res.status(400).json({ error: 'One or more estimates reference a discipline not present in the rate card' });
    }

    await prisma.wbsEstimate.deleteMany({ where: { wbsItemId } });
    if (parsed.data.length > 0) {
      await prisma.wbsEstimate.createMany({
        data: parsed.data.map((e) => ({ discipline: e.discipline, role: e.role, hours: e.hours, wbsItemId })),
      });
    }

    const estimates = await prisma.wbsEstimate.findMany({ where: { wbsItemId } });
    res.json(estimates);
  } catch (error) {
    console.error('Error replacing WBS estimates:', error);
    res.status(500).json({ error: 'Failed to replace WBS estimates' });
  }
});

// ---------------------------------------------------------------------------
// Project Roadmap (Slice A) — see _bmad-output/specs/spec-roadmap/data-model.md
//
// Two invariants enforced at the boundary, both 400: wbsItem.projectId ===
// roadmapItem.projectId, and a milestone never carries scope.
// ---------------------------------------------------------------------------

// GET /api/projects/:id/roadmap — one round trip: lanes, each with its items and their direct wbsItemIds.
app.get('/api/projects/:id/roadmap', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(await fetchRoadmapPayload(projectId));
  } catch (error) {
    console.error('Error fetching roadmap:', error);
    res.status(500).json({ error: 'Failed to fetch roadmap' });
  }
});

// POST /api/projects/:id/roadmap/lanes — appended at the end.
app.post('/api/projects/:id/roadmap/lanes', async (req, res) => {
  try {
    const parsed = roadmapLaneCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const agg = await prisma.roadmapLane.aggregate({ where: { projectId }, _max: { displayOrder: true } });
    const lane = await prisma.roadmapLane.create({
      data: { name: parsed.data.name, projectId, displayOrder: (agg._max.displayOrder ?? -1) + 1 },
    });
    res.status(201).json({ ...lane, items: [] });
  } catch (error) {
    console.error('Error creating roadmap lane:', error);
    res.status(500).json({ error: 'Failed to create roadmap lane' });
  }
});

// PATCH /api/roadmap-lanes/:id
app.patch('/api/roadmap-lanes/:id', async (req, res) => {
  try {
    const parsed = roadmapLaneUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const id = parseInt(req.params.id);
    const existing = await prisma.roadmapLane.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Roadmap lane not found' });
    }
    const lane = await prisma.roadmapLane.update({ where: { id }, data: parsed.data });
    res.json(lane);
  } catch (error) {
    console.error('Error updating roadmap lane:', error);
    res.status(500).json({ error: 'Failed to update roadmap lane' });
  }
});

// DELETE /api/roadmap-lanes/:id — cascades (DB-level onDelete: Cascade) to its items and their links.
app.delete('/api/roadmap-lanes/:id', async (req, res) => {
  try {
    await prisma.roadmapLane.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Roadmap lane deleted' });
  } catch (error) {
    console.error('Error deleting roadmap lane:', error);
    res.status(500).json({ error: 'Failed to delete roadmap lane' });
  }
});

// POST /api/projects/:id/roadmap/items
app.post('/api/projects/:id/roadmap/items', async (req, res) => {
  try {
    const parsed = roadmapItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const projectId = parseInt(req.params.id);
    const { laneId, name, kind, startPeriod, periodCount } = parsed.data;
    const lane = await prisma.roadmapLane.findUnique({ where: { id: laneId } });
    if (!lane || lane.projectId !== projectId) {
      return res.status(400).json({ error: 'laneId must reference a roadmap lane in the same project' });
    }
    const agg = await prisma.roadmapItem.aggregate({ where: { laneId }, _max: { displayOrder: true } });
    const item = await prisma.roadmapItem.create({
      data: {
        name,
        kind: kind ?? 'bar',
        startPeriod,
        periodCount,
        laneId,
        projectId,
        displayOrder: (agg._max.displayOrder ?? -1) + 1,
      },
    });
    res.status(201).json({ ...item, wbsItemIds: [] });
  } catch (error) {
    console.error('Error creating roadmap item:', error);
    res.status(500).json({ error: 'Failed to create roadmap item' });
  }
});

// PATCH /api/roadmap-items/:id — periodCount rule is re-checked against the MERGED
// row here, since the schema alone cannot see a field the payload didn't touch.
app.patch('/api/roadmap-items/:id', async (req, res) => {
  try {
    const parsed = roadmapItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const id = parseInt(req.params.id);
    const existing = await prisma.roadmapItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Roadmap item not found' });
    }

    const { laneId, kind, periodCount, startPeriod } = parsed.data;
    if (laneId !== undefined) {
      const lane = await prisma.roadmapLane.findUnique({ where: { id: laneId } });
      if (!lane || lane.projectId !== existing.projectId) {
        return res.status(400).json({ error: 'laneId must reference a roadmap lane in the same project' });
      }
    }

    const finalKind = kind ?? existing.kind;
    const finalPeriodCount = periodCount ?? existing.periodCount;
    const finalStartPeriod = startPeriod ?? existing.startPeriod;
    if (finalKind === 'bar' && finalPeriodCount < 1) {
      return res.status(400).json({ error: 'periodCount must be >= 1 for a bar' });
    }
    if (finalKind === 'milestone' && finalPeriodCount !== 0) {
      return res.status(400).json({ error: 'periodCount must be 0 for a milestone' });
    }
    if (finalKind === 'spread' && finalPeriodCount !== 0) {
      return res.status(400).json({ error: 'periodCount must be 0 for a spread item — it always spans the whole project' });
    }
    if (finalKind === 'spread' && finalStartPeriod !== 1) {
      return res.status(400).json({ error: 'startPeriod must be 1 for a spread item — it always spans the whole project' });
    }
    // Turning a scoped bar into a milestone would leave it carrying scope — refuse.
    // A spread item CAN carry scope (that is its whole point), so no such refusal there.
    if (kind === 'milestone' && existing.kind !== 'milestone') {
      const linkCount = await prisma.roadmapLink.count({ where: { roadmapItemId: id } });
      if (linkCount > 0) {
        return res.status(400).json({ error: 'A milestone cannot carry scope; unlink it first' });
      }
    }

    const item = await prisma.roadmapItem.update({
      where: { id },
      data: parsed.data,
      include: { links: true },
    });
    res.json({ ...item, wbsItemIds: item.links.map((l) => l.wbsItemId) });
  } catch (error) {
    console.error('Error updating roadmap item:', error);
    res.status(500).json({ error: 'Failed to update roadmap item' });
  }
});

// DELETE /api/roadmap-items/:id — cascades (DB-level onDelete: Cascade) to its links;
// the affected WBS scope simply becomes unplaced (or falls back to an ancestor link).
app.delete('/api/roadmap-items/:id', async (req, res) => {
  try {
    await prisma.roadmapItem.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Roadmap item deleted' });
  } catch (error) {
    console.error('Error deleting roadmap item:', error);
    res.status(500).json({ error: 'Failed to delete roadmap item' });
  }
});

// PUT /api/roadmap-items/:id/links — replace this item's DIRECT links. A listed
// wbsItemId currently linked to a DIFFERENT item moves here (mirrors
// `replaceWbsEstimates`'s delete-then-recreate convention).
app.put('/api/roadmap-items/:id/links', async (req, res) => {
  try {
    const parsed = roadmapLinksReplaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const roadmapItemId = parseInt(req.params.id);
    const item = await prisma.roadmapItem.findUnique({ where: { id: roadmapItemId } });
    if (!item) {
      return res.status(404).json({ error: 'Roadmap item not found' });
    }
    const { wbsItemIds } = parsed.data;
    if (item.kind === 'milestone' && wbsItemIds.length > 0) {
      return res.status(400).json({ error: 'A milestone cannot carry scope' });
    }
    if (wbsItemIds.length > 0) {
      const wbsRows = await prisma.wbsItem.findMany({ where: { id: { in: wbsItemIds } } });
      const foundIds = new Set(wbsRows.map((w) => w.id));
      const allBelong = wbsRows.every((w) => w.projectId === item.projectId) && wbsItemIds.every((id) => foundIds.has(id));
      if (!allBelong) {
        return res.status(400).json({ error: 'wbsItemIds must reference WBS items in the same project' });
      }
    }

    await prisma.roadmapLink.deleteMany({ where: { roadmapItemId } });
    if (wbsItemIds.length > 0) {
      // Drop any existing link row for these nodes first — `wbsItemId` is @unique,
      // so a node currently linked elsewhere must be freed before it can move here.
      await prisma.roadmapLink.deleteMany({ where: { wbsItemId: { in: wbsItemIds } } });
      await prisma.roadmapLink.createMany({
        data: wbsItemIds.map((wbsItemId) => ({ wbsItemId, roadmapItemId })),
      });
    }

    const links = await prisma.roadmapLink.findMany({ where: { roadmapItemId } });
    res.json({ wbsItemIds: links.map((l) => l.wbsItemId) });
  } catch (error) {
    console.error('Error replacing roadmap item links:', error);
    res.status(500).json({ error: 'Failed to replace roadmap item links' });
  }
});

// PUT /api/wbs-items/:id/roadmap-link — the WBS-side edit; `roadmapItemId: null` unlinks.
app.put('/api/wbs-items/:id/roadmap-link', async (req, res) => {
  try {
    const parsed = wbsRoadmapLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const wbsItemId = parseInt(req.params.id);
    const wbsItemRow = await prisma.wbsItem.findUnique({ where: { id: wbsItemId } });
    if (!wbsItemRow) {
      return res.status(404).json({ error: 'WBS item not found' });
    }
    const { roadmapItemId } = parsed.data;

    if (roadmapItemId === null) {
      await prisma.roadmapLink.deleteMany({ where: { wbsItemId } });
      return res.json({ wbsItemId, roadmapItemId: null });
    }

    const roadmapItem = await prisma.roadmapItem.findUnique({ where: { id: roadmapItemId } });
    if (!roadmapItem || roadmapItem.projectId !== wbsItemRow.projectId) {
      return res.status(400).json({ error: 'roadmapItemId must reference a roadmap item in the same project' });
    }
    if (roadmapItem.kind === 'milestone') {
      return res.status(400).json({ error: 'A milestone cannot carry scope' });
    }

    await prisma.roadmapLink.deleteMany({ where: { wbsItemId } });
    await prisma.roadmapLink.create({ data: { wbsItemId, roadmapItemId } });
    res.json({ wbsItemId, roadmapItemId });
  } catch (error) {
    console.error('Error updating WBS roadmap link:', error);
    res.status(500).json({ error: 'Failed to update WBS roadmap link' });
  }
});

// POST /api/projects/:id/roadmap/bulk — the bootstrapRoadmap preview, written transactionally.
// Refused with 409 unless the roadmap is currently empty (no lanes).
app.post('/api/projects/:id/roadmap/bulk', async (req, res) => {
  try {
    const parsed = bootstrapRoadmapSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const laneCount = await prisma.roadmapLane.count({ where: { projectId } });
    if (laneCount > 0) {
      return res.status(409).json({ error: 'Roadmap must be empty to bootstrap' });
    }

    const allWbsItemIds = parsed.data.lanes.flatMap((lane) => lane.items.flatMap((item) => item.wbsItemIds));
    if (allWbsItemIds.length > 0) {
      const wbsRows = await prisma.wbsItem.findMany({ where: { id: { in: allWbsItemIds } } });
      const foundIds = new Set(wbsRows.map((w) => w.id));
      const allBelong =
        wbsRows.every((w) => w.projectId === projectId) && allWbsItemIds.every((id) => foundIds.has(id));
      if (!allBelong) {
        return res.status(400).json({ error: 'wbsItemIds must reference WBS items in this project' });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (let laneIndex = 0; laneIndex < parsed.data.lanes.length; laneIndex++) {
        const laneInput = parsed.data.lanes[laneIndex];
        const lane = await tx.roadmapLane.create({
          data: { name: laneInput.name, projectId, displayOrder: laneIndex },
        });
        for (let itemIndex = 0; itemIndex < laneInput.items.length; itemIndex++) {
          const itemInput = laneInput.items[itemIndex];
          const item = await tx.roadmapItem.create({
            data: {
              name: itemInput.name,
              kind: 'bar',
              startPeriod: itemInput.startPeriod,
              periodCount: itemInput.periodCount,
              laneId: lane.id,
              projectId,
              displayOrder: itemIndex,
            },
          });
          if (itemInput.wbsItemIds.length > 0) {
            await tx.roadmapLink.createMany({
              data: itemInput.wbsItemIds.map((wbsItemId) => ({ wbsItemId, roadmapItemId: item.id })),
            });
          }
        }
      }
    });

    res.status(201).json(await fetchRoadmapPayload(projectId));
  } catch (error) {
    console.error('Error bootstrapping roadmap:', error);
    res.status(500).json({ error: 'Failed to bootstrap roadmap' });
  }
});

// Serve React app for all non-API routes (must be last)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Export app for Supertest integration tests
export { app, initializeDefaultProject };

// Start server when not in test (Vitest sets process.env.VITEST)
if (typeof process !== 'undefined' && process.env?.VITEST !== 'true') {
  initializeDefaultProject().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API endpoints available at http://localhost:${PORT}/api`);
    });
  }).catch(console.error);
}
