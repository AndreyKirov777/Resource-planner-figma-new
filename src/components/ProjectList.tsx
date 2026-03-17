import React, { useState, useEffect } from 'react';
import { api, Project } from '../services/api';
import { Button } from './ui/button';
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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

  const handleCreateProject = async () => {
    try {
      const created = await api.createProject({
        name: 'New project',
        description: '',
        daysInFTE: 20,
        clientCurrency: 'EUR',
        exchangeRate: 0.89,
      });
      setProjects((prev) => [...prev, created]);
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
        <Button onClick={handleCreateProject}>New project</Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No projects yet. Create one to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project name</TableHead>
              <TableHead>Project description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow
                key={project.id}
                className={currentProjectId === project.id ? 'bg-muted/50' : undefined}
              >
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="max-w-xs truncate">
                  {project.description ?? '—'}
                </TableCell>
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

      <Dialog open={!!copyProject} onOpenChange={(open) => !open && setCopyProject(null)}>
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

      <Dialog open={!!editProject} onOpenChange={(open) => !open && setEditProject(null)}>
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
