import { API_UNREACHABLE_MESSAGE, isNetworkFetchError } from '../utils/apiErrors';

// Use relative URL so Vite proxies /api to backend in dev, same server in production
const API_BASE_URL = '/api';

// Types
export type GeneratePlanRegion =
  | 'ukraine' | 'easternEurope' | 'asiaGE' | 'asiaARMKZ'
  | 'latam' | 'mexico' | 'india' | 'newYork' | 'london';

export interface GeneratePlanResourcePlan {
  role: string;
  clientRole: string | null;
  name: string | null;
  intHourlyRate: number;
  clientHourlyRate: number;
  displayOrder: number;
  rationale?: string;
  allocations: Array<{ periodNumber: number; allocation: number }>;
}

export interface GeneratePlanResourceList {
  role: string;
  clientRole: string | null;
  name: string | null;
  intRate: number;
  location: string | null;
  description?: string | null;
}

export interface GeneratePlanDraft {
  resourcePlans: GeneratePlanResourcePlan[];
  resourceLists: GeneratePlanResourceList[];
  /** Delivery region used for rate lookup (echoed from the generate request). */
  region?: GeneratePlanRegion;
  phases?: Array<{ name: string; periodCount: number }>;
}

export interface GeneratePlanResponse {
  draft: GeneratePlanDraft;
  warnings: string[];
}

export interface GeneratePlanRequest {
  mode: 'current' | 'new';
  projectId?: number;
  description: string;
  region: GeneratePlanRegion;
  applyProposedPhases?: boolean;
}

export interface Phase {
  name: string;
  periodCount?: number;
  weekCount?: number; // backward compat for import
  color?: string;
}

export interface ExchangeRates {
  rates: { USD: number; EUR: number; GBP: number };
  date?: string;
  source: 'frankfurter' | 'cache' | 'fallback';
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  daysInFTE: number;
  clientCurrency: string;
  exchangeRate: number;
  defaultMargin?: number;
  /** Deal investment / discount amount in client currency */
  investment?: number;
  planningMode: string; // 'weekly' | 'monthly'
  defaultLocation?: string;
  phases?: string;
  /** Anchors period 1 for the roadmap's calendar labels; null = ordinals only. */
  startDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RateCard {
  id: number;
  role: string;
  namingInPM: string;
  discipline: string;
  description?: string;
  ukraine: number;
  easternEurope: number;
  asiaGE: number;
  asiaARMKZ: number;
  latam: number;
  mexico: number;
  india: number;
  newYork: number;
  london: number;
  createdAt: string;
  updatedAt: string;
}

// Metadata about the last global rate card import.
export interface RateCardImportMeta {
  fileName: string | null;
  importedAt: string | null;
}

export interface ResourceList {
  id: number;
  role: string;
  clientRole?: string;
  name?: string;
  intRate: number;
  location?: string;
  description?: string;
  projectId: number;
  createdAt: string;
  updatedAt: string;
}

export interface Allocation {
  id: number;
  periodNumber: number;
  allocation: number;
  resourcePlanId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourcePlan {
  id: number;
  role: string;
  clientRole?: string;
  name?: string;
  intHourlyRate: number;
  clientHourlyRate: number;
  displayOrder: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  allocations: Allocation[];
}

export interface WbsEstimate {
  id: number;
  discipline: string;
  role: string;
  hours: number;
  wbsItemId: number;
  createdAt: string;
  updatedAt: string;
}

export interface WbsItem {
  id: number;
  name: string;
  parentId: number | null;
  phaseName: string | null; // null = Unassigned
  displayOrder: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  estimates: WbsEstimate[];
}

// Roadmap (Slice A: CAP-1..7, 11, 12) — see _bmad-output/specs/spec-roadmap/data-model.md

export type RoadmapItemKind = 'bar' | 'milestone' | 'spread';

export interface RoadmapLane {
  id: number;
  name: string;
  displayOrder: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapItem {
  id: number;
  name: string;
  kind: RoadmapItemKind;
  startPeriod: number;
  /** >= 1 for a bar; 0 for a milestone. */
  periodCount: number;
  displayOrder: number;
  /** Planner-picked fill from ROADMAP_ITEM_COLORS; default `#5D6E85`. */
  color: string;
  laneId: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  /** WBS nodes DIRECTLY linked to this item (not the inherited subtree). */
  wbsItemIds: number[];
}

export interface RoadmapLaneWithItems extends RoadmapLane {
  items: RoadmapItem[];
}

export interface RoadmapPayload {
  lanes: RoadmapLaneWithItems[];
}

export interface BootstrapRoadmapItem {
  name: string;
  startPeriod: number;
  periodCount: number;
  wbsItemIds: number[];
}

export interface BootstrapRoadmapLane {
  name: string;
  items: BootstrapRoadmapItem[];
}

export interface BootstrapRoadmapPayload {
  lanes: BootstrapRoadmapLane[];
}

// Vertical drag: reorder within a lane, cross-lane move, and lane reorder —
// see spec-roadmap-vertical-drag.md. One atomic PATCH; `startPeriod`/
// `periodCount` are only ever present on a bar whose window also moved.
export interface RoadmapReorderPayload {
  lanes?: { id: number; displayOrder: number }[];
  items?: { id: number; laneId: number; displayOrder: number; startPeriod?: number; periodCount?: number }[];
}

function pickDefined<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  return Object.fromEntries(
    keys.filter((key) => obj[key] !== undefined).map((key) => [key, obj[key]])
  ) as Partial<T>;
}

function toResourceListUpdatePayload(data: Partial<ResourceList>) {
  return pickDefined(data, ['role', 'clientRole', 'name', 'intRate', 'location', 'description']);
}

function toRateCardUpdatePayload(data: Partial<RateCard>) {
  return pickDefined(data, [
    'role', 'namingInPM', 'discipline', 'description',
    'ukraine', 'easternEurope', 'asiaGE', 'asiaARMKZ',
    'latam', 'mexico', 'india', 'newYork', 'london',
  ]);
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (isNetworkFetchError(err)) {
      throw new Error(API_UNREACHABLE_MESSAGE);
    }
    throw err;
  }
}

async function throwIfNotOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = (await response.json().catch(() => ({}))) as { error?: string; details?: unknown };
  const details =
    body.details == null
      ? ''
      : `: ${typeof body.details === 'string' ? body.details : JSON.stringify(body.details)}`;
  throw new Error(`${body.error ?? fallback}${details}`);
}

// API functions
export const api = {
  // Project endpoints
  async getProjects(): Promise<Project[]> {
    const response = await apiFetch(`${API_BASE_URL}/projects`);
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  },

  async getProject(id: number): Promise<Project & {
    resourceLists: ResourceList[];
    resourcePlans: ResourcePlan[];
  }> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${id}`);
    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  },

  async createProject(data: Partial<Project>): Promise<Project> {
    const response = await apiFetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  },

  async updateProject(id: number, data: Partial<Project>): Promise<Project> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update project');
    return response.json();
  },

  async deleteProject(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete project');
  },

  async copyProject(id: number, name?: string): Promise<Project> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { name } : {}),
    });
    if (!response.ok) throw new Error('Failed to copy project');
    return response.json();
  },

  async exportProject(id: number): Promise<any> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${id}/export`);
    if (!response.ok) throw new Error('Failed to export project');
    return response.json();
  },

  async importProject(payload: any): Promise<{ message: string; projectId: number }> {
    const response = await apiFetch(`${API_BASE_URL}/projects/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to import project');
    return response.json();
  },

  async convertPlanningMode(projectId: number, targetMode: 'weekly' | 'monthly'): Promise<Project & {
    resourceLists: ResourceList[];
    resourcePlans: ResourcePlan[];
  }> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/convert-planning-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetMode }),
    });
    if (!response.ok) throw new Error('Failed to convert planning mode');
    return response.json();
  },

  // Rate Card endpoints (global: a single shared set common to all projects)
  async getRateCards(): Promise<RateCard[]> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards`);
    if (!response.ok) throw new Error('Failed to fetch rate cards');
    return response.json();
  },

  async getRateCardMeta(): Promise<RateCardImportMeta> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards/meta`);
    if (!response.ok) throw new Error('Failed to fetch rate card import metadata');
    return response.json();
  },

  async getExchangeRates(): Promise<ExchangeRates> {
    const response = await apiFetch(`${API_BASE_URL}/exchange-rates`);
    if (!response.ok) throw new Error('Failed to fetch exchange rates');
    return response.json();
  },

  async createRateCard(data: Partial<RateCard>): Promise<RateCard> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create rate card: ${errorData.details || errorData.error || response.statusText}`);
    }
    return response.json();
  },

  async createRateCardsBulk(data: Partial<RateCard>[], fileName?: string): Promise<{ message: string; count: number }> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rateCards: data, fileName }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create bulk rate cards: ${errorData.details || errorData.error || response.statusText}`);
    }
    return response.json();
  },

  async updateRateCard(id: number, data: Partial<RateCard>): Promise<RateCard> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRateCardUpdatePayload(data)),
    });
    if (!response.ok) throw new Error('Failed to update rate card');
    return response.json();
  },

  async deleteRateCard(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete rate card');
  },

  async deleteAllRateCards(): Promise<{ message: string }> {
    const response = await apiFetch(`${API_BASE_URL}/rate-cards`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete rate cards');
    return response.json();
  },

  // Resource List endpoints
  async getResourceLists(projectId: number): Promise<ResourceList[]> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/resource-lists`);
    if (!response.ok) throw new Error('Failed to fetch resource lists');
    return response.json();
  },

  async createResourceList(projectId: number, data: Partial<ResourceList>): Promise<ResourceList> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/resource-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toResourceListUpdatePayload(data)),
    });
    await throwIfNotOk(response, 'Failed to create resource list');
    return response.json();
  },

  async updateResourceList(id: number, data: Partial<ResourceList>): Promise<ResourceList> {
    const response = await apiFetch(`${API_BASE_URL}/resource-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toResourceListUpdatePayload(data)),
    });
    if (!response.ok) throw new Error('Failed to update resource list');
    return response.json();
  },

  async deleteResourceList(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/resource-lists/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete resource list');
  },

  // Resource Plan endpoints
  async getResourcePlans(projectId: number): Promise<ResourcePlan[]> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/resource-plans`);
    if (!response.ok) throw new Error('Failed to fetch resource plans');
    return response.json();
  },

  async createResourcePlan(projectId: number, data: Omit<Partial<ResourcePlan>, 'allocations'> & { allocations?: Partial<Allocation>[] }): Promise<ResourcePlan> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/resource-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await throwIfNotOk(response, 'Failed to create resource plan');
    return response.json();
  },

  async updateResourcePlan(id: number, data: Omit<Partial<ResourcePlan>, 'allocations'> & { allocations?: Partial<Allocation>[] }): Promise<ResourcePlan> {
    const response = await apiFetch(`${API_BASE_URL}/resource-plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.details || errorData.error || 'Failed to update resource plan';
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async deleteResourcePlan(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/resource-plans/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete resource plan');
  },

  async reorderResourcePlans(projectId: number, orderedIds: number[]): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/resource-plans/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
    if (!response.ok) throw new Error('Failed to reorder resource plans');
  },

  async generatePlan(data: GeneratePlanRequest, signal?: AbortSignal): Promise<GeneratePlanResponse> {
    const response = await apiFetch(`${API_BASE_URL}/projects/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(body.error ?? 'Request failed');
    }
    return response.json();
  },

  // Allocation endpoints
  async getAllocations(resourcePlanId: number): Promise<Allocation[]> {
    const response = await apiFetch(`${API_BASE_URL}/resource-plans/${resourcePlanId}/allocations`);
    if (!response.ok) throw new Error('Failed to fetch allocations');
    return response.json();
  },

  async createAllocation(resourcePlanId: number, data: Partial<Allocation>): Promise<Allocation> {
    const response = await apiFetch(`${API_BASE_URL}/resource-plans/${resourcePlanId}/allocations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create allocation');
    return response.json();
  },

  async updateAllocation(id: number, data: Partial<Allocation>): Promise<Allocation> {
    const response = await apiFetch(`${API_BASE_URL}/allocations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update allocation');
    return response.json();
  },

  async deleteAllocation(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/allocations/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete allocation');
  },

  // WBS endpoints
  async getWbsItems(projectId: number): Promise<WbsItem[]> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/wbs`);
    if (!response.ok) throw new Error('Failed to fetch WBS items');
    return response.json();
  },

  async createWbsItem(
    projectId: number,
    data: Omit<Partial<WbsItem>, 'estimates'> & { estimates?: Partial<WbsEstimate>[] }
  ): Promise<WbsItem> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/wbs-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to create WBS item');
    }
    return response.json();
  },

  async updateWbsItem(id: number, data: Partial<WbsItem>): Promise<WbsItem> {
    const response = await apiFetch(`${API_BASE_URL}/wbs-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickDefined(data, ['name', 'parentId', 'phaseName', 'displayOrder'])),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to update WBS item');
    }
    return response.json();
  },

  async deleteWbsItem(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/wbs-items/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete WBS item');
  },

  async replaceWbsEstimates(wbsItemId: number, estimates: Partial<WbsEstimate>[]): Promise<WbsEstimate[]> {
    const response = await apiFetch(`${API_BASE_URL}/wbs-items/${wbsItemId}/estimates`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(estimates),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to replace WBS estimates');
    }
    return response.json();
  },

  // Roadmap endpoints (Slice A)
  async getRoadmap(projectId: number): Promise<RoadmapPayload> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/roadmap`);
    if (!response.ok) throw new Error('Failed to fetch roadmap');
    return response.json();
  },

  async createRoadmapLane(projectId: number, name: string): Promise<RoadmapLaneWithItems> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/roadmap/lanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to create lane');
    }
    return response.json();
  },

  async updateRoadmapLane(id: number, data: { name?: string; displayOrder?: number }): Promise<RoadmapLane> {
    const response = await apiFetch(`${API_BASE_URL}/roadmap-lanes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickDefined(data, ['name', 'displayOrder'])),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to update lane');
    }
    return response.json();
  },

  async deleteRoadmapLane(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/roadmap-lanes/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete lane');
  },

  async createRoadmapItem(
    projectId: number,
    data: {
      laneId: number;
      name: string;
      kind?: RoadmapItemKind;
      startPeriod: number;
      periodCount: number;
      color?: string;
    }
  ): Promise<RoadmapItem> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/roadmap/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to create roadmap item');
    }
    return response.json();
  },

  async updateRoadmapItem(
    id: number,
    data: Partial<{
      name: string;
      laneId: number;
      kind: RoadmapItemKind;
      startPeriod: number;
      periodCount: number;
      displayOrder: number;
      color: string;
    }>
  ): Promise<RoadmapItem> {
    const response = await apiFetch(`${API_BASE_URL}/roadmap-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        pickDefined(data, ['name', 'laneId', 'kind', 'startPeriod', 'periodCount', 'displayOrder', 'color'])
      ),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to update roadmap item');
    }
    return response.json();
  },

  async deleteRoadmapItem(id: number): Promise<void> {
    const response = await apiFetch(`${API_BASE_URL}/roadmap-items/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete roadmap item');
  },

  async replaceRoadmapItemLinks(id: number, wbsItemIds: number[]): Promise<{ wbsItemIds: number[] }> {
    const response = await apiFetch(`${API_BASE_URL}/roadmap-items/${id}/links`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wbsItemIds }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to replace roadmap item links');
    }
    return response.json();
  },

  async setWbsRoadmapLink(
    wbsItemId: number,
    roadmapItemId: number | null
  ): Promise<{ wbsItemId: number; roadmapItemId: number | null }> {
    const response = await apiFetch(`${API_BASE_URL}/wbs-items/${wbsItemId}/roadmap-link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roadmapItemId }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to update WBS roadmap link');
    }
    return response.json();
  },

  async bootstrapRoadmap(projectId: number, payload: BootstrapRoadmapPayload): Promise<RoadmapPayload> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/roadmap/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to bootstrap roadmap');
    }
    return response.json();
  },

  async reorderRoadmap(projectId: number, payload: RoadmapReorderPayload): Promise<RoadmapPayload> {
    const response = await apiFetch(`${API_BASE_URL}/projects/${projectId}/roadmap/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Failed to reorder roadmap');
    }
    return response.json();
  },
};
