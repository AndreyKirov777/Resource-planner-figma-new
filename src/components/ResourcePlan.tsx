import React, { useState, useMemo, useCallback, useEffect } from 'react';
import DataEditor, { GridCellKind, GridColumn, Item, EditableGridCell, HeaderClickedEventArgs, GridSelection } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Project, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType, WeeklyAllocation } from '../services/api';

interface ResourcePlanProps {
  project: Project;
  resourceLists: ResourceListType[];
  resourcePlans: ResourcePlanType[];
  onResourcePlansChange: (resourcePlans: ResourcePlanType[]) => void;
  onAddResourcePlan: (resourcePlan: Partial<ResourcePlanType>) => void;
  onDeleteResourcePlan: (id: number) => void;
  onProjectSettingsChange: (settings: Partial<Project>) => void;
  onExportProject?: () => void;
  onImportProject?: () => void;
  onExportToExcel?: () => void;
  projectName: string;
  projectDescription: string;
  onProjectNameChange: (name: string) => void;
  onProjectDescriptionChange: (description: string) => void;
}

// Compute a background color for a percentage value between 0 and 100.
// 0% -> white (#ffffff), 100% -> #63BE7B, values in-between are linearly interpolated.
// We do the blending in sRGB for simplicity and performance.
function getAllocationBgColor(percent: number): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (p <= 0) return '#ffffff';
  if (p >= 100) return '#63BE7B';
  const t = p / 100;
  const start = { r: 255, g: 255, b: 255 }; // white
  const end = { r: 0x63, g: 0xBE, b: 0x7B }; // #63BE7B
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Custom cell type for actions
interface ActionCell {
  kind: GridCellKind.Custom;
  data: { id: number; onRemove: () => void };
  allowOverlay: false;
  copyData: '';
}

// Custom cell type for role selection
interface RoleCell {
  kind: GridCellKind.Custom;
  data: { type: 'role-select'; value: string; options: string[] };
  allowOverlay: true;
  copyData: string;
  readonly?: boolean;
}

// Custom cell renderer for actions
const ActionCellRenderer = {
  isMatch: (cell: any): cell is ActionCell => cell.kind === GridCellKind.Custom && cell.data?.id !== undefined,
  draw: (args: any, cell: ActionCell) => {
    const { ctx, rect } = args;
    const { x, y, width, height } = rect;
    
    // Draw remove button
    const buttonSize = 20;
    const buttonX = x + (width - buttonSize) / 2;
    const buttonY = y + (height - buttonSize) / 2;
    
    // Button background
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(buttonX, buttonY, buttonSize, buttonSize);
    
    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', buttonX + buttonSize / 2, buttonY + buttonSize / 2);
    
    return true;
  },
  provideEditor: () => undefined
};

// Custom cell renderer for role selection with dropdown editor
const RoleCellRenderer = {
  isMatch: (cell: any): cell is RoleCell => cell.kind === GridCellKind.Custom && cell.data?.type === 'role-select',
  draw: (args: any, cell: RoleCell) => {
    const { ctx, rect, theme } = args;
    const { x, y, width, height } = rect;

    // background
    ctx.fillStyle = (args as any).cell?.themeOverride?.bgCell ?? theme.bgCell;
    ctx.fillRect(x, y, width, height);

    // text
    ctx.fillStyle = theme.textDark;
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = cell.data.value || 'Select role...';
    ctx.fillText(label, x + 8, y + height / 2);

    return true;
  },
  provideEditor: (cell: RoleCell) => {
    const Editor = (p: any) => {
      const { onChange, onFinishedEditing, value } = p;
      const current = (value as RoleCell).data.value;
      const options = (value as RoleCell).data.options;

      return (
        <div style={{ padding: 8, minWidth: 220 }}>
          <Select
            value={current || ''}
            onValueChange={(val) => {
              const updated: RoleCell = {
                ...(value as RoleCell),
                data: { ...((value as RoleCell).data), value: val },
              };
              onChange(updated);
              onFinishedEditing(updated);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt: string) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    };
    return {
      editor: Editor,
      disablePadding: true,
    } as any;
  },
};

export function ResourcePlan({ 
  project, 
  resourceLists, 
  resourcePlans, 
  onResourcePlansChange, 
  onAddResourcePlan,
  onDeleteResourcePlan,
  onProjectSettingsChange,
  onExportProject,
  onImportProject,
  onExportToExcel,
  projectName,
  projectDescription,
  onProjectNameChange,
  onProjectDescriptionChange
}: ResourcePlanProps) {
  const [weekNumbers, setWeekNumbers] = useState<number[]>([]);
  const [rolePicker, setRolePicker] = useState<{ open: boolean; row: number | null }>({ open: false, row: null });
  const [roleSelection, setRoleSelection] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<{ 
    show: boolean; 
    x: number; 
    y: number; 
    weekNumber: number | null; 
    colIndex: number | null; 
  }>({ show: false, x: 0, y: 0, weekNumber: null, colIndex: null });
  const [lastMousePosition, setLastMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [gridSelection, setGridSelection] = useState<GridSelection>();

  // Initialize week numbers from existing resource plans
  useEffect(() => {
    const allWeekNumbers = new Set<number>();
    resourcePlans.forEach(plan => {
      plan.weeklyAllocations.forEach(allocation => {
        allWeekNumbers.add(allocation.weekNumber);
      });
    });
    const sortedWeekNumbers = Array.from(allWeekNumbers).sort((a, b) => a - b);
    setWeekNumbers(sortedWeekNumbers.length > 0 ? sortedWeekNumbers : [1, 2, 3, 4, 5, 6, 7, 8]);
  }, [resourcePlans]);

  const currencySymbol = project.clientCurrency === 'EUR' ? '€' : 
                        project.clientCurrency === 'GBP' ? '£' : '$';

  // Calculation functions (reused from original)
  const calculateEstimatedEfforts = (plan: ResourcePlanType): number => {
    let totalWeeks = 0;
    weekNumbers.forEach(weekNum => {
      const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
      totalWeeks += (allocation?.allocation || 0) / 100;
    });
    return totalWeeks * 40; // 40 hours per week
  };

  const calculateTotalIntCost = (plan: ResourcePlanType): number => {
    const hours = calculateEstimatedEfforts(plan);
    return hours * plan.intHourlyRate;
  };

  const calculateTotalPrice = (plan: ResourcePlanType): number => {
    const hours = calculateEstimatedEfforts(plan);
    return hours * plan.clientHourlyRate;
  };

  const calculateMargin = (plan: ResourcePlanType): number | null => {
    const clientRate = plan.clientHourlyRate;
    const intRateInClientCurrency = plan.intHourlyRate * project.exchangeRate;
    
    if (!clientRate || clientRate <= 0 || !isFinite(clientRate)) {
      return null;
    }
    
    return ((clientRate - intRateInClientCurrency) / clientRate) * 100;
  };

  // Week management functions (reused from original)
  const insertWeekAfter = useCallback((afterWeekPosition: number) => {
    const newWeekNumbers = [...weekNumbers];
    newWeekNumbers.splice(afterWeekPosition, 0, 0);
    
    const renumberedWeeks = newWeekNumbers.map((_, index) => index + 1);
    
    const updatedResourcePlans = resourcePlans.map(plan => {
      const newWeeklyAllocations: WeeklyAllocation[] = [];
      
      renumberedWeeks.forEach((newWeekNum, index) => {
        if (index === afterWeekPosition) {
          newWeeklyAllocations.push({
            id: 0,
            weekNumber: newWeekNum,
            allocation: 0,
            resourcePlanId: plan.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as WeeklyAllocation);
        } else if (index < afterWeekPosition) {
          const oldWeekNum = weekNumbers[index];
          const existingAllocation = plan.weeklyAllocations.find(wa => wa.weekNumber === oldWeekNum);
          if (existingAllocation) {
            newWeeklyAllocations.push({
              ...existingAllocation,
              weekNumber: newWeekNum
            });
          }
        } else {
          const oldWeekNum = weekNumbers[index - 1];
          const existingAllocation = plan.weeklyAllocations.find(wa => wa.weekNumber === oldWeekNum);
          if (existingAllocation) {
            newWeeklyAllocations.push({
              ...existingAllocation,
              weekNumber: newWeekNum
            });
          }
        }
      });
      
      return {
        ...plan,
        weeklyAllocations: newWeeklyAllocations
      };
    });
    
    onResourcePlansChange(updatedResourcePlans);
    setWeekNumbers(renumberedWeeks);
  }, [weekNumbers, resourcePlans, onResourcePlansChange]);

  const removeSpecificWeek = useCallback((weekToRemove: number) => {
    if (weekNumbers.length <= 1) return;
    
    const weekPosition = weekNumbers.findIndex(week => week === weekToRemove);
    if (weekPosition === -1) return;
    
    const newWeekNumbers = weekNumbers.filter(week => week !== weekToRemove);
    const renumberedWeeks = newWeekNumbers.map((_, index) => index + 1);
    
    const updatedResourcePlans = resourcePlans.map(plan => {
      const newWeeklyAllocations: WeeklyAllocation[] = [];
      
      renumberedWeeks.forEach((newWeekNum, index) => {
        const originalIndex = index < weekPosition ? index : index + 1;
        const oldWeekNum = weekNumbers[originalIndex];
        const existingAllocation = plan.weeklyAllocations.find(wa => wa.weekNumber === oldWeekNum);
        if (existingAllocation) {
          newWeeklyAllocations.push({
            ...existingAllocation,
            weekNumber: newWeekNum
          });
        }
      });
      
      return {
        ...plan,
        weeklyAllocations: newWeeklyAllocations
      };
    });
    
    onResourcePlansChange(updatedResourcePlans);
    setWeekNumbers(renumberedWeeks);
  }, [weekNumbers, resourcePlans, onResourcePlansChange]);

  const removeRole = useCallback((roleId: number) => {
    onDeleteResourcePlan(roleId);
  }, [onDeleteResourcePlan]);

  // Glide Data Grid column definitions
  const columns = useMemo((): GridColumn[] => {
    const cols: GridColumn[] = [
      { title: '', width: 60 }, // Actions column
      { title: 'Rate card role', width: 200 },
      { title: 'Client Role', width: 150 },
      { title: 'Name', width: 150 },
      { title: 'Hourly cost', width: 90, group: 'Internal' },
      { title: 'Daily cost', width: 90, group: 'Internal' },
      { title: 'Hourly rate', width: 90, group: 'Client' },
      { title: 'Daily rate', width: 90, group: 'Client' },
      { title: 'Margin', width: 70 },
    ];

    // Add week columns with "Weeks" group header
    weekNumbers.forEach(weekNum => {
      cols.push({ title: `${weekNum}`, width: 50, group: 'Weeks' });
    });

    // Add calculation columns with "Total" group header
    cols.push(
      { title: 'Cost', width: 100, group: 'Total' },
      { title: 'Price', width: 100, group: 'Total' },
      { title: 'Efforts, h', width: 90, group: 'Total' }
    );

    return cols;
  }, [weekNumbers]);

  // Get cell content function for glide-data-grid
  const getCellContent = useCallback(([col, row]: Item) => {
    const plan = resourcePlans[row];
    if (!plan) {
      return {
        kind: GridCellKind.Text,
        data: '',
        allowOverlay: false,
        displayData: '',
      };
    }

    const colIndex = col;
    let colOffset = 0;

    // Actions column
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Custom,
        data: { id: plan.id, onRemove: () => removeRole(plan.id) },
        allowOverlay: false,
        copyData: '',
      } as ActionCell;
    }
    colOffset++;

    // Rate card role
    if (colIndex === colOffset) {
      const isValidRole = resourceLists.some(r => r.role === plan.role);
      return {
        kind: GridCellKind.Text,
        data: plan.role || '',
        allowOverlay: true,
        displayData: plan.role || 'Select role...',
        copyData: plan.role || '',
        readonly: false,
      };
    }
    colOffset++;

    // Client Role
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: plan.clientRole || '',
        allowOverlay: true,
        displayData: plan.clientRole || '',
        copyData: plan.clientRole || '',
        readonly: false,
      };
    }
    colOffset++;

    // Name
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: plan.name || '',
        allowOverlay: true,
        displayData: plan.name || '',
        copyData: plan.name || '',
        readonly: false,
      };
    }
    colOffset++;

    // Hourly cost
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Number,
        data: plan.intHourlyRate,
        allowOverlay: true,
        displayData: `$${Math.round(plan.intHourlyRate)}`,
        copyData: plan.intHourlyRate.toString(),
        readonly: false,
      };
    }
    colOffset++;

    // Daily cost
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: `$${Math.round(plan.intHourlyRate * 8)}`,
        allowOverlay: false,
        displayData: `$${Math.round(plan.intHourlyRate * 8)}`,
      };
    }
    colOffset++;

    // Hourly rate
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Number,
        data: plan.clientHourlyRate,
        allowOverlay: true,
        displayData: `${currencySymbol}${Math.round(plan.clientHourlyRate)}`,
        copyData: plan.clientHourlyRate.toString(),
        readonly: false,
      };
    }
    colOffset++;

    // Daily rate
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: `${currencySymbol}${Math.round(plan.clientHourlyRate * 8)}`,
        allowOverlay: false,
        displayData: `${currencySymbol}${Math.round(plan.clientHourlyRate * 8)}`,
      };
    }
    colOffset++;

    // Margin
    if (colIndex === colOffset) {
      const margin = calculateMargin(plan);
      return {
        kind: GridCellKind.Text,
        data: margin === null ? '-' : `${margin.toFixed(1)}%`,
        allowOverlay: false,
        displayData: margin === null ? '-' : `${margin.toFixed(1)}%`,
      };
    }
    colOffset++;

    // Week columns
    for (let i = 0; i < weekNumbers.length; i++) {
      if (colIndex === colOffset + i) {
        const weekNum = weekNumbers[i];
        const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
        const value = allocation?.allocation || 0;
        return {
          kind: GridCellKind.Number,
          data: value,
          allowOverlay: true,
          displayData: `${value}%`,
          copyData: value.toString(),
          readonly: false,
          themeOverride: {
            bgCell: getAllocationBgColor(value)
          }
        };
      }
    }
    colOffset += weekNumbers.length;

    // Total int cost
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: `$${Math.round(calculateTotalIntCost(plan))}`,
        allowOverlay: false,
        displayData: `$${Math.round(calculateTotalIntCost(plan))}`,
      };
    }
    colOffset++;

    // Total price
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: `${currencySymbol}${Math.round(calculateTotalPrice(plan))}`,
        allowOverlay: false,
        displayData: `${currencySymbol}${Math.round(calculateTotalPrice(plan))}`,
      };
    }
    colOffset++;

    // Efforts
    if (colIndex === colOffset) {
      return {
        kind: GridCellKind.Text,
        data: `${Math.round(calculateEstimatedEfforts(plan))}`,
        allowOverlay: false,
        displayData: `${Math.round(calculateEstimatedEfforts(plan))}`,
      };
    }

    return {
      kind: GridCellKind.Text,
      data: '',
      allowOverlay: false,
      displayData: '',
    };
  }, [resourcePlans, weekNumbers, currencySymbol, resourceLists, removeRole, project.exchangeRate]);

  // Handle cell editing
  const onCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const [col, row] = cell;
    const plan = resourcePlans[row];
    if (!plan) return;

    const colIndex = col;
    let colOffset = 0;

    // Skip actions column
    colOffset++;

    // Rate card role
    if (colIndex === colOffset) {
      if (newValue.kind === GridCellKind.Text) {
        const newRole = newValue.data;
        const selectedResource = resourceLists.find(r => r.role === newRole);
        
        if (selectedResource) {
          const defaultMargin = project.defaultMargin || 25.0;
          const marginDecimal = defaultMargin / 100;
          const clientHourlyRateInUSD = selectedResource.intRate / (1 - marginDecimal);
          const clientHourlyRate = clientHourlyRateInUSD * project.exchangeRate;
          
          const updatedResourcePlans = resourcePlans.map(p =>
            p.id === plan.id
              ? { 
                  ...p, 
                  role: newRole,
                  intHourlyRate: selectedResource.intRate,
                  clientHourlyRate: clientHourlyRate,
                  name: selectedResource.name || '',
                  clientRole: selectedResource.clientRole || ''
                }
              : p
          );
          onResourcePlansChange(updatedResourcePlans);
        } else {
          const updatedResourcePlans = resourcePlans.map(p =>
            p.id === plan.id ? { ...p, role: newRole } : p
          );
          onResourcePlansChange(updatedResourcePlans);
        }
      }
      return;
    }
    colOffset++;

    // Client Role
    if (colIndex === colOffset) {
      if (newValue.kind === GridCellKind.Text) {
        const updatedResourcePlans = resourcePlans.map(p =>
          p.id === plan.id ? { ...p, clientRole: newValue.data } : p
        );
        onResourcePlansChange(updatedResourcePlans);
      }
      return;
    }
    colOffset++;

    // Name
    if (colIndex === colOffset) {
      if (newValue.kind === GridCellKind.Text) {
        const updatedResourcePlans = resourcePlans.map(p =>
          p.id === plan.id ? { ...p, name: newValue.data } : p
        );
        onResourcePlansChange(updatedResourcePlans);
      }
      return;
    }
    colOffset++;

    // Hourly cost
    if (colIndex === colOffset) {
      if (newValue.kind === GridCellKind.Number) {
        const updatedResourcePlans = resourcePlans.map(p =>
          p.id === plan.id ? { ...p, intHourlyRate: newValue.data || 0 } : p
        );
        onResourcePlansChange(updatedResourcePlans);
      }
      return;
    }
    colOffset++;

    // Skip daily cost (calculated)
    colOffset++;

    // Hourly rate
    if (colIndex === colOffset) {
      if (newValue.kind === GridCellKind.Number) {
        const updatedResourcePlans = resourcePlans.map(p =>
          p.id === plan.id ? { ...p, clientHourlyRate: newValue.data || 0 } : p
        );
        onResourcePlansChange(updatedResourcePlans);
      }
      return;
    }
    colOffset++;

    // Skip daily rate and margin (calculated)
    colOffset += 2;

    // Week columns
    for (let i = 0; i < weekNumbers.length; i++) {
      if (colIndex === colOffset + i) {
        if (newValue.kind === GridCellKind.Number) {
          const weekNum = weekNumbers[i];
          const clampedValue = Math.max(0, Math.min(100, newValue.data || 0));
          
          const updatedResourcePlans = resourcePlans.map(p => {
            if (p.id !== plan.id) return p;
            
            const existing = p.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
            if (existing) {
              const updatedAllocations = p.weeklyAllocations.map(wa =>
                wa.weekNumber === weekNum
                  ? { ...wa, allocation: clampedValue, updatedAt: new Date().toISOString() }
                  : wa
              );
              return { ...p, weeklyAllocations: updatedAllocations };
            }
            
            const now = new Date().toISOString();
            const newAllocation = {
              id: 0,
              weekNumber: weekNum,
              allocation: clampedValue,
              resourcePlanId: p.id,
              createdAt: now,
              updatedAt: now,
            } as WeeklyAllocation;
            
            return { ...p, weeklyAllocations: [...p.weeklyAllocations, newAllocation] };
          });
          
          onResourcePlansChange(updatedResourcePlans);
        }
        return;
      }
    }
  }, [resourcePlans, weekNumbers, resourceLists, project.defaultMargin, project.exchangeRate, onResourcePlansChange]);

  // Handle batch cell edits (used by fill handle)
  const onCellsEdited = useCallback((newValues: readonly { location: Item; value: EditableGridCell }[]) => {
    const weekColumnStartIndex = 9; // Skip the first 9 columns
    
    // Group changes by resource plan
    const planUpdates = new Map<number, { plan: ResourcePlanType; updates: { weekNum: number; value: number }[] }>();
    
    newValues.forEach(({ location, value }) => {
      const [col, row] = location;
      const plan = resourcePlans[row];
      if (!plan) return;
      
      // Only process week columns
      if (col >= weekColumnStartIndex && col < weekColumnStartIndex + weekNumbers.length) {
        const weekColumnIndex = col - weekColumnStartIndex;
        const weekNum = weekNumbers[weekColumnIndex];
        
        if (value.kind === GridCellKind.Number) {
          const clampedValue = Math.max(0, Math.min(100, value.data || 0));
          
          if (!planUpdates.has(plan.id)) {
            planUpdates.set(plan.id, { plan, updates: [] });
          }
          
          planUpdates.get(plan.id)!.updates.push({ weekNum, value: clampedValue });
        }
      }
    });
    
    if (planUpdates.size > 0) {
      const updatedResourcePlans = resourcePlans.map(plan => {
        const planUpdate = planUpdates.get(plan.id);
        if (!planUpdate) return plan;
        
        let updatedAllocations = [...plan.weeklyAllocations];
        
        planUpdate.updates.forEach(({ weekNum, value }) => {
          const existingIndex = updatedAllocations.findIndex(wa => wa.weekNumber === weekNum);
          
          if (existingIndex >= 0) {
            updatedAllocations[existingIndex] = {
              ...updatedAllocations[existingIndex],
              allocation: value,
              updatedAt: new Date().toISOString()
            };
          } else {
            const now = new Date().toISOString();
            updatedAllocations.push({
              id: 0,
              weekNumber: weekNum,
              allocation: value,
              resourcePlanId: plan.id,
              createdAt: now,
              updatedAt: now,
            } as WeeklyAllocation);
          }
        });
        
        return { ...plan, weeklyAllocations: updatedAllocations };
      });
      
      onResourcePlansChange(updatedResourcePlans);
      return true; // Prevent individual onCellEdited calls
    }
    
    return false; // Allow individual onCellEdited calls for non-week columns
  }, [resourcePlans, weekNumbers, onResourcePlansChange]);

  // Helper functions (reused from original)
  const addWeek = useCallback(() => {
    const newWeekNumber = Math.max(...weekNumbers) + 1;
    setWeekNumbers(prev => [...prev, newWeekNumber]);
    
    const updatedResourcePlans = resourcePlans.map(plan => ({
      ...plan,
      weeklyAllocations: [
        ...plan.weeklyAllocations,
        {
          id: 0,
          weekNumber: newWeekNumber,
          allocation: 0,
          resourcePlanId: plan.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as WeeklyAllocation
      ]
    }));
    onResourcePlansChange(updatedResourcePlans);
  }, [weekNumbers, resourcePlans, onResourcePlansChange]);

  const addRole = useCallback(() => {
    const newResourcePlan: Partial<ResourcePlanType> = {
      role: '',
      clientRole: '',
      name: '',
      intHourlyRate: 0,
      clientHourlyRate: 0,
      weeklyAllocations: weekNumbers.map(weekNum => ({
        id: 0,
        weekNumber: weekNum,
        allocation: 0,
        resourcePlanId: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    };
    
    onAddResourcePlan(newResourcePlan);
  }, [weekNumbers, onAddResourcePlan]);

  const validateRole = useCallback((role: string): boolean => {
    return resourceLists.some(r => r.role === role);
  }, [resourceLists]);

  // Handle header context menu (right-click on column headers)
  const handleHeaderContextMenu = useCallback((colIndex: number, event: HeaderClickedEventArgs) => {
    // Prevent the default browser context menu
    if (event.preventDefault) {
      event.preventDefault();
    }
    
    // Calculate the week column offset - skip the first 9 columns (actions, role, client role, name, hourly cost, daily cost, hourly rate, daily rate, margin)
    const weekColumnStartIndex = 9;
    const weekColumnIndex = colIndex - weekColumnStartIndex;
    
    // Only show context menu for week columns
    if (weekColumnIndex >= 0 && weekColumnIndex < weekNumbers.length) {
      const weekNumber = weekNumbers[weekColumnIndex];
      
      // Use the actual mouse position captured by the mouse event listeners
      let absoluteX = lastMousePosition.x;
      let absoluteY = lastMousePosition.y;
      
      // Ensure context menu doesn't go off-screen
      const menuWidth = 160;
      const menuHeight = 140; // Increased for 3 menu items plus separator
      
      if (absoluteX + menuWidth > window.innerWidth) {
        absoluteX = window.innerWidth - menuWidth - 10;
      }
      if (absoluteY + menuHeight > window.innerHeight) {
        absoluteY = window.innerHeight - menuHeight - 10;
      }
      
      // Ensure minimum distance from edges
      const finalX = Math.max(10, Math.round(absoluteX));
      const finalY = Math.max(10, Math.round(absoluteY));
      
      setContextMenu({
        show: true,
        x: finalX,
        y: finalY,
        weekNumber,
        colIndex
      });
    }
  }, [weekNumbers, lastMousePosition]);

  // Close context menu when clicking elsewhere and prevent browser context menu
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, show: false }));
    };

    const handleMouseMove = (e: MouseEvent) => {
      setLastMousePosition({ x: e.clientX, y: e.clientY });
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Check if the right-click is on the DataEditor canvas
      const target = e.target as HTMLElement;
      const isOnCanvas = target.tagName === 'CANVAS' || target.closest('[data-testid="data-grid-canvas"]') || target.closest('.dvn-scroller');
      
      if (isOnCanvas) {
        e.preventDefault(); // Prevent browser context menu on the grid
        // Update mouse position for context menu positioning
        setLastMousePosition({ x: e.clientX, y: e.clientY });
      }
    };

    if (contextMenu.show) {
      document.addEventListener('click', handleClickOutside);
    }
    
    // Track mouse position and prevent browser context menu on the grid
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [contextMenu.show]);

  // Handle delete week from context menu
  const handleDeleteWeekFromContextMenu = useCallback(() => {
    if (contextMenu.weekNumber !== null) {
      removeSpecificWeek(contextMenu.weekNumber);
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.weekNumber, removeSpecificWeek]);

  // Handle insert week before from context menu
  const handleInsertWeekBefore = useCallback(() => {
    if (contextMenu.weekNumber !== null) {
      // Find the position of the current week and insert before it
      const weekPosition = weekNumbers.findIndex(week => week === contextMenu.weekNumber);
      if (weekPosition >= 0) {
        // insertWeekAfter actually inserts AT the position, so to insert BEFORE we use the current position
        insertWeekAfter(weekPosition);
      }
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.weekNumber, weekNumbers, insertWeekAfter]);

  // Handle insert week after from context menu
  const handleInsertWeekAfter = useCallback(() => {
    if (contextMenu.weekNumber !== null) {
      // Find the position of the current week and insert after it
      const weekPosition = weekNumbers.findIndex(week => week === contextMenu.weekNumber);
      if (weekPosition >= 0) {
        // insertWeekAfter actually inserts AT the position, so to insert AFTER we use position + 1
        insertWeekAfter(weekPosition + 1);
      }
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.weekNumber, weekNumbers, insertWeekAfter]);

  const totals = useMemo(() => {
    const totalIntCost = resourcePlans.reduce((sum, plan) => sum + calculateTotalIntCost(plan), 0);
    const totalPrice = resourcePlans.reduce((sum, plan) => sum + calculateTotalPrice(plan), 0);
    const totalEfforts = resourcePlans.reduce((sum, plan) => sum + calculateEstimatedEfforts(plan), 0);
    const calculatedMargin = totalPrice > 0 ? ((totalPrice - (totalIntCost * project.exchangeRate)) / totalPrice) * 100 : 0;
    
    return { totalIntCost, totalPrice, totalEfforts, calculatedMargin };
  }, [resourcePlans, project.exchangeRate, weekNumbers]);

  // Custom cells for actions - simplified implementation
  const customRenderers = [ActionCellRenderer];


  // Handle grid selection changes
  const onGridSelectionChange = useCallback((newSelection: GridSelection | undefined) => {
    setGridSelection(newSelection);
  }, []);

  // Provide cells for selection (needed for fill handle and copy operations)
  const getCellsForSelection = useCallback((selection: { x: number; y: number; width: number; height: number }) => {
    const cells: any[][] = [];
    
    for (let row = selection.y; row < selection.y + selection.height; row++) {
      const rowCells: any[] = [];
      for (let col = selection.x; col < selection.x + selection.width; col++) {
        const cellContent = getCellContent([col, row]);
        rowCells.push(cellContent);
      }
      cells.push(rowCells);
    }
    
    return cells;
  }, [getCellContent]);

  return (
    <div className="space-y-6">
      {/* Project Header - Two columns layout */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Project Controls Column - Split into two columns */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column: Project name and buttons */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project name</Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={onExportProject} size="sm" variant="default">
                    Save file
                  </Button>
                  <Button onClick={onImportProject} size="sm" variant="secondary">
                    Load file
                  </Button>
                  <Button onClick={onExportToExcel} size="sm" variant="outline">
                    Export to Excel
                  </Button>
                </div>
              </div>
              
              {/* Right Column: Project description */}
              <div className="space-y-2">
                <Label htmlFor="projectDescription">Project description</Label>
                <Textarea
                  id="projectDescription"
                  value={projectDescription}
                  onChange={(e) => onProjectDescriptionChange(e.target.value)}
                  rows={3}
                  placeholder="Enter project description"
                />
              </div>
            </div>
            
            {/* Project Settings - Split into two columns */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column: Days in FTE/month and Client currency */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="daysInFTE">Days in FTE/month</Label>
                  <Input
                    id="daysInFTE"
                    type="number"
                    value={project.daysInFTE}
                    onChange={(e) => onProjectSettingsChange({ daysInFTE: parseInt(e.target.value) || 20 })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clientCurrency">Client currency</Label>
                  <Select
                    value={project.clientCurrency}
                    onValueChange={(value) => onProjectSettingsChange({ clientCurrency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Right Column: Exchange rate and Default margin */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="exchangeRate">Exchange rate (to USD)</Label>
                  <Input
                    id="exchangeRate"
                    type="number"
                    step="0.01"
                    value={project.exchangeRate}
                    onChange={(e) => onProjectSettingsChange({ exchangeRate: parseFloat(e.target.value) || 0.89 })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="defaultMargin">Default Margin</Label>
                  <Input
                    id="defaultMargin"
                    type="text"
                    value={`${Number.isFinite(project.defaultMargin as number) ? (project.defaultMargin as number).toFixed(0) : '50'}%`}
                    onChange={(e) => {
                      const numeric = e.target.value.replace(/[^0-9.]/g, '');
                      const parsed = parseFloat(numeric);
                      const clamped = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
                      onProjectSettingsChange({ defaultMargin: clamped });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Total Internal Cost</Label>
                <div className="text-lg">${Math.round(totals.totalIntCost)}</div>
              </div>
              <div>
                <Label>Total Price</Label>
                <div className="text-lg">{currencySymbol}{Math.round(totals.totalPrice)}</div>
              </div>
              <div>
                <Label>Total Estimated Efforts</Label>
                <div className="text-lg">{Math.round(totals.totalEfforts)}h</div>
              </div>
              <div>
                <Label>Calculated Project Margin</Label>
                <div className="text-lg">{totals.calculatedMargin.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2>Planning Table</h2>
          <div className="flex items-center gap-2">
            <Button onClick={addRole} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Role
            </Button>
            <Button onClick={addWeek} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Week at End
            </Button>
            <span className="text-sm text-muted-foreground">Weeks: {weekNumbers.length} | Roles: {resourcePlans.length}</span>
          </div>
        </div>
        
        <div className="mb-2 text-sm text-muted-foreground">
         
          <span className="text-blue-600 font-medium">🖱️ New:</span> Right-click on any week column header to insert weeks before/after or delete that specific week from the planning table.
          <br />
          <span className="text-purple-600 font-medium">📋 Fill Handle:</span> Select week cells and use the fill handle (small square in corner) to drag and fill adjacent cells, or use Ctrl+D (fill down) and Ctrl+R (fill right) keyboard shortcuts.
          <br />
        </div>
        
        <div style={{ 
          height: `${Math.max(200, 72 + (resourcePlans.length * 34) + 20)}px`, // 36px header + 36px group header + rows * 34px + 20px padding
          width: '100%', 
          position: 'relative' 
        }} className="rounded-lg overflow-hidden border border-gray-200">
          <DataEditor
            getCellContent={getCellContent}
            columns={columns}
            rows={resourcePlans.length}
            customRenderers={customRenderers}
            onCellEdited={onCellEdited}
            onCellsEdited={onCellsEdited}
            onHeaderContextMenu={handleHeaderContextMenu}
            overlayCss=""
            fillHandle={true}
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            getCellsForSelection={getCellsForSelection}
            rangeSelect="rect"
            groupHeaderHeight={36}
            keybindings={{
              selectAll: true,
              selectRow: true,
              selectColumn: true,
              downFill: true,
              rightFill: true,
              pageUp: false,
              pageDown: false,
              clear: true,
              copy: true,
              paste: true,
              search: false,
              first: true,
              last: true,
            }}
            experimental={{
              enableColumnResizing: true,
            }}
            onCellActivated={(cell) => {
              const [col, row] = cell;
              if (col === 0) { // Actions column
                const plan = resourcePlans[row];
                if (plan) {
                  removeRole(plan.id);
                }
                return;
              }
              // Rate Card role column (index 1)
              if (col === 1) {
                const plan = resourcePlans[row];
                if (plan) {
                  setRoleSelection(plan.role || '');
                  setRolePicker({ open: true, row });
                }
                return;
              }
              // For all other columns, allow normal editing behavior
              return;
            }}
            freezeColumns={4}
            rowMarkers="number"
            smoothScrollX={true}
            smoothScrollY={true}
            overscrollX={0}
            overscrollY={0}
            theme={{
              accentColor: "#8f4f8f",
              accentFg: "#ffffff",
              accentLight: "rgba(62, 116, 253, 0.1)",
              textDark: "#313131",
              textMedium: "#737373",
              textLight: "#b1b1b1",
              textBubble: "#313131",
              bgIconHeader: "#b1b1b1",
              fgIconHeader: "#717171",
              textHeader: "#4a4a4a",
              textHeaderSelected: "#000000",
              bgCell: "#ffffff",
              bgCellMedium: "#fafafa",
              bgHeader: "#f6f6f6",
              bgHeaderHasFocus: "#e1e1e1",
              bgHeaderHovered: "#eeeeee",
              bgBubble: "#ffffff",
              bgBubbleSelected: "#ffffff",
              bgSearchResult: "#fff9e3",
              borderColor: "rgba(115, 115, 115, 0.16)",
              drilldownBorder: "rgba(115, 115, 115, 0.2)",
              linkColor: "#4F46E5",
              headerFontStyle: "600 14px",
              baseFontStyle: "14px",
              fontFamily: "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif"
            }}
          />
          
          {/* Context Menu for Week Deletion */}
          {contextMenu.show && (
            <div
              className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50"
              style={{
                left: `${contextMenu.x}px`,
                top: `${contextMenu.y}px`,
                minWidth: '160px',
                backgroundColor: '#ffffff',
                opacity: 1
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                onClick={handleInsertWeekBefore}
              >
                <ChevronLeft className="h-4 w-4" />
                Insert Week Before
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                onClick={handleInsertWeekAfter}
              >
                <ChevronRight className="h-4 w-4" />
                Insert Week After
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                onClick={handleDeleteWeekFromContextMenu}
                disabled={weekNumbers.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
                Delete Week {contextMenu.weekNumber}
              </button>
              {weekNumbers.length <= 1 && (
                <div className="px-4 py-2 text-xs text-gray-500">
                  Cannot delete the last week
                </div>
              )}
            </div>
          )}
        </div>

        {/* Role picker dialog */}
        <Dialog open={rolePicker.open} onOpenChange={(open) => setRolePicker(p => ({ ...p, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Rate Card Role</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={roleSelection} onValueChange={setRoleSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role..." />
                </SelectTrigger>
                <SelectContent>
                  {resourceLists.map((r) => (
                    <SelectItem key={r.role} value={r.role}>{r.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRolePicker({ open: false, row: null })}>Cancel</Button>
              <Button
                onClick={() => {
                  const row = rolePicker.row;
                  if (row === null) { setRolePicker({ open: false, row: null }); return; }
                  const plan = resourcePlans[row];
                  if (!plan) { setRolePicker({ open: false, row: null }); return; }
                  const newRole = roleSelection;
                  const selectedResource = resourceLists.find(r => r.role === newRole);
                  if (selectedResource) {
                    const defaultMargin = project.defaultMargin || 25.0;
                    const marginDecimal = defaultMargin / 100;
                    const clientHourlyRateInUSD = selectedResource.intRate / (1 - marginDecimal);
                    const clientHourlyRate = clientHourlyRateInUSD * project.exchangeRate;
                    const updatedResourcePlans = resourcePlans.map(p =>
                      p.id === plan.id
                        ? {
                            ...p,
                            role: newRole,
                            intHourlyRate: selectedResource.intRate,
                            clientHourlyRate: clientHourlyRate,
                            name: selectedResource.name || '',
                            clientRole: selectedResource.clientRole || ''
                          }
                        : p
                    );
                    onResourcePlansChange(updatedResourcePlans);
                  } else {
                    const updatedResourcePlans = resourcePlans.map(p =>
                      p.id === plan.id ? { ...p, role: newRole } : p
                    );
                    onResourcePlansChange(updatedResourcePlans);
                  }
                  setRolePicker({ open: false, row: null });
                }}
              >
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </div>
    </div>
  );
}

