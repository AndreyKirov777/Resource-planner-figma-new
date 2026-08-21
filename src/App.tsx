import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ResourcePlan } from './components/ResourcePlan';
import { ResourceList } from './components/ResourceList';
import { RateCard } from './components/RateCard';
import { ProjectList } from './components/ProjectList';
import { Wbs } from './components/Wbs';
import { Roadmap } from './components/roadmap/Roadmap';
import {
  api,
  Project,
  Phase,
  Allocation,
  ResourceList as ResourceListType,
  RateCard as RateCardType,
  RateCardImportMeta,
  ResourcePlan as ResourcePlanType,
  WbsItem,
  WbsEstimate,
  GeneratePlanDraft,
  GeneratePlanResourceList,
  RoadmapLaneWithItems,
  RoadmapItem,
  RoadmapItemKind,
  BootstrapRoadmapPayload,
} from './services/api';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import * as ExcelJS from 'exceljs';
import { marginPct, estimatedEffortHours, totalInternalCost, totalClientCost, grossMarginPct, hoursPerPeriod } from './utils/calculations';
import { PHASE_COLORS } from './utils/phases';
import { getClientRoleFromRole } from './utils/clientRoleMapping';
import { canonicalLocationLabel, locationAbbr, resolveLocationLabel } from './utils/regions';
import { findResourceForPlan } from './utils/resourceMatching';
import { descendantIds } from './utils/wbsTree';
import { APP_DEFAULTS } from './config/defaults';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [editableProjectName, setEditableProjectName] = useState<string>('');
  const [editableProjectDescription, setEditableProjectDescription] = useState<string>('');
  const [resourceLists, setResourceLists] = useState<ResourceListType[]>([]);
  // Rate cards are global (shared across all projects), not project-scoped.
  const [rateCards, setRateCards] = useState<RateCardType[]>([]);
  const [rateCardMeta, setRateCardMeta] = useState<RateCardImportMeta | null>(null);
  const [resourcePlans, setResourcePlans] = useState<ResourcePlanType[]>([]);
  const [wbsItems, setWbsItems] = useState<WbsItem[]>([]);
  const [roadmapLanes, setRoadmapLanes] = useState<RoadmapLaneWithItems[]>([]);
  const [activeTab, setActiveTab] = useState('resource-plan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data — restore project from URL if available
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project');
    loadProjectData(projectIdFromUrl ? parseInt(projectIdFromUrl, 10) : undefined);
    loadGlobalRateCards();
  }, []);

  // Load the global rate card and its import metadata (once, not per project).
  const loadGlobalRateCards = async () => {
    try {
      const [rateCardsData, meta] = await Promise.all([
        api.getRateCards(),
        api.getRateCardMeta(),
      ]);
      setRateCards(rateCardsData);
      setRateCardMeta(meta);
    } catch (err) {
      console.error('Error loading global rate cards:', err);
    }
  };

  const loadProjectData = async (preferredProjectId?: number) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all projects (or create default)
      const projects = await api.getProjects();
      let project: Project;
      
      if (projects.length === 0) {
        // Create default project if none exists
        project = await api.createProject({
          name: 'Default Project',
          description: 'Default project for resource planning',
          daysInFTE: 20,
          clientCurrency: 'EUR',
          exchangeRate: 0.89
        });
      } else if (preferredProjectId) {
        // Load the preferred project if specified
        const found = projects.find(p => p.id === preferredProjectId);
        project = found ? found : projects[0];
      } else {
        project = projects[0];
      }
      
      setCurrentProject(project);
      setEditableProjectName(project.name || '');
      setEditableProjectDescription(project.description || '');
      setSearchParams({ project: String(project.id) }, { replace: true });

      // Load all related (project-scoped) data. Rate cards are global and
      // loaded separately via loadGlobalRateCards().
      const [resourceListsData, resourcePlansData, wbsItemsData, roadmapData] = await Promise.all([
        api.getResourceLists(project.id),
        api.getResourcePlans(project.id),
        api.getWbsItems(project.id),
        api.getRoadmap(project.id),
      ]);

      setResourceLists(resourceListsData);
      setResourcePlans(resourcePlansData);
      setWbsItems(wbsItemsData);
      setRoadmapLanes(roadmapData.lanes);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project data');
      console.error('Error loading project data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResourceListsChange = (updatedResourceLists: ResourceListType[]) => {
    setResourceLists(updatedResourceLists);
  };

  const handleResourceListUpdate = async (id: number, data: Partial<ResourceListType>) => {
    try {
      await api.updateResourceList(id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resource list');
      console.error('Error updating resource list:', err);
    }
  };

  const handleAddResourceList = async (newResource: Partial<ResourceListType>) => {
    if (!currentProject) return;
    
    try {
      const createdResource = await api.createResourceList(currentProject.id, newResource);
      setResourceLists(prev => [...prev, createdResource]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add resource');
      console.error('Error adding resource:', err);
    }
  };

  const handleDeleteResourceList = async (id: number) => {
    try {
      await api.deleteResourceList(id);
      setResourceLists(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resource');
      console.error('Error deleting resource:', err);
    }
  };

  const handleClearAllResourceLists = async () => {
    if (resourceLists.length === 0) return;
    try {
      for (const r of resourceLists) {
        await api.deleteResourceList(r.id);
      }
      setResourceLists([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear resource list');
      console.error('Error clearing resource list:', err);
    }
  };

  const handleRateCardsChange = (updatedRateCards: RateCardType[]) => {
    setRateCards(updatedRateCards);
  };

  const handleRateCardUpdate = async (id: number, data: Partial<RateCardType>) => {
    try {
      await api.updateRateCard(id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rate card');
      console.error('Error updating rate card:', err);
    }
  };

  const handleAddRateCard = async (newRateCard: Partial<RateCardType>) => {
    try {
      console.log('Adding rate card:', newRateCard);
      const createdRateCard = await api.createRateCard(newRateCard);
      setRateCards(prev => [...prev, createdRateCard]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add rate card';
      setError(errorMessage);
      console.error('Error adding rate card:', err);
      throw err; // Re-throw to be caught by the calling function
    }
  };

  const handleAddRateCardsBulk = async (newRateCards: Partial<RateCardType>[], fileName?: string) => {
    try {
      console.log('Adding bulk rate cards:', newRateCards);
      const result = await api.createRateCardsBulk(newRateCards, fileName);

      // Reload the global rate card + import metadata to reflect the new import
      const [updatedRateCards, meta] = await Promise.all([
        api.getRateCards(),
        api.getRateCardMeta(),
      ]);
      setRateCards(updatedRateCards);
      setRateCardMeta(meta);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add bulk rate cards';
      setError(errorMessage);
      console.error('Error adding bulk rate cards:', err);
      throw err; // Re-throw to be caught by the calling function
    }
  };

  const handleDeleteRateCard = async (id: number) => {
    try {
      await api.deleteRateCard(id);
      setRateCards(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rate card');
      console.error('Error deleting rate card:', err);
    }
  };

  const handleDeleteAllRateCards = async () => {
    try {
      const result = await api.deleteAllRateCards();
      setRateCards([]);
      setRateCardMeta({ fileName: null, importedAt: null });
      console.log(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rate cards');
      console.error('Error deleting rate cards:', err);
    }
  };

  const handleResourcePlansChange = async (updatedResourcePlans: ResourcePlanType[]) => {
    try {
      setResourcePlans(updatedResourcePlans);
      
      // Update the database for any changes (send only fields allowed by server resourcePlanUpdateSchema - strict)
      for (const resourcePlan of updatedResourcePlans) {
        if (resourcePlan.id) {
          try {
            await api.updateResourcePlan(resourcePlan.id, {
              role: resourcePlan.role,
              clientRole: resourcePlan.clientRole ?? undefined,
              name: resourcePlan.name ?? undefined,
              intHourlyRate: resourcePlan.intHourlyRate,
              clientHourlyRate: resourcePlan.clientHourlyRate,
              allocations: resourcePlan.allocations?.map(wa => ({
                periodNumber: wa.periodNumber,
                allocation: wa.allocation
              })),
            });
          } catch (updateErr) {
            console.error(`Failed to update resource plan ${resourcePlan.id}:`, updateErr);
            // Continue with other updates even if one fails
          }
        }
      }
      
      // Refresh the resource plans data to get updated IDs and ensure consistency
      if (currentProject) {
        try {
          const refreshedResourcePlans = await api.getResourcePlans(currentProject.id);
          setResourcePlans(refreshedResourcePlans);
        } catch (refreshErr) {
          console.error('Failed to refresh resource plans:', refreshErr);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update resource plans';
      setError(errorMessage);
      console.error('Error updating resource plans:', err);
    }
  };

  const handleAddResourcePlan = async (newResourcePlan: Omit<Partial<ResourcePlanType>, 'allocations'> & { allocations?: Partial<Allocation>[] }) => {
    if (!currentProject) return;
    
    try {
      const createdResourcePlan = await api.createResourcePlan(currentProject.id, newResourcePlan);
      setResourcePlans(prev => [...prev, createdResourcePlan]);
      
      // Refresh the resource plans data to ensure consistency
      try {
        const refreshedResourcePlans = await api.getResourcePlans(currentProject.id);
        setResourcePlans(refreshedResourcePlans);
      } catch (refreshErr) {
        console.error('Failed to refresh resource plans after creation:', refreshErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add resource plan');
      console.error('Error adding resource plan:', err);
    }
  };

  const handleDeleteResourcePlan = async (id: number) => {
    try {
      await api.deleteResourcePlan(id);
      setResourcePlans(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resource plan');
      console.error('Error deleting resource plan:', err);
    }
  };

  const handleReorderResourcePlans = async (orderedIds: number[]) => {
    if (!currentProject) return;
    const previous = resourcePlans;
    try {
      const reordered = orderedIds
        .map(id => resourcePlans.find(rp => rp.id === id))
        .filter((rp): rp is ResourcePlanType => rp !== undefined);
      setResourcePlans(reordered);
      await api.reorderResourcePlans(currentProject.id, orderedIds);
    } catch (err) {
      setResourcePlans(previous);
      setError(err instanceof Error ? err.message : 'Failed to reorder resource plans');
      console.error('Error reordering resource plans:', err);
    }
  };

  const handleClearAllResourcePlans = async () => {
    if (resourcePlans.length === 0) return;
    try {
      for (const plan of resourcePlans) {
        await api.deleteResourcePlan(plan.id);
      }
      setResourcePlans([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear resource plan');
      console.error('Error clearing resource plan:', err);
    }
  };

  // WBS handlers. Deliberately independent of resourceLists/resourcePlans/allocations —
  // the WBS tab is its own viewpoint; reconciling it with the resource plan is WBS-3.
  const handleAddWbsItem = async (
    data: Omit<Partial<WbsItem>, 'estimates'> & { estimates?: Partial<WbsEstimate>[] }
  ): Promise<WbsItem> => {
    if (!currentProject) throw new Error('No current project');
    try {
      const created = await api.createWbsItem(currentProject.id, data);
      setWbsItems(prev => [...prev, created]);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add WBS item');
      console.error('Error adding WBS item:', err);
      throw err;
    }
  };

  const handleUpdateWbsItem = async (id: number, data: Partial<WbsItem>): Promise<void> => {
    try {
      const updated = await api.updateWbsItem(id, data);
      setWbsItems(prev => prev.map(item => (item.id === id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update WBS item');
      console.error('Error updating WBS item:', err);
      throw err;
    }
  };

  const handleDeleteWbsItem = async (id: number): Promise<void> => {
    try {
      await api.deleteWbsItem(id);
      // The server cascades the delete through the whole subtree silently;
      // mirror that in local state so no orphaned rows remain.
      setWbsItems(prev => {
        const toRemove = new Set<number>([id, ...descendantIds(prev, id)]);
        return prev.filter(item => !toRemove.has(item.id));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete WBS item');
      console.error('Error deleting WBS item:', err);
      throw err;
    }
  };

  const handleReplaceWbsEstimates = async (
    wbsItemId: number,
    estimates: Partial<WbsEstimate>[]
  ): Promise<void> => {
    try {
      const updatedEstimates = await api.replaceWbsEstimates(wbsItemId, estimates);
      setWbsItems(prev =>
        prev.map(item => (item.id === wbsItemId ? { ...item, estimates: updatedEstimates } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update WBS estimates');
      console.error('Error updating WBS estimates:', err);
      throw err;
    }
  };

  // Roadmap handlers (Slice A). Deliberately independent of the WBS reconciliation
  // math (WBS-3) — the roadmap reads wbsItems but never mutates them, except via
  // the explicit link endpoint mirrored in handleSetWbsRoadmapLink.
  const refreshRoadmap = async (): Promise<void> => {
    if (!currentProject) return;
    try {
      const data = await api.getRoadmap(currentProject.id);
      setRoadmapLanes(data.lanes);
    } catch (err) {
      console.error('Error refreshing roadmap:', err);
    }
  };

  const handleAddRoadmapLane = async (name: string): Promise<void> => {
    if (!currentProject) return;
    try {
      const lane = await api.createRoadmapLane(currentProject.id, name);
      setRoadmapLanes(prev => [...prev, lane]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lane');
      console.error('Error adding roadmap lane:', err);
      throw err;
    }
  };

  const handleUpdateRoadmapLane = async (
    id: number,
    data: { name?: string; displayOrder?: number }
  ): Promise<void> => {
    const previous = roadmapLanes;
    setRoadmapLanes(prev => prev.map(l => (l.id === id ? { ...l, ...data } : l)));
    try {
      await api.updateRoadmapLane(id, data);
    } catch (err) {
      setRoadmapLanes(previous);
      console.error('Error updating roadmap lane:', err);
      throw err;
    }
  };

  const handleDeleteRoadmapLane = async (id: number): Promise<void> => {
    const previous = roadmapLanes;
    setRoadmapLanes(prev => prev.filter(l => l.id !== id));
    try {
      await api.deleteRoadmapLane(id);
    } catch (err) {
      setRoadmapLanes(previous);
      setError(err instanceof Error ? err.message : 'Failed to delete lane');
      console.error('Error deleting roadmap lane:', err);
      throw err;
    }
  };

  const handleAddRoadmapItem = async (
    laneId: number,
    data: { name: string; kind?: RoadmapItemKind; startPeriod: number; periodCount: number }
  ): Promise<RoadmapItem> => {
    if (!currentProject) throw new Error('No current project');
    const item = await api.createRoadmapItem(currentProject.id, { laneId, ...data });
    setRoadmapLanes(prev => prev.map(l => (l.id === laneId ? { ...l, items: [...l.items, item] } : l)));
    return item;
  };

  /** rows[i]'s items patched in place, or moved to a new lane when `patch.laneId` differs. */
  function patchRoadmapItemInLanes(
    lanes: RoadmapLaneWithItems[],
    id: number,
    patch: Partial<RoadmapItem>
  ): RoadmapLaneWithItems[] {
    let moving: RoadmapItem | null = null;
    const withoutItem = lanes.map(lane => {
      const idx = lane.items.findIndex(i => i.id === id);
      if (idx < 0) return lane;
      moving = { ...lane.items[idx], ...patch };
      return { ...lane, items: lane.items.filter(i => i.id !== id) };
    });
    if (moving === null) return lanes;
    const target = moving as RoadmapItem;
    return withoutItem.map(lane =>
      lane.id === target.laneId
        ? { ...lane, items: [...lane.items, target].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id) }
        : lane
    );
  }

  const handleUpdateRoadmapItem = async (
    id: number,
    data: Partial<{
      name: string;
      laneId: number;
      kind: RoadmapItemKind;
      startPeriod: number;
      periodCount: number;
      displayOrder: number;
    }>
  ): Promise<void> => {
    const previous = roadmapLanes;
    setRoadmapLanes(prev => patchRoadmapItemInLanes(prev, id, data));
    try {
      await api.updateRoadmapItem(id, data);
    } catch (err) {
      setRoadmapLanes(previous);
      throw err;
    }
  };

  const handleDeleteRoadmapItem = async (id: number): Promise<void> => {
    const previous = roadmapLanes;
    setRoadmapLanes(prev => prev.map(l => ({ ...l, items: l.items.filter(i => i.id !== id) })));
    try {
      await api.deleteRoadmapItem(id);
    } catch (err) {
      setRoadmapLanes(previous);
      setError(err instanceof Error ? err.message : 'Failed to delete roadmap item');
      console.error('Error deleting roadmap item:', err);
      throw err;
    }
  };

  const handleReplaceRoadmapItemLinks = async (itemId: number, wbsItemIds: number[]): Promise<void> => {
    try {
      await api.replaceRoadmapItemLinks(itemId, wbsItemIds);
      await refreshRoadmap();
    } catch (err) {
      console.error('Error updating roadmap scope:', err);
      throw err;
    }
  };

  const handleSetWbsRoadmapLink = async (wbsItemId: number, roadmapItemId: number | null): Promise<void> => {
    try {
      await api.setWbsRoadmapLink(wbsItemId, roadmapItemId);
      await refreshRoadmap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roadmap link');
      console.error('Error updating WBS roadmap link:', err);
      throw err;
    }
  };

  const handleBootstrapRoadmap = async (payload: BootstrapRoadmapPayload): Promise<void> => {
    if (!currentProject) return;
    try {
      const data = await api.bootstrapRoadmap(currentProject.id, payload);
      setRoadmapLanes(data.lanes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create roadmap');
      console.error('Error bootstrapping roadmap:', err);
      throw err;
    }
  };

  const handleSetProjectStartDate = async (startDate: string | null): Promise<void> => {
    await handleProjectSettingsChange({ startDate });
  };

  const handleApplyGeneratedPlan = async (draft: GeneratePlanDraft) => {
    if (!currentProject) return;

    try {
      if (draft.phases?.length) {
        const phasesPayload = draft.phases.map((p, idx) => ({
          name: p.name,
          periodCount: p.periodCount,
          color: PHASE_COLORS[idx % PHASE_COLORS.length],
        }));
        const updatedProject = await api.updateProject(currentProject.id, {
          phases: JSON.stringify(phasesPayload),
        });
        setCurrentProject(updatedProject);
      }

      const locationLabel = resolveLocationLabel(
        draft.region ?? currentProject.defaultLocation ?? APP_DEFAULTS.defaultLocation,
      );

      const listEntries: GeneratePlanResourceList[] =
        draft.resourceLists?.length
          ? draft.resourceLists
          : (() => {
              const seen = new Set<string>();
              const fallback: GeneratePlanResourceList[] = [];
              for (const plan of draft.resourcePlans) {
                if (seen.has(plan.role)) continue;
                seen.add(plan.role);
                fallback.push({
                  role: plan.role,
                  clientRole: getClientRoleFromRole(plan.role),
                  name: plan.name,
                  intRate: plan.intHourlyRate,
                  location: locationLabel,
                  description: plan.rationale ?? null,
                });
              }
              return fallback;
            })();

      for (const entry of [...resourceLists]) {
        await api.deleteResourceList(entry.id);
      }

      for (const entry of listEntries) {
        await api.createResourceList(currentProject.id, {
          role: entry.role,
          clientRole: entry.clientRole ?? undefined,
          name: entry.name ?? undefined,
          intRate: entry.intRate,
          location: entry.location || locationLabel,
          description: entry.description ?? undefined,
        });
      }

      const refreshedResourceLists = await api.getResourceLists(currentProject.id);
      setResourceLists(refreshedResourceLists);

      for (const plan of [...resourcePlans]) {
        await api.deleteResourcePlan(plan.id);
      }

      const sortedPlans = [...draft.resourcePlans].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      for (let i = 0; i < sortedPlans.length; i++) {
        const draftPlan = sortedPlans[i];
        await api.createResourcePlan(currentProject.id, {
          role: draftPlan.role,
          clientRole: draftPlan.clientRole ?? undefined,
          name: draftPlan.name ?? undefined,
          intHourlyRate: draftPlan.intHourlyRate,
          clientHourlyRate: draftPlan.clientHourlyRate,
          displayOrder: i,
          allocations: draftPlan.allocations.map((a) => ({
            periodNumber: a.periodNumber,
            allocation: a.allocation,
          })),
        });
      }

      const refreshedResourcePlans = await api.getResourcePlans(currentProject.id);
      setResourcePlans(refreshedResourcePlans);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply generated plan';
      setError(errorMessage);
      throw err;
    }
  };

  const handleConvertPlanningMode = async (targetMode: 'weekly' | 'monthly') => {
    if (!currentProject) return;
    try {
      const result = await api.convertPlanningMode(currentProject.id, targetMode);
      setCurrentProject(result);
      setResourcePlans(result.resourcePlans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert planning mode');
      console.error('Error converting planning mode:', err);
    }
  };

  const handleProjectSettingsChange = async (settings: Partial<Project>) => {
    if (!currentProject) return;
    
    try {
      const updatedProject = await api.updateProject(currentProject.id, settings);
      setCurrentProject(updatedProject);
      if (typeof settings.name !== 'undefined') {
        setEditableProjectName(updatedProject.name || '');
      }
      if (typeof settings.description !== 'undefined') {
        setEditableProjectDescription(updatedProject.description || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project settings');
      console.error('Error updating project settings:', err);
    }
  };

  const handleExportProject = async () => {
    if (!currentProject) return;
    try {
      const payload = await api.exportProject(currentProject.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${currentProject.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export project');
    }
  };

  const handleImportProject = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const json = JSON.parse(text);
        const result = await api.importProject(json);
        alert(`Import completed. New project ID: ${result.projectId}`);
        await loadProjectData(result.projectId);
        
        // Force recalculation of all calculated values by triggering a re-render
        // This ensures that all calculated fields are updated after import
        setTimeout(() => {
          // Force a state update to trigger recalculation
          setResourcePlans(prev => [...prev]);
        }, 100);
      };
      input.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import project');
    }
  };

  const handleExportToExcel = async () => {
    if (!currentProject || resourcePlans.length === 0) {
      alert('No planning data to export');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Resource Planning');

      // Parse phases (same fallback as ResourcePlan)
      let phases: Phase[] = [];
      if (currentProject.phases) {
        try {
          const parsed = JSON.parse(currentProject.phases) as Phase[];
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p) => p.name && (p.periodCount ?? p.weekCount ?? 0) > 0)) {
            phases = parsed;
          }
        } catch {
          /* fall through */
        }
      }
      if (phases.length === 0) {
        const allPeriods = new Set<number>();
        resourcePlans.forEach((p) => p.allocations.forEach((wa) => allPeriods.add(wa.periodNumber)));
        const totalPeriods = allPeriods.size > 0 ? Math.max(...allPeriods) : 8;
        phases = [{ name: 'Phase 1', periodCount: totalPeriods }];
      }

      const planMode = (currentProject.planningMode || 'weekly') as 'weekly' | 'monthly';
      const isMonthlyExport = planMode === 'monthly';
      const periodLbl = isMonthlyExport ? 'Month' : 'Week';
      const hrsPerPrd = hoursPerPeriod(planMode, currentProject.daysInFTE);

      const totalWeeks = phases.reduce((s, p) => s + (p.periodCount ?? p.weekCount ?? 0), 0);
      const weekNumbers = Array.from({ length: totalWeeks }, (_, i) => i + 1);

      const currencySymbol = currentProject.clientCurrency === 'EUR' ? '€' :
        currentProject.clientCurrency === 'GBP' ? '£' : '$';

      // Lead columns 1..9 are Rate Card Role, Client Role, Name, Location, Internal Hourly,
      // Internal Daily, Client Hourly, Client Daily, Margin — the number formats below index
      // off these, so a new lead column means updating them together.
      const COL_INT_HOURLY = 5;
      const COL_INT_DAILY = 6;
      const COL_CLIENT_HOURLY = 7;
      const COL_CLIENT_DAILY = 8;
      const COL_MARGIN = 9;
      const firstWeekCol = 10;

      // Hex to Excel ARGB (e.g. #E3F2FD -> 'FFE3F2FD')
      const hexToArgb = (hex: string): string => {
        const h = hex.replace(/^#/, '');
        if (h.length === 6) return 'FF' + h.toUpperCase();
        if (h.length === 8) return h.toUpperCase();
        return 'FFE8E8E8';
      };

      const defaultPhaseColor = 'FFE8E8E8';

      // Row 1: phase group headers (merged), each phase with its own color
      const phaseHeaderRow = worksheet.addRow([]);
      let col = firstWeekCol;
      phases.forEach((phase) => {
        const pc = phase.periodCount ?? phase.weekCount ?? 0;
        const endCol = col + pc - 1;
        const phaseColorArgb = phase.color ? hexToArgb(phase.color) : defaultPhaseColor;
        if (pc === 1) {
          const cell = worksheet.getCell(1, col);
          cell.value = phase.name;
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: phaseColorArgb } };
        } else {
          worksheet.mergeCells(1, col, 1, endCol);
          const cell = worksheet.getCell(1, col);
          cell.value = phase.name;
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: phaseColorArgb } };
        }
        col = endCol + 1;
      });

      // Row 2: column headers
      const headers = [
        'Rate Card Role',
        'Client Role',
        'Name',
        'Location',
        'Internal Hourly Cost ($)',
        'Internal Daily Cost ($)',
        `Client Hourly Rate (${currencySymbol})`,
        `Client Daily Rate (${currencySymbol})`,
        'Margin (%)',
        ...weekNumbers.map((w) => `${periodLbl} ${w} (%)`),
        'Total Internal Cost ($)',
        `Total Price (${currencySymbol})`,
        'Estimated Efforts (h)',
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Data rows
      resourcePlans.forEach((plan) => {
        const intDailyRate = plan.intHourlyRate * 8;
        const clientDailyRate = plan.clientHourlyRate * 8;
        const margin = marginPct(plan.clientHourlyRate, plan.intHourlyRate, currentProject.exchangeRate) ?? 0;
        let totalWeeksEquivalent = 0;
        weekNumbers.forEach((weekNum) => {
          const allocation = plan.allocations.find((wa) => wa.periodNumber === weekNum);
          totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
        });
        const totalEfforts = estimatedEffortHours(totalWeeksEquivalent, hrsPerPrd);
        const totalIntCost = totalInternalCost(totalEfforts, plan.intHourlyRate);
        const totalPrice = totalClientCost(totalEfforts, plan.clientHourlyRate);
        const rowData = [
          plan.role || '',
          plan.clientRole || '',
          plan.name || '',
          canonicalLocationLabel(
            findResourceForPlan(plan.role, plan.intHourlyRate, resourceLists)?.location
          ),
          plan.intHourlyRate,
          intDailyRate,
          plan.clientHourlyRate,
          clientDailyRate,
          margin,
          ...weekNumbers.map((weekNum) => {
            const allocation = plan.allocations.find((wa) => wa.periodNumber === weekNum);
            return allocation?.allocation || 0;
          }),
          totalIntCost,
          totalPrice,
          totalEfforts,
        ];
        worksheet.addRow(rowData);
      });

      // Totals row
      const totalsRow = [
        'TOTALS',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ...weekNumbers.map(() => ''),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach((weekNum) => {
            const allocation = plan.allocations.find((wa) => wa.periodNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          const hours = estimatedEffortHours(totalWeeksEquivalent, hrsPerPrd);
          return sum + totalInternalCost(hours, plan.intHourlyRate);
        }, 0),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach((weekNum) => {
            const allocation = plan.allocations.find((wa) => wa.periodNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          const hours = estimatedEffortHours(totalWeeksEquivalent, hrsPerPrd);
          return sum + totalClientCost(hours, plan.clientHourlyRate);
        }, 0),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach((weekNum) => {
            const allocation = plan.allocations.find((wa) => wa.periodNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          return sum + estimatedEffortHours(totalWeeksEquivalent, hrsPerPrd);
        }, 0),
      ];
      const totalsRowIndex = worksheet.addRow(totalsRow);
      const totalsRowObj = worksheet.getRow(totalsRowIndex.number);
      totalsRowObj.font = { bold: true };
      totalsRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };

      // Phase Summary section
      worksheet.addRow([]);
      const phaseSummaryTitleRow = worksheet.addRow(['Phase Summary']);
      phaseSummaryTitleRow.font = { bold: true };
      const phaseSummaryHeaderRow = worksheet.addRow([
        'Phase',
        'Internal Cost ($)',
        `Price (${currencySymbol})`,
        'Estimated Efforts (h)',
        'Margin (%)',
      ]);
      phaseSummaryHeaderRow.font = { bold: true };
      phaseSummaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      const phaseSummaryClientFmt = currentProject.clientCurrency === 'EUR' ? '€#,##0.00'
        : currentProject.clientCurrency === 'GBP' ? '£#,##0.00' : '$#,##0.00';
      const phaseSummaryDataRowNumbers: number[] = [];
      let startWeek = 1;
      phases.forEach((phase) => {
        const endWeek = startWeek + (phase.periodCount ?? phase.weekCount ?? 0) - 1;
        let cost = 0, price = 0, efforts = 0;
        resourcePlans.forEach((plan) => {
          let weeksEquiv = 0;
          for (let w = startWeek; w <= endWeek; w++) {
            const alloc = plan.allocations.find((wa) => wa.periodNumber === w);
            weeksEquiv += (alloc?.allocation || 0) / 100;
          }
          const hours = estimatedEffortHours(weeksEquiv, hrsPerPrd);
          cost += totalInternalCost(hours, plan.intHourlyRate);
          price += totalClientCost(hours, plan.clientHourlyRate);
          efforts += hours;
        });
        const margin = grossMarginPct(cost, price, currentProject.exchangeRate);
        const phaseRow = worksheet.addRow([
          phase.name,
          Math.round(cost * 100) / 100,
          Math.round(price * 100) / 100,
          Math.round(efforts * 100) / 100,
          Math.round(margin * 100) / 100,
        ]);
        phaseSummaryDataRowNumbers.push(phaseRow.number);
        const r = worksheet.getRow(phaseRow.number);
        if (r.getCell(2).value != null) r.getCell(2).numFmt = '$#,##0.00';
        if (r.getCell(3).value != null) r.getCell(3).numFmt = phaseSummaryClientFmt;
        if (r.getCell(4).value != null) r.getCell(4).numFmt = '#,##0.00';
        if (r.getCell(5).value != null) r.getCell(5).numFmt = '0.00"%"';
        startWeek = endWeek + 1;
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        if (column.eachCell) {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) maxLength = columnLength;
          });
          column.width = Math.min(maxLength + 2, 20);
        }
      });

      const internalCostColumns = [COL_INT_HOURLY, COL_INT_DAILY, firstWeekCol + weekNumbers.length];
      internalCostColumns.forEach((colIndex) => {
        worksheet.getColumn(colIndex).numFmt = '$#,##0';
      });
      const clientCurrencyColumns = [COL_CLIENT_HOURLY, COL_CLIENT_DAILY, firstWeekCol + weekNumbers.length + 1];
      const clientCurrencyFormat = currentProject.clientCurrency === 'EUR' ? '€#,##0' :
        currentProject.clientCurrency === 'GBP' ? '£#,##0' : '$#,##0';
      clientCurrencyColumns.forEach((colIndex) => {
        worksheet.getColumn(colIndex).numFmt = clientCurrencyFormat;
      });
      const marginColumn = COL_MARGIN;
      const weekColumns = weekNumbers.map((_, index) => firstWeekCol + index);
      [marginColumn, ...weekColumns].forEach((colIndex) => {
        worksheet.getColumn(colIndex).numFmt = '0"%"';
      });
      worksheet.getColumn(firstWeekCol + weekNumbers.length + 2).numFmt = '0';

      // Re-apply Phase Summary cell formats (columns 4 & 5 are overwritten by column formats above)
      phaseSummaryDataRowNumbers.forEach((rowNum) => {
        const r = worksheet.getRow(rowNum);
        if (r.getCell(4).value != null) r.getCell(4).numFmt = '#,##0.00';
        if (r.getCell(5).value != null) r.getCell(5).numFmt = '0.00"%"';
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resource-planning-${currentProject.name || 'project'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export to Excel');
      console.error('Error exporting to Excel:', err);
    }
  };

  const handleExportToPNG = () => {
    if (!currentProject || resourcePlans.length === 0) {
      alert('No planning data to export');
      return;
    }

    // Parse phases
    let phases: Phase[] = [];
    if (currentProject.phases) {
      try {
        const parsed = JSON.parse(currentProject.phases) as Phase[];
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p) => p.name && (p.periodCount ?? p.weekCount ?? 0) > 0)) {
          phases = parsed;
        }
      } catch { /* fall through */ }
    }
    if (phases.length === 0) {
      const allPeriods = new Set<number>();
      resourcePlans.forEach((p) => p.allocations.forEach((wa) => allPeriods.add(wa.periodNumber)));
      const totalPeriods = allPeriods.size > 0 ? Math.max(...allPeriods) : 8;
      phases = [{ name: 'Phase 1', periodCount: totalPeriods }];
    }

    const pngPlanMode = (currentProject.planningMode || 'weekly') as 'weekly' | 'monthly';
    const hrsPerPrd = hoursPerPeriod(pngPlanMode, currentProject.daysInFTE);

    const totalWeekCount = phases.reduce((s, p) => s + (p.periodCount ?? p.weekCount ?? 0), 0);
    const weekNumbers = Array.from({ length: totalWeekCount }, (_, i) => i + 1);
    const currencySymbol = currentProject.clientCurrency === 'EUR' ? '€'
      : currentProject.clientCurrency === 'GBP' ? '£' : '$';

    // Per-row financial data
    const rows = resourcePlans.map((plan) => {
      let totalWeeksEquivalent = 0;
      weekNumbers.forEach((weekNum) => {
        const alloc = plan.allocations.find((wa) => wa.periodNumber === weekNum);
        totalWeeksEquivalent += (alloc?.allocation || 0) / 100;
      });
      const efforts = estimatedEffortHours(totalWeeksEquivalent, hrsPerPrd);
      const intCost = totalInternalCost(efforts, plan.intHourlyRate);
      const price = totalClientCost(efforts, plan.clientHourlyRate);
      const margin = marginPct(plan.clientHourlyRate, plan.intHourlyRate, currentProject.exchangeRate) ?? 0;
      return {
        role: plan.role || '',
        clientRole: plan.clientRole || '',
        name: plan.name || '',
        location: locationAbbr(
          findResourceForPlan(plan.role, plan.intHourlyRate, resourceLists)?.location
        ),
        intHourlyRate: plan.intHourlyRate,
        clientHourlyRate: plan.clientHourlyRate,
        margin,
        intCost,
        price,
        efforts,
      };
    });

    // Project-level totals
    const grandIntCost = rows.reduce((s, r) => s + r.intCost, 0);
    const grandPrice = rows.reduce((s, r) => s + r.price, 0);
    const grandEfforts = rows.reduce((s, r) => s + r.efforts, 0);
    const projectMargin = grossMarginPct(grandIntCost, grandPrice, currentProject.exchangeRate);
    const blendedHourlyRate = grandEfforts > 0 ? grandPrice / grandEfforts : 0;
    const blendedDailyRate = blendedHourlyRate * 8;

    // ── Canvas layout constants ──────────────────────────────────────────────
    const SCALE = 2; // retina / HiDPI
    const PAD = 32;
    const HEADER_H = 88;      // project title + date
    const COL_H = 38;         // column header row
    const ROW_H = 30;         // data row
    const SUMMARY_H = 240;    // financial summary card (3 rows of metrics)
    const GAP = 24;           // vertical gap between sections

    const columns = [
      { label: 'Rate Card Role',                    w: 160 },
      { label: 'Client Role',                       w: 130 },
      { label: 'Name',                              w: 130 },
      { label: 'Location',                          w: 70  },
      { label: 'Int. Hourly ($)',                   w: 110 },
      { label: `Client Hourly (${currencySymbol})`, w: 120 },
      { label: 'Margin %',                          w: 80  },
      { label: 'Total Int. Cost ($)',               w: 130 },
      { label: `Total Price (${currencySymbol})`,   w: 120 },
      { label: 'Est. Efforts (h)',                  w: 110 },
    ];

    const tableW = columns.reduce((s, c) => s + c.w, 0);
    const canvasW = Math.max(tableW + PAD * 2, 900);
    const tableH = COL_H + (rows.length + 1) * ROW_H; // +1 totals row
    const canvasH = HEADER_H + GAP + tableH + GAP + SUMMARY_H + PAD;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW * SCALE;
    canvas.height = canvasH * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);

    // ── Background ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── Project header ───────────────────────────────────────────────────────
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText(currentProject.name || 'Resource Plan', PAD, PAD + 26);
    ctx.fillStyle = '#64748b';
    ctx.font = '13px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText(
      `Generated: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
      PAD,
      PAD + 52,
    );

    // ── Table ────────────────────────────────────────────────────────────────
    const tableX = PAD;
    let tableY = HEADER_H + GAP;

    // Column header background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(tableX, tableY, tableW, COL_H);

    // Column header text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 10.5px system-ui, -apple-system, Arial, sans-serif';
    let cx = tableX;
    columns.forEach((col) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx + 1, tableY, col.w - 2, COL_H);
      ctx.clip();
      ctx.fillText(col.label, cx + 7, tableY + 24);
      ctx.restore();
      cx += col.w;
    });
    tableY += COL_H;

    // Data rows
    rows.forEach((row, i) => {
      const rowY = tableY + i * ROW_H;
      ctx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      ctx.fillRect(tableX, rowY, tableW, ROW_H);

      const values = [
        row.role,
        row.clientRole,
        row.name,
        row.location,
        `$${row.intHourlyRate.toFixed(0)}`,
        `${currencySymbol}${row.clientHourlyRate.toFixed(0)}`,
        `${row.margin.toFixed(1)}%`,
        `$${Math.round(row.intCost).toLocaleString()}`,
        `${currencySymbol}${Math.round(row.price).toLocaleString()}`,
        `${Math.round(row.efforts).toLocaleString()}h`,
      ];

      ctx.fillStyle = '#334155';
      ctx.font = '11px system-ui, -apple-system, Arial, sans-serif';
      let vx = tableX;
      values.forEach((val, idx) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(vx + 1, rowY, columns[idx].w - 2, ROW_H);
        ctx.clip();
        ctx.fillText(val, vx + 7, rowY + 19);
        ctx.restore();
        vx += columns[idx].w;
      });
    });

    // Totals row
    const totalsY = tableY + rows.length * ROW_H;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(tableX, totalsY, tableW, ROW_H);
    const totalsValues = [
      'TOTALS', '', '', '', '', '', '',
      `$${Math.round(grandIntCost).toLocaleString()}`,
      `${currencySymbol}${Math.round(grandPrice).toLocaleString()}`,
      `${Math.round(grandEfforts).toLocaleString()}h`,
    ];
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px system-ui, -apple-system, Arial, sans-serif';
    let tx = tableX;
    totalsValues.forEach((val, idx) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx + 1, totalsY, columns[idx].w - 2, ROW_H);
      ctx.clip();
      ctx.fillText(val, tx + 7, totalsY + 19);
      ctx.restore();
      tx += columns[idx].w;
    });

    // Grid lines (drawn over fills)
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.5;

    // Horizontal lines
    const gridTop = HEADER_H + GAP;
    const gridBottom = gridTop + COL_H + (rows.length + 1) * ROW_H;
    for (let i = 0; i <= rows.length + 2; i++) {
      const ly = gridTop + (i === 0 ? 0 : i === 1 ? COL_H : COL_H + (i - 1) * ROW_H);
      ctx.beginPath();
      ctx.moveTo(tableX, ly);
      ctx.lineTo(tableX + tableW, ly);
      ctx.stroke();
    }

    // Vertical lines
    let vlineX = tableX;
    columns.forEach((col) => {
      ctx.beginPath();
      ctx.moveTo(vlineX, gridTop);
      ctx.lineTo(vlineX, gridBottom);
      ctx.stroke();
      vlineX += col.w;
    });
    ctx.beginPath();
    ctx.moveTo(vlineX, gridTop);
    ctx.lineTo(vlineX, gridBottom);
    ctx.stroke();

    // ── Financial Summary card ───────────────────────────────────────────────
    const cardX = PAD;
    const cardY = HEADER_H + GAP + tableH + GAP;
    const cardW = canvasW - PAD * 2;
    const cardH = SUMMARY_H - GAP;
    const r = 10;

    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(cardX + r, cardY);
    ctx.lineTo(cardX + cardW - r, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + r, r);
    ctx.lineTo(cardX + cardW, cardY + cardH - r);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH, r);
    ctx.lineTo(cardX + r, cardY + cardH);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY + cardH - r, r);
    ctx.lineTo(cardX, cardY + r);
    ctx.arcTo(cardX, cardY, cardX + r, cardY, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px system-ui, -apple-system, Arial, sans-serif';
    ctx.fillText('Financial Summary', cardX + 16, cardY + 28);

    const totalPeriods = phases.reduce((s, p) => s + (p.periodCount ?? p.weekCount ?? 0), 0);
    const pngDurationLabel = pngPlanMode === 'monthly' ? 'Duration (months)' : 'Duration (weeks)';

    const metrics = [
      { label: 'Total Internal Cost',                      value: `$${Math.round(grandIntCost).toLocaleString()}` },
      { label: `Total Price (${currentProject.clientCurrency})`, value: `${currencySymbol}${Math.round(grandPrice).toLocaleString()}` },
      { label: 'Total Estimated Efforts',                  value: `${Math.round(grandEfforts).toLocaleString()} h` },
      { label: pngDurationLabel,                           value: `${totalPeriods}` },
      { label: 'Project Margin',                           value: `${projectMargin.toFixed(1)}%`, highlight: projectMargin > 0 },
      { label: `Blended Hourly Rate (${currentProject.clientCurrency})`, value: `${currencySymbol}${blendedHourlyRate.toFixed(0)}` },
      { label: `Blended Daily Rate (${currentProject.clientCurrency})`,  value: `${currencySymbol}${blendedDailyRate.toFixed(0)}` },
    ];

    const METRICS_COLS = 3;
    const metricW = cardW / METRICS_COLS;
    metrics.forEach((m, i) => {
      const col = i % METRICS_COLS;
      const row = Math.floor(i / METRICS_COLS);
      const mx = cardX + col * metricW + 16;
      const my = cardY + 48 + row * 60;

      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui, -apple-system, Arial, sans-serif';
      ctx.fillText(m.label, mx, my);

      ctx.fillStyle = m.highlight !== undefined
        ? (m.highlight ? '#15803d' : '#dc2626')
        : '#0f172a';
      ctx.font = 'bold 20px system-ui, -apple-system, Arial, sans-serif';
      ctx.fillText(m.value, mx, my + 32);
    });

    // ── Download ─────────────────────────────────────────────────────────────
    const link = document.createElement('a');
    link.download = `resource-planning-${currentProject.name || 'project'}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading project data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 font-medium">Error: {error}</div>
          <button 
            onClick={() => loadProjectData()}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="text-lg">No project found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="project-list">Project list</TabsTrigger>
          <TabsTrigger value="resource-plan">Resource Plan</TabsTrigger>
          <TabsTrigger value="resource-list">Resource List</TabsTrigger>
          <TabsTrigger value="rate-card">Rate Card</TabsTrigger>
          <TabsTrigger value="wbs">WBS</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="project-list" className="mt-6">
          <ProjectList
            onOpenProject={(id) => {
              loadProjectData(id);
              setActiveTab('resource-plan');
            }}
            currentProjectId={currentProject?.id}
            onProjectDeleted={() => loadProjectData()}
            onProjectUpdated={(project) => {
              if (currentProject?.id === project.id) {
                setCurrentProject(project);
                setEditableProjectName(project.name || '');
                setEditableProjectDescription(project.description || '');
              }
            }}
          />
        </TabsContent>
        
        <TabsContent value="resource-plan" className="mt-6">
          <ResourcePlan 
            key={currentProject?.id || 'default'}
            project={currentProject}
            resourceLists={resourceLists}
            resourcePlans={resourcePlans}
            onResourcePlansChange={handleResourcePlansChange}
            onAddResourcePlan={handleAddResourcePlan}
            onDeleteResourcePlan={handleDeleteResourcePlan}
            onReorderResourcePlans={handleReorderResourcePlans}
            onProjectSettingsChange={handleProjectSettingsChange}
            onExportProject={handleExportProject}
            onImportProject={handleImportProject}
            onExportToExcel={handleExportToExcel}
            onExportToPNG={handleExportToPNG}
            onClearAllResourcePlans={handleClearAllResourcePlans}
            onApplyGeneratedPlan={handleApplyGeneratedPlan}
            onConvertPlanningMode={handleConvertPlanningMode}
            projectName={editableProjectName}
            projectDescription={editableProjectDescription}
            onProjectNameChange={(name) => {
              setEditableProjectName(name);
              handleProjectSettingsChange({ name });
            }}
            onProjectDescriptionChange={(description) => {
              setEditableProjectDescription(description);
              handleProjectSettingsChange({ description });
            }}
            roadmapItems={roadmapLanes.flatMap(lane => lane.items)}
            onUpdateRoadmapItem={handleUpdateRoadmapItem}
          />
        </TabsContent>

        <TabsContent value="resource-list" className="mt-6">
<ResourceList
            resourceLists={resourceLists}
            onResourceListsChange={handleResourceListsChange}
            onResourceListUpdate={handleResourceListUpdate}
            onAddResourceList={handleAddResourceList}
            onDeleteResourceList={handleDeleteResourceList}
            onClearAllResourceLists={handleClearAllResourceLists}
          />
        </TabsContent>

        <TabsContent value="rate-card" className="mt-6">
          <RateCard
            rateCards={rateCards}
            importMeta={rateCardMeta}
            onRateCardsChange={handleRateCardsChange}
            onRateCardUpdate={handleRateCardUpdate}
            onAddRateCard={handleAddRateCard}
            onAddRateCardsBulk={handleAddRateCardsBulk}
            onDeleteRateCard={handleDeleteRateCard}
            onDeleteAllRateCards={handleDeleteAllRateCards}
            onAddResourceList={handleAddResourceList}
            defaultLocation={currentProject?.defaultLocation}
          />
        </TabsContent>

        <TabsContent value="wbs" className="mt-6">
          <Wbs
            key={currentProject?.id || 'default'}
            project={currentProject}
            resourcePlans={resourcePlans}
            resourceLists={resourceLists}
            rateCards={rateCards}
            wbsItems={wbsItems}
            onAddWbsItem={handleAddWbsItem}
            onUpdateWbsItem={handleUpdateWbsItem}
            onDeleteWbsItem={handleDeleteWbsItem}
            onReplaceWbsEstimates={handleReplaceWbsEstimates}
            roadmapLanes={roadmapLanes}
            onSetWbsRoadmapLink={handleSetWbsRoadmapLink}
          />
        </TabsContent>

        <TabsContent value="roadmap" className="mt-6">
          <Roadmap
            key={currentProject?.id || 'default'}
            project={currentProject}
            wbsItems={wbsItems}
            roadmapLanes={roadmapLanes}
            onAddLane={handleAddRoadmapLane}
            onUpdateLane={handleUpdateRoadmapLane}
            onDeleteLane={handleDeleteRoadmapLane}
            onAddItem={handleAddRoadmapItem}
            onUpdateItem={handleUpdateRoadmapItem}
            onDeleteItem={handleDeleteRoadmapItem}
            onReplaceItemLinks={handleReplaceRoadmapItemLinks}
            onBootstrap={handleBootstrapRoadmap}
            onSetStartDate={handleSetProjectStartDate}
          />
        </TabsContent>
      </Tabs>
      <Toaster />
    </div>
  );
}