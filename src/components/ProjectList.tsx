import React, { useState, useEffect, useMemo } from 'react';
import { api, Project } from '../services/api';
import { APP_DEFAULTS, SUPPORTED_CURRENCIES, LOCATIONS, exchangeRateForCurrency, setLiveExchangeRates } from '../config/defaults';
import { PHASE_COLORS } from '../utils/phases';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type StatusFilter = 'active' | 'archived' | 'all';
type SortKey = 'name' | 'createdAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

function defaultSortDir(key: SortKey): SortDir {
  return key === 'name' ? 'asc' : 'desc';
}

function deriveVisibleProjects(
  projects: Project[],
  statusFilter: StatusFilter,
  query: string,
  sortKey: SortKey,
  sortDir: SortDir,
): Project[] {
  const needle = query.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    if (statusFilter !== 'all' && project.status !== statusFilter) return false;
    if (!needle) return true;
    const name = project.name.toLowerCase();
    const description = (project.description ?? '').toLowerCase();
    return name.includes(needle) || description.includes(needle);
  });
  return filtered.slice().sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else {
      cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

interface ProjectListProps {
  onOpenProject: (projectId: number) => void;
  currentProjectId?: number | null;
  onProjectDeleted?: (deletedId: number) => void;
  onProjectUpdated?: (project: Project) => void;
}

export function ProjectList({
  onOpenProject,
  currentProjectId,
  onProjectDeleted,
  onProjectUpdated,
}: ProjectListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [copyProject, setCopyProject] = useState<Project | null>(null);
  const [copyName, setCopyName] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('New project');
  const [createDescription, setCreateDescription] = useState('');
  const [createPlanningMode, setCreatePlanningMode] = useState<'weekly' | 'monthly'>(APP_DEFAULTS.planningMode);
  const [createDaysInFTE, setCreateDaysInFTE] = useState(APP_DEFAULTS.daysInFTE);
  const [createCurrency, setCreateCurrency] = useState(APP_DEFAULTS.clientCurrency);
  const [createMargin, setCreateMargin] = useState(APP_DEFAULTS.defaultMargin);
  const [createDefaultLocation, setCreateDefaultLocation] = useState(APP_DEFAULTS.defaultLocation);
  const [createDurationCount, setCreateDurationCount] = useState(APP_DEFAULTS.durationPeriods);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const visibleProjects = useMemo(
    () => deriveVisibleProjects(projects, statusFilter, query, sortKey, sortDir),
    [projects, statusFilter, query, sortKey, sortDir],
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(defaultSortDir(key));
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!showCreateDialog) return;
    let cancelled = false;
    api.getExchangeRates()
      .then((data) => {
        if (!cancelled) setLiveExchangeRates(data.rates);
      })
      .catch(() => {
        // Leave overlay unset so create uses the static table.
      });
    return () => {
      cancelled = true;
    };
  }, [showCreateDialog]);

  const handleCreateProject = async () => {
    try {
      const created = await api.createProject({
        name: createName.trim() || 'New project',
        description: createDescription.trim() || undefined,
        daysInFTE: createDaysInFTE,
        clientCurrency: createCurrency,
        exchangeRate: exchangeRateForCurrency(createCurrency),
        defaultMargin: createMargin,
        planningMode: createPlanningMode,
        defaultLocation: createDefaultLocation,
        phases: JSON.stringify([
          {
            name: 'Phase 1',
            periodCount: createDurationCount,
            color: PHASE_COLORS[0],
          },
        ]),
      });
      setProjects((prev) => [...prev, created]);
      setShowCreateDialog(false);
      setCreateName('New project');
      setCreateDescription('');
      setCreatePlanningMode(APP_DEFAULTS.planningMode);
      setCreateDaysInFTE(APP_DEFAULTS.daysInFTE);
      setCreateCurrency(APP_DEFAULTS.clientCurrency);
      setCreateMargin(APP_DEFAULTS.defaultMargin);
      setCreateDefaultLocation(APP_DEFAULTS.defaultLocation);
      setCreateDurationCount(APP_DEFAULTS.durationPeriods);
      onOpenProject(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? This will remove all its resource plans, resource list, and rate cards.`)) {
      return;
    }
    try {
      await api.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      onProjectDeleted?.(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const openCopy = (project: Project) => {
    setCopyProject(project);
    setCopyName(`${project.name} (Copy)`);
  };

  const handleConfirmCopy = async () => {
    if (!copyProject) return;
    try {
      const created = await api.copyProject(copyProject.id, copyName.trim() || undefined);
      setProjects((prev) => [...prev, created]);
      setCopyProject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy project');
    }
  };

  const openEdit = (project: Project) => {
    setEditProject(project);
    setEditName(project.name);
    setEditDescription(project.description ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editProject) return;
    try {
      const updated = await api.updateProject(editProject.id, {
        name: editName,
        description: editDescription || undefined,
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editProject.id ? { ...p, ...updated } : p
        )
      );
      setEditProject(null);
      onProjectUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    }
  };

  const handleSetStatus = async (project: Project, status: 'active' | 'archived') => {
    try {
      const updated = await api.updateProject(project.id, { status });
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, ...updated } : p))
      );
      onProjectUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    }
  };

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading projects…</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="text-red-800 font-medium">{error}</div>
        <Button variant="outline" size="sm" className="mt-2" onClick={fetchProjects}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button onClick={() => setShowCreateDialog(true)}>New project</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or description"
            aria-label="Search projects"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {projects.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No projects yet. Create one to get started.
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No projects match
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => handleSort('name')}
                >
                  Project name
                </button>
              </TableHead>
              <TableHead>Project description</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => handleSort('createdAt')}
                >
                  Created
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => handleSort('updatedAt')}
                >
                  Last updated
                </button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProjects.map((project) => (
              <TableRow
                key={project.id}
                className={currentProjectId === project.id ? 'bg-muted/50' : undefined}
              >
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {project.name}
                    {statusFilter === 'all' && project.status === 'archived' && (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {project.description ?? '—'}
                </TableCell>
                <TableCell className="capitalize">{project.planningMode || 'weekly'}</TableCell>
                <TableCell>{formatDate(project.createdAt)}</TableCell>
                <TableCell>{formatDate(project.updatedAt)}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onOpenProject(project.id)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openCopy(project)}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(project)}
                  >
                    Edit
                  </Button>
                  {project.status === 'archived' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetStatus(project, 'active')}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetStatus(project, 'archived')}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteProject(project)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!copyProject} onOpenChange={(open: boolean) => !open && setCopyProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">New project name</label>
              <Input
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                placeholder="Project name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyProject(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCopy} disabled={!copyName.trim()}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={(open: boolean) => !open && setShowCreateDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Planning mode / duration unit</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="planningMode"
                    value="weekly"
                    checked={createPlanningMode === 'weekly'}
                    onChange={() => setCreatePlanningMode('weekly')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Weekly</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="planningMode"
                    value="monthly"
                    checked={createPlanningMode === 'monthly'}
                    onChange={() => setCreatePlanningMode('monthly')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Monthly</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  Duration ({createPlanningMode === 'weekly' ? 'weeks' : 'months'})
                </label>
                <Input
                  type="number"
                  min={1}
                  max={104}
                  value={createDurationCount}
                  onChange={(e) => setCreateDurationCount(Math.max(1, Math.min(104, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Default location</label>
                <Select value={createDefaultLocation} onValueChange={setCreateDefaultLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc.slug} value={loc.slug}>
                        {loc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Days in FTE/Month</label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={createDaysInFTE}
                  onChange={(e) => setCreateDaysInFTE(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Client currency</label>
                <Select value={createCurrency} onValueChange={setCreateCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Default margin (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={createMargin}
                  onChange={(e) => setCreateMargin(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!createName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProject} onOpenChange={(open: boolean) => !open && setEditProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
