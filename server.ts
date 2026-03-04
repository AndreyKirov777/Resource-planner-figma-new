import express from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from './src/generated/prisma';

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
        daysInFTE: 20,
        clientCurrency: 'EUR',
        exchangeRate: 0.89,
        defaultMargin: 25.0
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
        rateCards: true,
        resourceLists: true,
        resourcePlans: {
          include: {
            weeklyAllocations: true
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
    const project = await prisma.project.create({
      data: req.body
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await prisma.project.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Project export endpoint
app.get('/api/projects/:id/export', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        rateCards: true,
        resourceLists: true,
        resourcePlans: {
          include: { weeklyAllocations: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Wrap to allow future schema versioning
    const payload = {
      schemaVersion: 1,
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
        daysInFTE: projectData.daysInFTE ?? 20,
        clientCurrency: projectData.clientCurrency ?? 'EUR',
        exchangeRate: projectData.exchangeRate ?? 0.89,
        defaultMargin: projectData.defaultMargin ?? 25.0,
      }
    });

    const newProjectId = createdProject.id;

    // Import rate cards (bulk if present)
    const rateCards = Array.isArray(projectData.rateCards) ? projectData.rateCards : [];
    if (rateCards.length > 0) {
      await prisma.rateCard.createMany({
        data: rateCards.map((r: any) => ({
          role: r.role || '',
          namingInPM: r.namingInPM || r.role || '',
          discipline: r.discipline || 'General',
          description: r.description || '',
          ukraine: parseFloat(r.ukraine) || 0,
          easternEurope: parseFloat(r.easternEurope) || 0,
          asiaGE: parseFloat(r.asiaGE) || 0,
          asiaARMKZ: parseFloat(r.asiaARMKZ) || 0,
          latam: parseFloat(r.latam) || 0,
          mexico: parseFloat(r.mexico) || 0,
          india: parseFloat(r.india) || 0,
          newYork: parseFloat(r.newYork) || 0,
          london: parseFloat(r.london) || 0,
          projectId: newProjectId,
        }) )
      });
    }

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
    const resourcePlans = Array.isArray(projectData.resourcePlans) ? projectData.resourcePlans : [];
    for (const rp of resourcePlans) {
      const weekly = Array.isArray(rp.weeklyAllocations) ? rp.weeklyAllocations : [];
      await prisma.resourcePlan.create({
        data: {
          role: rp.role || '',
          clientRole: rp.clientRole || null,
          name: rp.name || null,
          intHourlyRate: parseFloat(rp.intHourlyRate) || 0,
          clientHourlyRate: parseFloat(rp.clientHourlyRate) || 0,
          projectId: newProjectId,
          weeklyAllocations: {
            create: weekly.map((wa: any) => ({
              weekNumber: parseInt(wa.weekNumber) || 0,
              allocation: parseInt(wa.allocation) || 0,
            })).filter((wa: any) => wa.weekNumber > 0)
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
app.get('/api/projects/:projectId/rate-cards', async (req, res) => {
  try {
    const rateCards = await prisma.rateCard.findMany({
      where: { projectId: parseInt(req.params.projectId) }
    });
    res.json(rateCards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rate cards' });
  }
});

app.post('/api/projects/:projectId/rate-cards', async (req, res) => {
  try {
    console.log('Creating rate card with data:', req.body);
    
    // Ensure all required fields are present with defaults
    const rateCardData = {
      role: req.body.role || '',
      namingInPM: req.body.namingInPM || req.body.role || '',
      discipline: req.body.discipline || 'General',
      description: req.body.description || '',
      ukraine: parseFloat(req.body.ukraine) || 0,
      easternEurope: parseFloat(req.body.easternEurope) || 0,
      asiaGE: parseFloat(req.body.asiaGE) || 0,
      asiaARMKZ: parseFloat(req.body.asiaARMKZ) || 0,
      latam: parseFloat(req.body.latam) || 0,
      mexico: parseFloat(req.body.mexico) || 0,
      india: parseFloat(req.body.india) || 0,
      newYork: parseFloat(req.body.newYork) || 0,
      london: parseFloat(req.body.london) || 0,
      projectId: parseInt(req.params.projectId)
    };
    
    const rateCard = await prisma.rateCard.create({
      data: rateCardData
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

// Bulk create rate cards endpoint
app.post('/api/projects/:projectId/rate-cards/bulk', async (req, res) => {
  try {
    console.log('Creating bulk rate cards with data:', req.body);
    
    const projectId = parseInt(req.params.projectId);
    const rateCardsData = req.body.map((rateCard: any) => ({
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
      projectId: projectId
    }));
    
    const result = await prisma.rateCard.createMany({
      data: rateCardsData
    });
    
    res.json({ 
      message: `Successfully created ${result.count} rate cards`,
      count: result.count
    });
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
    const rateCard = await prisma.rateCard.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(rateCard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rate card' });
  }
});

app.delete('/api/rate-cards/:id', async (req, res) => {
  try {
    await prisma.rateCard.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Rate card deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rate card' });
  }
});

app.delete('/api/rate-cards', async (req, res) => {
  try {
    const result = await prisma.rateCard.deleteMany({});
    res.json({ message: `${result.count} rate cards deleted` });
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
    const resourceList = await prisma.resourceList.create({
      data: {
        ...req.body,
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
    const resourceList = await prisma.resourceList.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
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
      include: {
        weeklyAllocations: {
          orderBy: { weekNumber: 'asc' }
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
    const { weeklyAllocations, ...resourcePlanData } = req.body;
    
    // Filter and validate weekly allocations
    const validAllocations = (weeklyAllocations || [])
      .filter((wa: any) => wa && typeof wa === 'object')
      .map((wa: any) => ({
        weekNumber: parseInt(wa.weekNumber) || 0,
        allocation: parseInt(wa.allocation) || 0
      }))
      .filter(wa => wa.weekNumber > 0); // Only create allocations with valid week numbers
    
    const resourcePlan = await prisma.resourcePlan.create({
      data: {
        ...resourcePlanData,
        projectId: parseInt(req.params.projectId),
        weeklyAllocations: {
          create: validAllocations
        }
      },
      include: {
        weeklyAllocations: true
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
    const { weeklyAllocations, ...resourcePlanData } = req.body;
    
    // Validate required fields
    if (!resourcePlanData.role || resourcePlanData.role.trim() === '') {
      return res.status(400).json({ 
        error: 'Role is required and cannot be empty',
        details: 'Please provide a valid role name'
      });
    }
    
    // Update resource plan
    const resourcePlan = await prisma.resourcePlan.update({
      where: { id: parseInt(req.params.id) },
      data: resourcePlanData,
      include: {
        weeklyAllocations: true
      }
    });
    
    // Update weekly allocations if provided
    if (weeklyAllocations) {
      // Delete existing allocations
      await prisma.weeklyAllocation.deleteMany({
        where: { resourcePlanId: parseInt(req.params.id) }
      });
      
      // Create new allocations, filtering out any with id=0 and ensuring proper data structure
      const validAllocations = weeklyAllocations
        .filter((wa: any) => wa && typeof wa === 'object')
        .map((wa: any) => ({
          weekNumber: parseInt(wa.weekNumber) || 0,
          allocation: parseInt(wa.allocation) || 0,
          resourcePlanId: parseInt(req.params.id)
        }))
        .filter(wa => wa.weekNumber > 0); // Only create allocations with valid week numbers
      
      if (validAllocations.length > 0) {
        await prisma.weeklyAllocation.createMany({
          data: validAllocations
        });
      }
      
      // Fetch updated resource plan
      const updatedResourcePlan = await prisma.resourcePlan.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          weeklyAllocations: {
            orderBy: { weekNumber: 'asc' }
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

// Weekly Allocation endpoints
app.get('/api/resource-plans/:resourcePlanId/weekly-allocations', async (req, res) => {
  try {
    const weeklyAllocations = await prisma.weeklyAllocation.findMany({
      where: { resourcePlanId: parseInt(req.params.resourcePlanId) },
      orderBy: { weekNumber: 'asc' }
    });
    res.json(weeklyAllocations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weekly allocations' });
  }
});

app.post('/api/resource-plans/:resourcePlanId/weekly-allocations', async (req, res) => {
  try {
    const weeklyAllocation = await prisma.weeklyAllocation.create({
      data: {
        ...req.body,
        resourcePlanId: parseInt(req.params.resourcePlanId)
      }
    });
    res.json(weeklyAllocation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create weekly allocation' });
  }
});

app.put('/api/weekly-allocations/:id', async (req, res) => {
  try {
    const weeklyAllocation = await prisma.weeklyAllocation.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(weeklyAllocation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update weekly allocation' });
  }
});

app.delete('/api/weekly-allocations/:id', async (req, res) => {
  try {
    await prisma.weeklyAllocation.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Weekly allocation deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete weekly allocation' });
  }
});

// Serve React app for all non-API routes (must be last)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Initialize default project and start server
initializeDefaultProject().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api`);
  });
}).catch(console.error);
