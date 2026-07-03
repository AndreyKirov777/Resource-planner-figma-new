import React, { useState, useMemo, useCallback, useEffect } from 'react';
import DataEditor, { GridCell, GridCellKind, GridColumn, Item, EditableGridCell, HeaderClickedEventArgs, GridSelection, CustomRenderer } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Plus, X, Trash2, ChevronLeft, ChevronRight, ChevronDown, MoreVertical, Pencil, Minus, Palette, Link2 } from 'lucide-react';
import { Project, Phase, ResourceList as ResourceListType, ResourcePlan as ResourcePlanType, Allocation, GeneratePlanDraft } from '../services/api';
import { clientHourlyRate as calcClientHourlyRate, totalInternalCost, totalClientCost, marginPct, grossMarginPct, estimatedEffortHours, hoursPerPeriod } from '../utils/calculations';
import { PHASE_COLORS, parsePhases, getPhaseForPeriod } from '../utils/phases';
import { APP_DEFAULTS, LOCATIONS } from '../config/defaults';
import { GeneratePlanSheet } from './GeneratePlanSheet';

interface ResourcePlanProps {
  project: Project;
  resourceLists: ResourceListType[];
  resourcePlans: ResourcePlanType[];
  onResourcePlansChange: (resourcePlans: ResourcePlanType[]) => void;
  onAddResourcePlan: (resourcePlan: Omit<Partial<ResourcePlanType>, 'allocations'> & { allocations?: Partial<Allocation>[] }) => void;
  onDeleteResourcePlan: (id: number) => void;
  onReorderResourcePlans: (orderedIds: number[]) => void;
  onProjectSettingsChange: (settings: Partial<Project>) => void;
  onExportProject?: () => void;
  onImportProject?: () => void;
  onExportToExcel?: () => void;
  onExportToPNG?: () => void;
  onClearAllResourcePlans?: () => void;
  onApplyGeneratedPlan?: (draft: GeneratePlanDraft) => Promise<void>;
  onConvertPlanningMode?: (targetMode: 'weekly' | 'monthly') => void;
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
const ActionCellRenderer: CustomRenderer<ActionCell> = {
  kind: GridCellKind.Custom,
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
            onValueChange={(val: string) => {
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
  onReorderResourcePlans,
  onProjectSettingsChange,
  onExportProject,
  onImportProject,
  onExportToExcel,
  onExportToPNG,
  onClearAllResourcePlans,
  onApplyGeneratedPlan,
  onConvertPlanningMode,
  projectName,
  projectDescription,
  onProjectNameChange,
  onProjectDescriptionChange
}: ResourcePlanProps) {
  const planningMode = (project.planningMode || 'weekly') as 'weekly' | 'monthly';
  const isMonthly = planningMode === 'monthly';
  const periodLabel = isMonthly ? 'Month' : 'Week';
  const periodLabelPlural = isMonthly ? 'Months' : 'Weeks';
  const periodSuffix = isMonthly ? 'm' : 'w';

  const [phases, setPhases] = useState<Phase[]>(() => parsePhases(project.phases, resourcePlans));
  const [showGeneratePlan, setShowGeneratePlan] = useState(false);
  const [rolePicker, setRolePicker] = useState<{ open: boolean; row: number | null }>({ open: false, row: null });
  const [roleSelection, setRoleSelection] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<{ 
    show: boolean; 
    x: number; 
    y: number; 
    periodNumber: number | null; 
    colIndex: number | null; 
  }>({ show: false, x: 0, y: 0, periodNumber: null, colIndex: null });
  const [lastMousePosition, setLastMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [gridSelection, setGridSelection] = useState<GridSelection>();
  const [phaseBreakdownOpen, setPhaseBreakdownOpen] = useState(true);
  const [editingPhaseIndex, setEditingPhaseIndex] = useState<number | null>(null);
  const [editingPhaseName, setEditingPhaseName] = useState('');

  // Sync phases from project when switching project or when project.phases is updated (e.g. after persist)
  useEffect(() => {
    setPhases(parsePhases(project.phases, resourcePlans));
  }, [project.id, project.phases]);

  const totalPeriods = phases.reduce((sum, p) => sum + (p.periodCount ?? 0), 0);
  const periodNumbers = useMemo(
    () => Array.from({ length: totalPeriods }, (_, i) => i + 1),
    [totalPeriods]
  );

  const persistPhases = useCallback(
    (nextPhases: Phase[]) => {
      setPhases(nextPhases);
      onProjectSettingsChange({ phases: JSON.stringify(nextPhases) });
    },
    [onProjectSettingsChange]
  );

  const currencySymbol = project.clientCurrency === 'EUR' ? '€' : 
                        project.clientCurrency === 'GBP' ? '£' : '$';

  const hrsPerPeriod = hoursPerPeriod(planningMode, project.daysInFTE);

  // Calculation functions (shared utils)
  const calculateEstimatedEfforts = (plan: ResourcePlanType): number => {
    let totalPeriodsEquivalent = 0;
    periodNumbers.forEach(periodNum => {
      const allocation = plan.allocations.find(a => a.periodNumber === periodNum);
      totalPeriodsEquivalent += (allocation?.allocation || 0) / 100;
    });
    return estimatedEffortHours(totalPeriodsEquivalent, hrsPerPeriod);
  };

  const calculateTotalIntCost = (plan: ResourcePlanType): number => {
    const hours = calculateEstimatedEfforts(plan);
    return totalInternalCost(hours, plan.intHourlyRate);
  };

  const calculateTotalPrice = (plan: ResourcePlanType): number => {
    const hours = calculateEstimatedEfforts(plan);
    return totalClientCost(hours, plan.clientHourlyRate);
  };

  const calculateMargin = (plan: ResourcePlanType): number | null => {
    return marginPct(plan.clientHourlyRate, plan.intHourlyRate, project.exchangeRate);
  };

  // Period management functions (phase-aware)
  const insertPeriodAfter = useCallback(
    (afterPosition: number, targetPhaseIndex?: number) => {
      const periodNumAtPosition = afterPosition + 1;
      const { phaseIndex: detectedPhaseIndex } = getPhaseForPeriod(periodNumAtPosition, phases);
      const phaseIndex = targetPhaseIndex ?? detectedPhaseIndex;
      const newPhases = phases.map((p, i) =>
        i === phaseIndex ? { ...p, periodCount: (p.periodCount ?? 0) + 1 } : p
      );
      persistPhases(newPhases);

      const renumberedWeeks = Array.from({ length: periodNumbers.length + 1 }, (_, i) => i + 1);

      const updatedResourcePlans = resourcePlans.map((plan) => {
        const newAllocations: Allocation[] = [];
        renumberedWeeks.forEach((newWeekNum, index) => {
          if (index === afterPosition) {
            newAllocations.push({
              id: 0,
              periodNumber: newWeekNum,
              allocation: 0,
              resourcePlanId: plan.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as Allocation);
          } else if (index < afterPosition) {
            const oldWeekNum = periodNumbers[index];
            const existingAllocation = plan.allocations.find((wa) => wa.periodNumber === oldWeekNum);
            if (existingAllocation) {
              newAllocations.push({ ...existingAllocation, periodNumber: newWeekNum });
            }
          } else {
            const oldWeekNum = periodNumbers[index - 1];
            const existingAllocation = plan.allocations.find((wa) => wa.periodNumber === oldWeekNum);
            if (existingAllocation) {
              newAllocations.push({ ...existingAllocation, periodNumber: newWeekNum });
            }
          }
        });
        return { ...plan, allocations: newAllocations };
      });
      onResourcePlansChange(updatedResourcePlans);
    },
    [phases, periodNumbers, resourcePlans, persistPhases, onResourcePlansChange]
  );

  const removeSpecificPeriod = useCallback(
    (weekToRemove: number) => {
      if (periodNumbers.length <= 1) return;
      const weekPosition = periodNumbers.findIndex((w) => w === weekToRemove);
      if (weekPosition === -1) return;

      const { phaseIndex } = getPhaseForPeriod(weekToRemove, phases);
      const phase = phases[phaseIndex];
      if ((phase.periodCount ?? 0) <= 1) return;
      const newPhases = phases.map((p, i) =>
        i === phaseIndex ? { ...p, periodCount: (p.periodCount ?? 0) - 1 } : p
      );
      persistPhases(newPhases);

      const renumberedWeeks = periodNumbers
        .filter((w) => w !== weekToRemove)
        .map((_, index) => index + 1);

      const updatedResourcePlans = resourcePlans.map((plan) => {
        const newAllocations: Allocation[] = [];
        renumberedWeeks.forEach((newWeekNum, index) => {
          const originalIndex = index < weekPosition ? index : index + 1;
          const oldWeekNum = periodNumbers[originalIndex];
          const existingAllocation = plan.allocations.find((wa) => wa.periodNumber === oldWeekNum);
          if (existingAllocation) {
            newAllocations.push({ ...existingAllocation, periodNumber: newWeekNum });
          }
        });
        return { ...plan, allocations: newAllocations };
      });
      onResourcePlansChange(updatedResourcePlans);
    },
    [periodNumbers, phases, resourcePlans, persistPhases, onResourcePlansChange]
  );

  const removeRole = useCallback((roleId: number) => {
    onDeleteResourcePlan(roleId);
  }, [onDeleteResourcePlan]);

  const handleRowMoved = useCallback((startIndex: number, endIndex: number) => {
    const newPlans = [...resourcePlans];
    const [moved] = newPlans.splice(startIndex, 1);
    newPlans.splice(endIndex, 0, moved);
    onReorderResourcePlans(newPlans.map(p => p.id));
  }, [resourcePlans, onReorderResourcePlans]);

  const getGroupDetails = useCallback(
    (groupName: string) => {
      const phase = phases.find((p) => p.name === groupName);
      if (!phase) return { name: groupName };
      const color = phase.color ?? PHASE_COLORS[phases.indexOf(phase) % PHASE_COLORS.length];
      return {
        name: groupName,
        overrideTheme: {
          bgHeader: color,
          bgHeaderHovered: color,
        },
      };
    },
    [phases]
  );

  // Glide Data Grid column definitions (period columns grouped by phase)
  const columns = useMemo((): GridColumn[] => {
    const cols: GridColumn[] = [
      { title: '', width: 60 },
      { title: 'Rate card role', width: 200 },
      { title: 'Client Role', width: 150 },
      { title: 'Name', width: 150 },
      { title: 'Hourly cost', width: 90, group: 'Internal' },
      { title: 'Daily cost', width: 90, group: 'Internal' },
      { title: 'Hourly rate', width: 90, group: 'Client' },
      { title: 'Daily rate', width: 90, group: 'Client' },
      { title: 'Margin', width: 70 },
    ];
    let periodIndex = 0;
    phases.forEach((phase) => {
      const count = phase.periodCount ?? 0;
      for (let i = 0; i < count; i++) {
        const title = `${periodIndex + 1}`;
        cols.push({ title, width: isMonthly ? 55 : 50, group: phase.name });
        periodIndex++;
      }
    });
    cols.push(
      { title: 'Cost', width: 100, group: 'Total' },
      { title: 'Price', width: 100, group: 'Total' },
      { title: 'Efforts, h', width: 90, group: 'Total' }
    );
    return cols;
  }, [phases, isMonthly]);

  // Get cell content function for glide-data-grid
  const getCellContent = useCallback(([col, row]: Item): GridCell => {
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
    for (let i = 0; i < periodNumbers.length; i++) {
      if (colIndex === colOffset + i) {
        const weekNum = periodNumbers[i];
        const allocation = plan.allocations.find(wa => wa.periodNumber === weekNum);
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
    colOffset += periodNumbers.length;

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
  }, [resourcePlans, periodNumbers, currencySymbol, resourceLists, removeRole, project.exchangeRate]);

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
          const clientHourlyRate = calcClientHourlyRate(selectedResource.intRate, marginDecimal, project.exchangeRate);
          
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
    for (let i = 0; i < periodNumbers.length; i++) {
      if (colIndex === colOffset + i) {
        if (newValue.kind === GridCellKind.Number) {
          const weekNum = periodNumbers[i];
          const clampedValue = Math.max(0, Math.min(100, newValue.data || 0));
          
          const updatedResourcePlans = resourcePlans.map(p => {
            if (p.id !== plan.id) return p;
            
            const existing = p.allocations.find(wa => wa.periodNumber === weekNum);
            if (existing) {
              const updatedAllocations = p.allocations.map(wa =>
                wa.periodNumber === weekNum
                  ? { ...wa, allocation: clampedValue, updatedAt: new Date().toISOString() }
                  : wa
              );
              return { ...p, allocations: updatedAllocations };
            }
            
            const now = new Date().toISOString();
            const newAllocation = {
              id: 0,
              periodNumber: weekNum,
              allocation: clampedValue,
              resourcePlanId: p.id,
              createdAt: now,
              updatedAt: now,
            } as Allocation;
            
            return { ...p, allocations: [...p.allocations, newAllocation] };
          });
          
          onResourcePlansChange(updatedResourcePlans);
        }
        return;
      }
    }
  }, [resourcePlans, periodNumbers, resourceLists, project.defaultMargin, project.exchangeRate, onResourcePlansChange]);

  // Handle batch cell edits (used by fill handle)
  const onCellsEdited = useCallback((newValues: readonly { location: Item; value: EditableGridCell }[]) => {
    const periodColumnStartIndex = 9; // Skip the first 9 columns
    
    // Group changes by resource plan
    const planUpdates = new Map<number, { plan: ResourcePlanType; updates: { weekNum: number; value: number }[] }>();
    
    newValues.forEach(({ location, value }) => {
      const [col, row] = location;
      const plan = resourcePlans[row];
      if (!plan) return;
      
      // Only process week columns
      if (col >= periodColumnStartIndex && col < periodColumnStartIndex + periodNumbers.length) {
        const periodColumnIndex = col - periodColumnStartIndex;
        const weekNum = periodNumbers[periodColumnIndex];
        
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
        
        let updatedAllocations = [...plan.allocations];
        
        planUpdate.updates.forEach(({ weekNum, value }) => {
          const existingIndex = updatedAllocations.findIndex(wa => wa.periodNumber === weekNum);
          
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
              periodNumber: weekNum,
              allocation: value,
              resourcePlanId: plan.id,
              createdAt: now,
              updatedAt: now,
            } as Allocation);
          }
        });
        
        return { ...plan, allocations: updatedAllocations };
      });
      
      onResourcePlansChange(updatedResourcePlans);
      return true; // Prevent individual onCellEdited calls
    }
    
    return false; // Allow individual onCellEdited calls for non-week columns
  }, [resourcePlans, periodNumbers, onResourcePlansChange]);

  const addPeriod = useCallback(() => {
    if (phases.length === 0) return;
    const newPhases = phases.map((p, i) =>
      i === phases.length - 1 ? { ...p, periodCount: (p.periodCount ?? 0) + 1 } : p
    );
    persistPhases(newPhases);
    const newWeekNumber = periodNumbers.length + 1;
    const updatedResourcePlans = resourcePlans.map((plan) => ({
      ...plan,
      allocations: [
        ...plan.allocations,
        {
          id: 0,
          periodNumber: newWeekNumber,
          allocation: 0,
          resourcePlanId: plan.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Allocation,
      ],
    }));
    onResourcePlansChange(updatedResourcePlans);
  }, [phases, periodNumbers.length, resourcePlans, persistPhases, onResourcePlansChange]);

  const addPhase = useCallback(() => {
    const nextIndex = phases.length + 1;
    const color = PHASE_COLORS[phases.length % PHASE_COLORS.length];
    persistPhases([...phases, { name: `Phase ${nextIndex}`, periodCount: 4, color }]);
  }, [phases, persistPhases]);

  const addPeriodToPhase = useCallback(
    (phaseIndex: number) => {
      const start = phases.slice(0, phaseIndex).reduce((s, p) => s + (p.periodCount ?? 0), 0);
      const insertAt = start + (phases[phaseIndex].periodCount ?? 0);
      insertPeriodAfter(insertAt, phaseIndex);
    },
    [phases, insertPeriodAfter]
  );

  const removeLastPeriodFromPhase = useCallback(
    (phaseIndex: number) => {
      const phase = phases[phaseIndex];
      if ((phase.periodCount ?? 0) <= 1) return;
      const start = phases.slice(0, phaseIndex).reduce((s, p) => s + (p.periodCount ?? 0), 0);
      const weekToRemove = start + (phase.periodCount ?? 0);
      removeSpecificPeriod(weekToRemove);
    },
    [phases, removeSpecificPeriod]
  );

  const deletePhase = useCallback(
    (phaseIndex: number) => {
      if (phases.length <= 1) return;
      const start = phases.slice(0, phaseIndex).reduce((s, p) => s + (p.periodCount ?? 0), 0);
      const phase = phases[phaseIndex];
      const weeksToRemove = Array.from(
        { length: phase.periodCount ?? 0 },
        (_, i) => start + i + 1
      );
      const newPhases = phases.filter((_, i) => i !== phaseIndex);
      persistPhases(newPhases);
      const remainingWeekNumbers = periodNumbers.filter((w) => !weeksToRemove.includes(w));
      const renumberedWeeks = remainingWeekNumbers.map((_, i) => i + 1);
      const updatedResourcePlans = resourcePlans.map((plan) => {
        const newAllocations = plan.allocations
          .filter((wa) => !weeksToRemove.includes(wa.periodNumber))
          .map((wa) => {
            const idx = remainingWeekNumbers.indexOf(wa.periodNumber);
            return { ...wa, periodNumber: renumberedWeeks[idx] };
          });
        return { ...plan, allocations: newAllocations };
      });
      onResourcePlansChange(updatedResourcePlans);
    },
    [phases, periodNumbers, resourcePlans, persistPhases, onResourcePlansChange]
  );

  const renamePhase = useCallback(
    (phaseIndex: number, newName: string) => {
      if (!newName.trim()) return;
      const newPhases = phases.map((p, i) =>
        i === phaseIndex ? { ...p, name: newName.trim() } : p
      );
      persistPhases(newPhases);
      setEditingPhaseIndex(null);
      setEditingPhaseName('');
    },
    [phases, persistPhases]
  );

  const changePhaseColor = useCallback(
    (phaseIndex: number, color: string) => {
      const newPhases = phases.map((p, i) =>
        i === phaseIndex ? { ...p, color } : p
      );
      persistPhases(newPhases);
    },
    [phases, persistPhases]
  );

  const addRole = useCallback(() => {
    // Send only fields allowed by server resourcePlanCreateSchema (strict): role, clientRole, name, intHourlyRate, clientHourlyRate, allocations (each only periodNumber + allocation)
    const newResourcePlan = {
      role: 'New role', // placeholder; schema requires min(1); user can change via grid or role picker
      clientRole: undefined as string | undefined,
      name: undefined as string | undefined,
      intHourlyRate: 0,
      clientHourlyRate: 0,
      allocations: periodNumbers.map(weekNum => ({
        periodNumber: weekNum,
        allocation: 0
      }))
    };
    onAddResourcePlan(newResourcePlan);
  }, [periodNumbers, onAddResourcePlan]);

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
    const periodColumnStartIndex = 9;
    const periodColumnIndex = colIndex - periodColumnStartIndex;
    
    // Only show context menu for period columns
    if (periodColumnIndex >= 0 && periodColumnIndex < periodNumbers.length) {
      const periodNum = periodNumbers[periodColumnIndex];
      
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
        periodNumber: periodNum,
        colIndex
      });
    }
  }, [periodNumbers, lastMousePosition]);

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
  const handleDeletePeriodFromContextMenu = useCallback(() => {
    if (contextMenu.periodNumber !== null) {
      removeSpecificPeriod(contextMenu.periodNumber);
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.periodNumber, removeSpecificPeriod]);

  // Handle insert week before from context menu
  const handleInsertPeriodBefore = useCallback(() => {
    if (contextMenu.periodNumber !== null) {
      // Find the position of the current week and insert before it
      const weekPosition = periodNumbers.findIndex(week => week === contextMenu.periodNumber);
      if (weekPosition >= 0) {
        // insertPeriodAfter actually inserts AT the position, so to insert BEFORE we use the current position
        insertPeriodAfter(weekPosition);
      }
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.periodNumber, periodNumbers, insertPeriodAfter]);

  // Handle insert week after from context menu
  const handleInsertPeriodAfter = useCallback(() => {
    if (contextMenu.periodNumber !== null) {
      // Find the position of the current week and insert after it
      const weekPosition = periodNumbers.findIndex(week => week === contextMenu.periodNumber);
      if (weekPosition >= 0) {
        // insertPeriodAfter actually inserts AT the position, so to insert AFTER we use position + 1
        insertPeriodAfter(weekPosition + 1);
      }
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  }, [contextMenu.periodNumber, periodNumbers, insertPeriodAfter]);

  const totals = useMemo(() => {
    const totalIntCost = resourcePlans.reduce((sum, plan) => sum + calculateTotalIntCost(plan), 0);
    const totalPrice = resourcePlans.reduce((sum, plan) => sum + calculateTotalPrice(plan), 0);
    const totalEfforts = resourcePlans.reduce((sum, plan) => sum + calculateEstimatedEfforts(plan), 0);
    const calculatedMargin = grossMarginPct(totalIntCost, totalPrice, project.exchangeRate);
    const blendedHourlyRate = totalEfforts > 0 ? totalPrice / totalEfforts : 0;
    const blendedDailyRate = blendedHourlyRate * 8;
    return { totalIntCost, totalPrice, totalEfforts, calculatedMargin, blendedHourlyRate, blendedDailyRate };
  }, [resourcePlans, project.exchangeRate, periodNumbers]);

  const phaseTotals = useMemo(() => {
    let startPeriod = 1;
    return phases.map((phase) => {
      const count = phase.periodCount ?? 0;
      const endPeriod = startPeriod + count - 1;
      let cost = 0,
        price = 0,
        efforts = 0;
      resourcePlans.forEach((plan) => {
        let periodsEquiv = 0;
        for (let p = startPeriod; p <= endPeriod; p++) {
          const alloc = plan.allocations.find((a) => a.periodNumber === p);
          periodsEquiv += (alloc?.allocation || 0) / 100;
        }
        const hours = estimatedEffortHours(periodsEquiv, hrsPerPeriod);
        cost += totalInternalCost(hours, plan.intHourlyRate);
        price += totalClientCost(hours, plan.clientHourlyRate);
        efforts += hours;
      });
      const margin = grossMarginPct(cost, price, project.exchangeRate);
      const result = { name: phase.name, cost, price, efforts, margin };
      startPeriod = endPeriod + 1;
      return result;
    });
  }, [phases, resourcePlans, project.exchangeRate, hrsPerPeriod]);

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
      {/* Action buttons above project parameters */}
      <div className="flex items-center gap-2">
        <Button onClick={onExportProject} size="sm" variant="default">
          Save file
        </Button>
        <Button onClick={onImportProject} size="sm" variant="secondary">
          Load file
        </Button>
        <Button onClick={onExportToExcel} size="sm" variant="outline">
          Export to Excel
        </Button>
        <Button onClick={onExportToPNG} size="sm" variant="outline">
          Export to PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const url = `${window.location.origin}/client/${project.id}`;
            if (navigator.clipboard) {
              navigator.clipboard.writeText(url).then(() => {
                alert('Client link copied to clipboard');
              });
            } else {
              const el = document.createElement('textarea');
              el.value = url;
              el.style.position = 'fixed';
              el.style.opacity = '0';
              document.body.appendChild(el);
              el.focus();
              el.select();
              document.execCommand('copy');
              document.body.removeChild(el);
              alert('Client link copied to clipboard');
            }
          }}
        >
          <Link2 className="h-4 w-4 mr-1" />
          Client link
        </Button>
      </div>

      {/* Project Header - Two columns layout */}
      <Card>
        <CardContent className="relative pt-6 pr-44">
          <div className="grid grid-cols-5 gap-4">
            {/* Project name and planning mode */}
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project name</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="Enter project name"
                />
              </div>

              <div className="space-y-2">
                <Label>Planning Mode</Label>
                <ToggleGroup
                  type="single"
                  value={planningMode}
                  onValueChange={(value: string) => {
                    if (!value) return;
                    const targetMode = value as 'weekly' | 'monthly';
                    if (targetMode !== planningMode && onConvertPlanningMode) {
                      if (window.confirm(`Switch to ${targetMode} planning? This will recalculate all allocations. The conversion is lossy and may not be perfectly reversible.`)) {
                        onConvertPlanningMode(targetMode);
                      }
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <ToggleGroupItem value="weekly" className="flex-1">Weekly</ToggleGroupItem>
                  <ToggleGroupItem value="monthly" className="flex-1">Monthly</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            {/* Project description */}
            <div className="flex flex-col">
              <Label htmlFor="projectDescription" className="mb-2">Project description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => onProjectDescriptionChange(e.target.value)}
                placeholder="Enter project description"
                className="flex-1 resize-none"
              />
            </div>

            {/* Location & duration — same width as Days in FTE column */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultLocation">Default location</Label>
                <Select
                  value={project.defaultLocation ?? APP_DEFAULTS.defaultLocation}
                  onValueChange={(value: string) => onProjectSettingsChange({ defaultLocation: value })}
                >
                  <SelectTrigger id="defaultLocation">
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

              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {totalPeriods} {totalPeriods === 1 ? periodLabel.toLowerCase() : periodLabelPlural.toLowerCase()}
                </div>
              </div>
            </div>

            {/* Days in FTE/month and Client currency */}
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
                  onValueChange={(value: string) => onProjectSettingsChange({ clientCurrency: value })}
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

            {/* Exchange rate and Default margin */}
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
          <div className="pointer-events-none absolute right-6 top-6 h-[126px] w-auto">
            <img
              src="/resource_planner_logo_8th_march.png"
              alt="Resource Planner 8th of March Edition logo"
              className="h-full w-auto object-contain"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-7 gap-4">
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
              <Label>Duration ({periodLabelPlural.toLowerCase()})</Label>
              <div className="text-lg">{totalPeriods}</div>
            </div>
            <div>
              <Label>Calculated Project Margin</Label>
              <div className="text-lg">{totals.calculatedMargin.toFixed(1)}%</div>
            </div>
            <div>
              <Label>Blended Hourly Rate</Label>
              <div className="text-lg">{currencySymbol}{totals.blendedHourlyRate.toFixed(0)}</div>
            </div>
            <div>
              <Label>Blended Daily Rate</Label>
              <div className="text-lg">{currencySymbol}{totals.blendedDailyRate.toFixed(0)}</div>
            </div>
          </div>
          {phaseTotals.length > 0 && (
            <Collapsible open={phaseBreakdownOpen} onOpenChange={setPhaseBreakdownOpen} className="mt-4">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-4 w-4 transition-transform ${phaseBreakdownOpen ? '' : '-rotate-90'}`} />
                  Phase Breakdown
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1.5 pl-6 text-sm">
                  {phaseTotals.map((pt) => (
                    <div key={pt.name} className="flex flex-wrap items-center gap-x-4 gap-y-0">
                      <span className="font-medium text-foreground">{pt.name}:</span>
                      <span>Cost ${Math.round(pt.cost)}</span>
                      <span>|</span>
                      <span>Price {currencySymbol}{Math.round(pt.price)}</span>
                      <span>|</span>
                      <span>{Math.round(pt.efforts)}h</span>
                      <span>|</span>
                      <span>{pt.margin.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <span className="text-sm font-medium text-muted-foreground">Phases:</span>
        {phases.map((phase, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 rounded-md border px-2 py-1"
            style={{ backgroundColor: phase.color ?? PHASE_COLORS[idx % PHASE_COLORS.length] }}
          >
            {editingPhaseIndex === idx ? (
              <Input
                className="h-7 w-32 text-sm"
                value={editingPhaseName}
                onChange={(e) => setEditingPhaseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renamePhase(idx, editingPhaseName);
                  if (e.key === 'Escape') setEditingPhaseIndex(null);
                }}
                onBlur={() => editingPhaseName && renamePhase(idx, editingPhaseName)}
                autoFocus
              />
            ) : (
              <span
                className="cursor-pointer px-1 text-sm"
                onDoubleClick={() => {
                  setEditingPhaseIndex(idx);
                  setEditingPhaseName(phase.name);
                }}
              >
                {phase.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{phase.periodCount ?? 0}{periodSuffix}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setEditingPhaseIndex(idx); setEditingPhaseName(phase.name); }}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="mr-2 h-3.5 w-3.5" />
                    Change Color
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <div className="grid grid-cols-5 gap-1 p-1">
                      {PHASE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="h-6 w-6 rounded border border-border shrink-0 hover:ring-2 hover:ring-primary"
                          style={{ backgroundColor: c }}
                          onClick={() => changePhaseColor(idx, c)}
                          title={c}
                        />
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => addPeriodToPhase(idx)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add {periodLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => removeLastPeriodFromPhase(idx)}
                  disabled={(phase.periodCount ?? 0) <= 1}
                >
                  <Minus className="mr-2 h-3.5 w-3.5" />
                  Remove Last {periodLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => deletePhase(idx)}
                  disabled={phases.length <= 1}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Phase
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addPhase} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2>Planning Table</h2>
          <div className="flex items-center gap-2">
            <Button onClick={addRole} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Role
            </Button>
            <Button onClick={addPeriod} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add {periodLabel} at End
            </Button>
            {onClearAllResourcePlans && resourcePlans.length > 0 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={onClearAllResourcePlans}
              >
                Clear all
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowGeneratePlan(true)}>✦ Generate AI Plan</Button>
            <span className="text-sm text-muted-foreground">{periodLabelPlural}: {periodNumbers.length} | Roles: {resourcePlans.length}</span>
          </div>
        </div>

        <div className="mb-2 text-sm text-muted-foreground">

          <span className="text-blue-600 font-medium">Right-click</span> on any {periodLabel.toLowerCase()} column header to insert {periodLabelPlural.toLowerCase()} before/after or delete that specific {periodLabel.toLowerCase()} from the planning table.
          <br />
          <span className="text-purple-600 font-medium">Fill Handle:</span> Select cells and use the fill handle (small square in corner) to drag and fill adjacent cells, or use Ctrl+D (fill down) and Ctrl+R (fill right) keyboard shortcuts.
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
            getGroupDetails={getGroupDetails}
            fillHandle={true}
            onRowMoved={handleRowMoved}
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
                onClick={handleInsertPeriodBefore}
              >
                <ChevronLeft className="h-4 w-4" />
                Insert {periodLabel} Before
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                onClick={handleInsertPeriodAfter}
              >
                <ChevronRight className="h-4 w-4" />
                Insert {periodLabel} After
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                onClick={handleDeletePeriodFromContextMenu}
                disabled={periodNumbers.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
                Delete {periodLabel} {contextMenu.periodNumber}
              </button>
              {periodNumbers.length <= 1 && (
                <div className="px-4 py-2 text-xs text-gray-500">
                  Cannot delete the last {periodLabel.toLowerCase()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Role picker dialog */}
        <Dialog open={rolePicker.open} onOpenChange={(open: boolean) => setRolePicker(p => ({ ...p, open }))}>
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
                    const clientHourlyRate = calcClientHourlyRate(selectedResource.intRate, marginDecimal, project.exchangeRate);
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

        <GeneratePlanSheet
          open={showGeneratePlan}
          onOpenChange={setShowGeneratePlan}
          projectId={project.id}
          phases={phases}
          planningMode={planningMode}
          onAcceptPlan={onApplyGeneratedPlan}
        />

      </div>
    </div>
  );
}

