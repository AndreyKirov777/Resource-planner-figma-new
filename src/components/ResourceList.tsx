import React, { useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ResourceList as ResourceListType } from '../services/api';
import { LOCATIONS } from '../config/defaults';
import { LOCATION_LABELS, canonicalLocationLabel, locationAbbr } from '../utils/regions';

interface ResourceListProps {
  resourceLists: ResourceListType[];
  onResourceListsChange: (resources: ResourceListType[]) => void;
  onResourceListUpdate?: (id: number, data: Partial<ResourceListType>) => void;
  onAddResourceList: (resource: Partial<ResourceListType>) => void;
  onDeleteResourceList: (id: number) => void;
  onClearAllResourceLists?: () => void;
}

// Custom cell renderer component for the Actions column
const ActionsCellRenderer = (props: any) => {
  const deleteResource = () => {
    props.context?.deleteResource?.(props.data.id);
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        onClick={deleteResource}
        className="bg-red-500 hover:bg-red-600 text-white border-none rounded cursor-pointer px-2 py-1 text-xs"
        title="Delete resource"
      >
        Delete
      </button>
    </div>
  );
};

export function ResourceList({ 
  resourceLists, 
  onResourceListsChange, 
  onResourceListUpdate,
  onAddResourceList,
  onDeleteResourceList,
  onClearAllResourceLists
}: ResourceListProps) {
  const [newRole, setNewRole] = useState('');
  const [newClientRole, setNewClientRole] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const deleteResource = (id: number) => {
    onDeleteResourceList(id);
  };

  const columnDefs = useMemo(() => {
    // Actions column - moved to first position
    const actionsColumn: ColDef<ResourceListType> = {
      headerName: '',
      width: 80,
      cellRenderer: ActionsCellRenderer,
      sortable: false,
      filter: false
    };

    const otherColumns: ColDef<ResourceListType>[] = [
      {
        headerName: 'Rate card role',
        field: 'role',
        width: 200,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, role: params.newValue }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Client Role',
        field: 'clientRole',
        width: 200,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, clientRole: params.newValue }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Name',
        field: 'name',
        width: 150,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, name: params.newValue }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Location',
        field: 'location',
        width: 110,
        editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: LOCATION_LABELS },
        valueFormatter: (params: any) => locationAbbr(params.value),
        tooltipValueGetter: (params: any) => canonicalLocationLabel(params.value),
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, location: canonicalLocationLabel(params.newValue) || undefined }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Hourly cost',
        field: 'intRate',
        width: 150,
        editable: true,
        valueFormatter: (params: any) => `$${params.value.toFixed(2)}`,
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, intRate: parseFloat(params.newValue) || 0 }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      },

      {
        headerName: 'Daily cost',
        width: 140,
        valueGetter: (params: any) => params.data.intRate * 8,
        valueFormatter: (params: any) => `$${params.value.toFixed(2)}`
      },
      {
        headerName: 'Description',
        field: 'description',
        width: 360,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedResources = resourceLists.map(resource =>
            resource.id === params.data.id
              ? { ...resource, description: params.newValue }
              : resource
          );
          onResourceListsChange(updatedResources);
          const updatedRow = updatedResources.find(r => r.id === params.data.id);
          if (updatedRow?.id != null && onResourceListUpdate) onResourceListUpdate(updatedRow.id, updatedRow);
        }
      }
    ];

    return [actionsColumn, ...otherColumns];
  }, [resourceLists, onResourceListsChange, onResourceListUpdate, deleteResource]);

  const addResource = () => {
    if (!newRole.trim() || !newRate.trim()) return;
    
    const newResource: Partial<ResourceListType> = {
      role: newRole.trim(),
      clientRole: newClientRole.trim() || undefined,
      name: newName.trim() || undefined,
      intRate: parseFloat(newRate) || 0,
      location: newLocation || undefined,
      description: newDescription.trim() || undefined
    };
    
    onAddResourceList(newResource);
    setNewRole('');
    setNewClientRole('');
    setNewName('');
    setNewRate('');
    setNewDescription('');
    setNewLocation('');
  };

  const totalResources = resourceLists.length;
  const averageRate = resourceLists.length > 0 
    ? resourceLists.reduce((sum, r) => sum + r.intRate, 0) / resourceLists.length 
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add custom resource</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-40">
              <Label htmlFor="newRole" className="text-sm font-medium">Rate card role</Label>
              <Input
                id="newRole"
                placeholder="e.g. Senior Developer"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1 min-w-40">
              <Label htmlFor="newClientRole" className="text-sm font-medium">Client Role</Label>
              <Input
                id="newClientRole"
                placeholder="e.g. Senior Developer"
                value={newClientRole}
                onChange={(e) => setNewClientRole(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1 min-w-32">
              <Label htmlFor="newName" className="text-sm font-medium">Name</Label>
              <Input
                id="newName"
                placeholder="e.g. John Smith"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-24">
              <Label htmlFor="newRate" className="text-sm font-medium">Rate ($/h)</Label>
              <Input
                id="newRate"
                type="number"
                placeholder="25.00"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-36">
              <Label htmlFor="newLocation" className="text-sm font-medium">Location</Label>
              <Select value={newLocation} onValueChange={setNewLocation}>
                <SelectTrigger id="newLocation" className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((loc) => (
                    <SelectItem key={loc.slug} value={loc.label}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-40">
              <Label htmlFor="newDescription" className="text-sm font-medium">Description</Label>
              <Input
                id="newDescription"
                placeholder="Brief description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button 
              onClick={addResource} 
              disabled={!newRole.trim() || !newRate.trim()}
              className="mb-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Resource List</CardTitle>
          {onClearAllResourceLists && resourceLists.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={onClearAllResourceLists}
            >
              Clear all
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="ag-theme-alpine" style={{ height: '500px', width: '100%' }}>
            <AgGridReact
              theme="legacy"
              context={{ deleteResource }}
              rowData={resourceLists}
              columnDefs={columnDefs}
              defaultColDef={{
                sortable: true,
                filter: true,
                resizable: true
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Total Resources</Label>
              <div className="text-lg">{totalResources}</div>
            </div>
            <div>
              <Label>Average Rate</Label>
              <div className="text-lg">${averageRate.toFixed(2)}/h</div>
            </div>
            <div>
              <Label>Average Daily Rate</Label>
              <div className="text-lg">${(averageRate * 8).toFixed(2)}/day</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}