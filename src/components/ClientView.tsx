import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import DataEditor, { GridCellKind, GridColumn, Item } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { GRID_THEME } from './gridTheme';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { api, Project, Phase, ResourcePlan as ResourcePlanType } from '../services/api';
import { hoursPerPeriod, buildPlanFinancials } from '../utils/calculations';
import { PHASE_COLORS, parsePhases } from '../utils/phases';
import { buildClientPngExport, downloadClientViewPng } from '../utils/clientViewPng';
import * as ExcelJS from 'exceljs';

function getAllocationBgColor(percent: number): string {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (p <= 0) return '#ffffff';
  if (p >= 100) return '#63BE7B';
  const t = p / 100;
  const start = { r: 255, g: 255, b: 255 };
  const end = { r: 0x63, g: 0xBE, b: 0x7B };
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function ClientView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [resourcePlans, setResourcePlans] = useState<ResourcePlanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phaseBreakdownOpen, setPhaseBreakdownOpen] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    const id = parseInt(projectId, 10);
    if (isNaN(id)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getProject(id)
      .then((data) => {
        setProject(data);
        setResourcePlans(data.resourcePlans || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const phases = useMemo(
    () => (project ? parsePhases(project.phases, resourcePlans) : []),
    [project?.phases, resourcePlans]
  );

  const planningMode = (project?.planningMode || 'weekly') as 'weekly' | 'monthly';
  const isMonthly = planningMode === 'monthly';
  const periodLabelPlural = isMonthly ? 'Months' : 'Weeks';
  const hrsPerPeriod = hoursPerPeriod(planningMode, project?.daysInFTE ?? 20);

  const currencySymbol = project?.clientCurrency === 'EUR' ? '€' :
    project?.clientCurrency === 'GBP' ? '£' : '$';

  const totalPeriods = phases.reduce((sum, p) => sum + (p.periodCount ?? 0), 0);
  const periodNumbers = useMemo(
    () => Array.from({ length: totalPeriods }, (_, i) => i + 1),
    [totalPeriods]
  );

  // exchangeRate doesn't affect price/efforts (client-safe fields), so a fixed
  // value is fine here — buildPlanFinancials also computes intCost/margin,
  // which this client-facing view never reads.
  const financials = useMemo(
    () => buildPlanFinancials(resourcePlans, phases, hrsPerPeriod, project?.exchangeRate ?? 1),
    [resourcePlans, phases, hrsPerPeriod, project?.exchangeRate]
  );
  const financialsByPlan = useMemo(
    () => new Map(financials.rows.map((r) => [r.plan, r])),
    [financials]
  );

  // Calculation helpers
  const calcEfforts = useCallback(
    (plan: ResourcePlanType): number => financialsByPlan.get(plan)?.effortHours ?? 0,
    [financialsByPlan]
  );

  const calcPrice = useCallback(
    (plan: ResourcePlanType): number => financialsByPlan.get(plan)?.price ?? 0,
    [financialsByPlan]
  );

  // Column definitions
  const columns = useMemo((): GridColumn[] => {
    const cols: GridColumn[] = [
      { title: 'Role', width: 250 },
      { title: 'Name', width: 150 },
      { title: 'Hourly rate', width: 90, group: 'Rate' },
      { title: 'Daily rate', width: 90, group: 'Rate' },
    ];
    let periodIndex = 0;
    phases.forEach((phase) => {
      const count = phase.periodCount ?? 0;
      for (let i = 0; i < count; i++) {
        cols.push({ title: `${periodIndex + 1}`, width: isMonthly ? 55 : 50, group: phase.name });
        periodIndex++;
      }
    });
    cols.push(
      { title: 'Price', width: 100, group: 'Total' },
      { title: 'Efforts, h', width: 90, group: 'Total' }
    );
    return cols;
  }, [phases, isMonthly]);

  // Group details for phase colors
  const getGroupDetails = useCallback(
    (groupName: string) => {
      const phase = phases.find((p) => p.name === groupName);
      if (!phase) return { name: groupName };
      const color = phase.color ?? PHASE_COLORS[phases.indexOf(phase) % PHASE_COLORS.length];
      return {
        name: groupName,
        overrideTheme: {
          bgHeader: color,
          bgHeaderHasFocus: color,
          bgHeaderHovered: color,
        },
      };
    },
    [phases]
  );

  // Cell content (read-only)
  const getCellContent = useCallback(([col, row]: Item) => {
    const plan = resourcePlans[row];
    if (!plan) {
      return { kind: GridCellKind.Text as const, data: '', allowOverlay: false, displayData: '' };
    }

    let offset = 0;

    // Role
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: plan.clientRole || '', allowOverlay: false, displayData: plan.clientRole || '' };
    }
    offset++;

    // Name
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: plan.name || '', allowOverlay: false, displayData: plan.name || '' };
    }
    offset++;

    // Hourly rate
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: `${currencySymbol}${Math.round(plan.clientHourlyRate)}`, allowOverlay: false, displayData: `${currencySymbol}${Math.round(plan.clientHourlyRate)}` };
    }
    offset++;

    // Daily rate
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: `${currencySymbol}${Math.round(plan.clientHourlyRate * 8)}`, allowOverlay: false, displayData: `${currencySymbol}${Math.round(plan.clientHourlyRate * 8)}` };
    }
    offset++;

    // Period columns
    for (let i = 0; i < periodNumbers.length; i++) {
      if (col === offset + i) {
        const weekNum = periodNumbers[i];
        const allocation = plan.allocations.find((a) => a.periodNumber === weekNum);
        const value = allocation?.allocation || 0;
        return {
          kind: GridCellKind.Text as const,
          data: `${value}%`,
          allowOverlay: false,
          displayData: `${value}%`,
          themeOverride: { bgCell: getAllocationBgColor(value) },
        };
      }
    }
    offset += periodNumbers.length;

    // Price
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: `${currencySymbol}${Math.round(calcPrice(plan))}`, allowOverlay: false, displayData: `${currencySymbol}${Math.round(calcPrice(plan))}` };
    }
    offset++;

    // Efforts
    if (col === offset) {
      return { kind: GridCellKind.Text as const, data: `${Math.round(calcEfforts(plan))}`, allowOverlay: false, displayData: `${Math.round(calcEfforts(plan))}` };
    }

    return { kind: GridCellKind.Text as const, data: '', allowOverlay: false, displayData: '' };
  }, [resourcePlans, periodNumbers, currencySymbol, calcPrice, calcEfforts]);

  // Totals (client-safe: price/efforts only, never intCost/margin)
  const totals = useMemo(() => {
    const t = financials.totals;
    return {
      totalPrice: t.price,
      totalEfforts: t.effortHours,
      blendedHourlyRate: t.blendedHourlyRate,
      blendedDailyRate: t.blendedDailyRate,
    };
  }, [financials]);

  // Phase totals (client-safe: price/efforts only, never cost/margin)
  const phaseTotals = useMemo(
    () => financials.phaseTotals.map((pt) => ({ name: pt.name, price: pt.price, efforts: pt.efforts })),
    [financials]
  );

  const handleExportToPNG = () => {
    if (!project || resourcePlans.length === 0) {
      alert('No planning data to export');
      return;
    }
    try {
      const result = buildClientPngExport({
        projectName: project.name || 'project',
        clientCurrency: project.clientCurrency,
        planningMode,
        daysInFTE: project.daysInFTE,
        resourcePlans: resourcePlans.map((p) => ({
          clientRole: p.clientRole || '',
          name: p.name || '',
          clientHourlyRate: p.clientHourlyRate,
          allocations: p.allocations.map((a) => ({
            periodNumber: a.periodNumber,
            allocation: a.allocation,
          })),
        })),
        phases: phases.map((p) => ({
          name: p.name,
          periodCount: p.periodCount ?? 0,
        })),
      });
      if (!result.ok) {
        alert('No planning data to export');
        return;
      }
      downloadClientViewPng(result.model);
    } catch {
      alert('Failed to export to PNG');
    }
  };

  // Client Excel export
  const handleExportToExcel = async () => {
    if (!project || resourcePlans.length === 0) {
      alert('No planning data to export');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Resource Plan');

      const periodLbl = isMonthly ? 'Month' : 'Week';
      const weekNumbers = Array.from({ length: totalPeriods }, (_, i) => i + 1);
      const firstPeriodCol = 5; // columns: Role, Name, Hourly Rate, Daily Rate, then periods

      const hexToArgb = (hex: string): string => {
        const h = hex.replace(/^#/, '');
        if (h.length === 6) return 'FF' + h.toUpperCase();
        if (h.length === 8) return h.toUpperCase();
        return 'FFE8E8E8';
      };

      // Row 1: phase group headers
      const phaseHeaderRow = worksheet.addRow([]);
      let col = firstPeriodCol;
      phases.forEach((phase) => {
        const pc = phase.periodCount ?? 0;
        const endCol = col + pc - 1;
        const phaseColorArgb = phase.color ? hexToArgb(phase.color) : 'FFE8E8E8';
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
        'Role',
        'Name',
        `Hourly Rate (${currencySymbol})`,
        `Daily Rate (${currencySymbol})`,
        ...weekNumbers.map((w) => `${periodLbl} ${w} (%)`),
        `Total Price (${currencySymbol})`,
        'Estimated Efforts (h)',
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      // Data rows
      resourcePlans.forEach((plan) => {
        const clientDailyRate = plan.clientHourlyRate * 8;
        const efforts = calcEfforts(plan);
        const price = calcPrice(plan);
        const rowData = [
          plan.clientRole || '',
          plan.name || '',
          plan.clientHourlyRate,
          clientDailyRate,
          ...weekNumbers.map((weekNum) => {
            const allocation = plan.allocations.find((a) => a.periodNumber === weekNum);
            return allocation?.allocation || 0;
          }),
          price,
          efforts,
        ];
        worksheet.addRow(rowData);
      });

      // Totals row
      const totalsRowData = [
        'TOTALS',
        '',
        '',
        '',
        ...weekNumbers.map(() => ''),
        totals.totalPrice,
        totals.totalEfforts,
      ];
      const totalsRowObj = worksheet.addRow(totalsRowData);
      totalsRowObj.font = { bold: true };
      totalsRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };

      // Phase Summary section
      worksheet.addRow([]);
      const phaseSummaryTitleRow = worksheet.addRow(['Phase Summary']);
      phaseSummaryTitleRow.font = { bold: true };
      const phaseSummaryHeaderRow = worksheet.addRow([
        'Phase',
        `Price (${currencySymbol})`,
        'Estimated Efforts (h)',
      ]);
      phaseSummaryHeaderRow.font = { bold: true };
      phaseSummaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      const clientFmt = project.clientCurrency === 'EUR' ? '€#,##0.00'
        : project.clientCurrency === 'GBP' ? '£#,##0.00' : '$#,##0.00';

      phaseTotals.forEach((pt) => {
        const phaseRow = worksheet.addRow([
          pt.name,
          Math.round(pt.price * 100) / 100,
          Math.round(pt.efforts * 100) / 100,
        ]);
        const r = worksheet.getRow(phaseRow.number);
        if (r.getCell(2).value != null) r.getCell(2).numFmt = clientFmt;
        if (r.getCell(3).value != null) r.getCell(3).numFmt = '#,##0.00';
      });

      // Column number formatting
      const clientCurrencyFormat = project.clientCurrency === 'EUR' ? '€#,##0' :
        project.clientCurrency === 'GBP' ? '£#,##0' : '$#,##0';
      // Hourly & Daily rate columns
      [3, 4].forEach((colIndex) => {
        worksheet.getColumn(colIndex).numFmt = clientCurrencyFormat;
      });
      // Period columns: percentage
      weekNumbers.forEach((_, index) => {
        worksheet.getColumn(firstPeriodCol + index).numFmt = '0"%"';
      });
      // Total Price column
      worksheet.getColumn(firstPeriodCol + weekNumbers.length).numFmt = clientCurrencyFormat;
      // Efforts column
      worksheet.getColumn(firstPeriodCol + weekNumbers.length + 1).numFmt = '0';

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

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resource-plan-${project.name || 'project'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Failed to export to Excel');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">{error || 'Project not found'}</div>
        </div>
      </div>
    );
  }

  if (resourcePlans.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
        {project.description && <p className="text-muted-foreground mb-6">{project.description}</p>}
        <div className="text-center text-muted-foreground py-12">No resource plan data available.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportToExcel} size="sm" variant="outline">
            Export to Excel
          </Button>
          <Button onClick={handleExportToPNG} size="sm" variant="outline">
            Export to PNG
          </Button>
        </div>
      </div>

      {/* Financial Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-5 gap-4">
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
                      <span>Price {currencySymbol}{Math.round(pt.price)}</span>
                      <span>|</span>
                      <span>{Math.round(pt.efforts)}h</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Phases bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <span className="text-sm font-medium text-muted-foreground">Phases:</span>
        {phases.map((phase, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 rounded-md border px-2 py-1"
            style={{ backgroundColor: phase.color ?? PHASE_COLORS[idx % PHASE_COLORS.length] }}
          >
            <span className="px-1 text-sm">{phase.name}</span>
            <span className="text-xs text-muted-foreground">{phase.periodCount ?? 0}{isMonthly ? 'm' : 'w'}</span>
          </div>
        ))}
      </div>

      {/* Data Grid */}
      <div style={{
        height: `${Math.max(200, 72 + (resourcePlans.length * 34) + 20)}px`,
        width: '100%',
        position: 'relative',
      }} className="rounded-lg overflow-hidden border border-gray-200">
        <DataEditor
          getCellContent={getCellContent}
          columns={columns}
          rows={resourcePlans.length}
          getGroupDetails={getGroupDetails}
          groupHeaderHeight={36}
          freezeColumns={2}
          rowMarkers="number"
          smoothScrollX={true}
          smoothScrollY={true}
          overscrollX={0}
          overscrollY={0}
          theme={GRID_THEME}
        />
      </div>
    </div>
  );
}
