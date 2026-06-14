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
} from './server-validation';
import {
  convertWeeklyToMonthly,
  convertMonthlyToWeekly,
  convertPhasesToMonthly,
  convertPhasesToWeekly,
  getWeeksPerMonth,
} from './src/utils/modeConversion';
import { APP_DEFAULTS } from './src/config/defaults';

const app = express();
const prisma = new PrismaClient();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

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
      data: parsed.data
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
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Rate cards are global and intentionally excluded from per-project export.

    // Wrap to allow future schema versioning
    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      data: project
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  } catch (error) {
    console.error('Error exporting project:', error);
    res.status(500).json({ error: 'Failed to export project' });
  }
});

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
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Resource plan update failed',
        details: 'A resource plan with this role already exists'
      });
    }
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Resource plan not found',
        details: 'The resource plan you are trying to update does not exist'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update resource plan',
      details: error.message || 'An unexpected error occurred'
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
    let phases: any[] = [];
    try {
      phases = JSON.parse(project.phases || '[]');
    } catch { /* empty */ }

    const convertedPhases = targetMode === 'monthly'
      ? convertPhasesToMonthly(phases, weeksPerMonth)
      : convertPhasesToWeekly(phases, weeksPerMonth);

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

        const totalPeriods = phases.reduce((sum: number, p: any) => sum + (p.periodCount ?? p.weekCount ?? 0), 0);

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
