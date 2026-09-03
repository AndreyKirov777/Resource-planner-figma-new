import { useState } from 'react';
import { Check } from 'lucide-react';
import { ReconciliationReport, PhaseDisciplineVariance } from '../utils/wbs';
import { formatHours } from '../utils/wbsGrid';
import { ByPeriodMatrix, RoadmapLoadDimension } from '../utils/roadmapLoad';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { cn } from './ui/utils';

/**
 * Display-ready shape for the three roadmap coverage cards (CAP-7) — names
 * already resolved, so this file stays presentational (per its own doc
 * comment below: no reconciliation logic of its own). The caller derives
 * this from `coverage()` in `utils/roadmap.ts` plus a WBS/roadmap-item name
 * lookup; `Wbs.tsx` is the current caller.
 */
export interface RoadmapCoverageDisplay {
  unplaced: { wbsItemId: number; name: string; hours: number }[];
  unplacedHours: number;
  unplacedShare: number;
  empty: { roadmapItemId: number; name: string }[];
  phaseMismatch: {
    roadmapItemId: number;
    itemName: string;
    wbsItemId: number;
    leafName: string;
    phaseName: string;
  }[];
}

interface ReconciliationPanelProps {
  report: ReconciliationReport;
  /** Roadmap coverage cards (CAP-7) — omitted entirely when the roadmap payload isn't loaded yet. */
  coverage?: RoadmapCoverageDisplay;
  /** CAP-10's by-period section — both dimensions precomputed by `buildByPeriodMatrix`, toggled locally. Omitted while the roadmap payload isn't loaded yet, same as `coverage`. */
  byPeriodRoleMatrix?: ByPeriodMatrix;
  byPeriodDisciplineMatrix?: ByPeriodMatrix;
  /** True when the roadmap is empty, so the section renders from the WBS phase baseline alone — a caption says so. */
  byPeriodPhaseBaselineOnly?: boolean;
}

// Hour figures are sums of many floating-point terms; treat anything below this as
// zero so summation noise (e.g. 4.5e-13) can't render as a colored non-zero variance.
const VARIANCE_EPSILON = 1e-6;

function varianceClass(hours: number): string {
  if (!Number.isFinite(hours) || Math.abs(hours) < VARIANCE_EPSILON) return 'text-muted-foreground';
  return hours > 0 ? 'text-amber-600' : 'text-red-600';
}

function formatVariance(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  const normalized = Math.abs(hours) < VARIANCE_EPSILON ? 0 : hours;
  return `${normalized > 0 ? '+' : ''}${formatHours(normalized)}`;
}

/** Visible text for a delta-only cell: a middle dot when the variance is neutral, `formatVariance` otherwise. */
function deltaText(hours: number): string {
  if (!Number.isFinite(hours) || Math.abs(hours) < VARIANCE_EPSILON) return '·';
  return formatVariance(hours);
}

function maxAbsVariance(values: number[]): number {
  return values.reduce((max, v) => (Number.isFinite(v) ? Math.max(max, Math.abs(v)) : max), 0);
}

/**
 * One-line summary of a report — `WBS 128 h · Plan 96 h · +32` — for the
 * collapsed panel's trigger, so the headline numbers stay visible without
 * expanding it. Reuses the panel's own formatting so the strip and the tables
 * can never disagree.
 */
export function reconciliationSummary(report: ReconciliationReport): string {
  const { wbsHours, planHours, varianceHours } = report.projectTotal;
  return `WBS ${formatHours(wbsHours)} h · Plan ${formatHours(planHours)} h · ${formatVariance(varianceHours)}`;
}

/**
 * Pivots the flat `byPhaseDiscipline` list into a phase x discipline grid for
 * the heatmap. Phase columns keep first-seen order (which is already project
 * order, since `wbs.ts` emits `byPhaseDiscipline` iterating `phases` in array
 * order); discipline rows keep `byDiscipline`'s order (alphabetical). A
 * discipline with no cell anywhere in `byPhaseDiscipline` is dropped rather
 * than rendered as an all-empty row.
 */
export function pivotPhaseDiscipline(
  report: ReconciliationReport
): { phases: string[]; rows: { discipline: string; cells: (PhaseDisciplineVariance | null)[] }[] } {
  const phases: string[] = [];
  const seenPhases = new Set<string>();
  // Nested by phase then discipline — a joined string key (`"${phase} ${discipline}"`)
  // is forgeable: phase "Detail design" + discipline "MEP" collides with phase
  // "Detail" + discipline "design MEP". Both are free text, so no separator is safe.
  const cellByPhase = new Map<string, Map<string, PhaseDisciplineVariance>>();

  report.byPhaseDiscipline.forEach((row) => {
    if (!seenPhases.has(row.phaseName)) {
      seenPhases.add(row.phaseName);
      phases.push(row.phaseName);
    }
    const byDiscipline = cellByPhase.get(row.phaseName) ?? new Map<string, PhaseDisciplineVariance>();
    byDiscipline.set(row.discipline, row);
    cellByPhase.set(row.phaseName, byDiscipline);
  });

  const rows = report.byDiscipline
    .map((d) => ({
      discipline: d.discipline,
      cells: phases.map((phase) => cellByPhase.get(phase)?.get(d.discipline) ?? null),
    }))
    .filter((row) => row.cells.some((c) => c !== null));

  return { phases, rows };
}

/**
 * Inline background style for a delta-only cell: transparent below the
 * epsilon, otherwise amber (positive) or red (negative) at an alpha that
 * ramps from 0.08 (barely there) to 0.28 (strongest) as `|hours| / maxAbs`
 * goes from 0 to 1, so magnitude is actually visible across the heatmap
 * rather than every cell past a threshold looking identical.
 */
export function varianceTint(hours: number, maxAbs: number): { backgroundColor?: string } {
  if (!Number.isFinite(hours) || Math.abs(hours) < VARIANCE_EPSILON) return {};
  const rawRatio = maxAbs > 0 && Number.isFinite(maxAbs) ? Math.abs(hours) / maxAbs : 1;
  const ratio = Math.min(1, Math.max(0, rawRatio));
  const alpha = 0.08 + ratio * 0.2;
  const [r, g, b] = hours > 0 ? [245, 158, 11] : [239, 68, 68]; // amber-500 / red-500
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})` };
}

/**
 * Bullet-bar geometry for one *By discipline* row, as percentages of
 * `rowMax` (the largest wbs/plan hours across all visible rows): the grey
 * WBS track, the indigo plan fill (clamped to the track — plan can't visually
 * exceed the estimate), and the red overhang starting exactly at the track's
 * edge when plan exceeds WBS.
 */
export function bulletBarWidths(
  row: { wbsHours: number; planHours: number },
  rowMax: number
): { track: number; fill: number; over: number } {
  const safeMax = rowMax > 0 && Number.isFinite(rowMax) ? rowMax : 1;
  return {
    track: (row.wbsHours / safeMax) * 100,
    fill: (Math.min(row.planHours, row.wbsHours) / safeMax) * 100,
    over: (Math.max(row.planHours - row.wbsHours, 0) / safeMax) * 100,
  };
}

function StatusChip({ label, clear, detail }: { label: string; clear: boolean; detail: string }) {
  return (
    <Badge
      variant={clear ? 'secondary' : 'outline'}
      className={cn('gap-1', !clear && 'border-amber-300 bg-amber-50 text-amber-700')}
      title={clear ? `${label}: none` : `${label}: ${detail}`}
    >
      {clear && <Check className="size-3" aria-hidden="true" />}
      <span>{label}</span>
      {/* The visible detail span already states the count/hours for a problem
          bucket, but a clear bucket has nothing visible beyond the label — and
          `title` isn't reliably announced — so a screen reader would say
          "Unassigned" identically for clean and problem states. This sr-only
          span puts the state into the accessible name itself. */}
      {clear ? <span className="sr-only">, clear</span> : <span className="font-normal">{detail}</span>}
    </Badge>
  );
}

/**
 * The five gap-bucket status chips (Unassigned/Unmapped always; Unplaced/
 * Empty/Phase-mismatch only once the roadmap coverage payload is loaded).
 * Shared by the health strip inside the expanded panel and by `Wbs.tsx`'s
 * collapsed trigger row, so problems are visible without expanding.
 */
export function ReconciliationChips({
  report,
  coverage,
}: {
  report: ReconciliationReport;
  coverage?: RoadmapCoverageDisplay;
}) {
  const { unassignedWbs, unmappedPlan } = report;
  // Same "is this bucket empty" rule the panel's "Open issues" card gates its
  // subsections with (list length, not a hours/epsilon check) — otherwise a
  // discipline entry that happens to sum to ~0 hours can show a clear chip
  // above a populated card, or vice versa.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusChip
        label="Unassigned"
        clear={unassignedWbs.byDiscipline.length === 0}
        detail={`${formatHours(unassignedWbs.totalHours)} h`}
      />
      <StatusChip
        label="Unmapped"
        clear={unmappedPlan.rows.length === 0}
        detail={`${formatHours(unmappedPlan.totalHours)} h`}
      />
      {coverage && (
        <>
          <StatusChip
            label="Unplaced"
            clear={coverage.unplaced.length === 0}
            detail={`${formatHours(coverage.unplacedHours)} h`}
          />
          <StatusChip label="Empty" clear={coverage.empty.length === 0} detail={`${coverage.empty.length}`} />
          {/* "Mismatch", not "Phase mismatch" — the Open-issues subsection below is
              titled "Phase mismatch" verbatim, and the two must stay distinguishable
              text for `getByText` queries when both are on screen at once. */}
          <StatusChip
            label="Mismatch"
            clear={coverage.phaseMismatch.length === 0}
            detail={`${coverage.phaseMismatch.length}`}
          />
        </>
      )}
    </div>
  );
}

/**
 * Read-only presentational panel for a `ReconciliationReport`: a health strip
 * (figures, coverage bar, gap-bucket chips), an "Open issues" block that only
 * appears when something is actually off, and the per-discipline bullet bars,
 * phase x discipline heatmap and by-period matrix. All hour figures are
 * computed upstream by `buildReconciliationReport` — this component contains
 * no reconciliation logic of its own beyond the two pure helpers above.
 */
export function ReconciliationPanel({
  report,
  coverage,
  byPeriodRoleMatrix,
  byPeriodDisciplineMatrix,
  byPeriodPhaseBaselineOnly,
}: ReconciliationPanelProps) {
  const { projectTotal, byDiscipline, phaseLevelAvailable, unassignedWbs, unmappedPlan } = report;
  const [byPeriodDimension, setByPeriodDimension] = useState<RoadmapLoadDimension>('role');
  const byPeriodMatrix = byPeriodDimension === 'discipline' ? byPeriodDisciplineMatrix : byPeriodRoleMatrix;

  // Uncapped for the caption (an over-planned project should read "212%", not a
  // false "100%"); capped separately for the bar, which has no way to draw past
  // its own width.
  const rawCoveragePct =
    projectTotal.wbsHours > 0 && Number.isFinite(projectTotal.wbsHours) && Number.isFinite(projectTotal.planHours)
      ? (projectTotal.planHours / projectTotal.wbsHours) * 100
      : null;
  const coverageBarPct = rawCoveragePct !== null ? Math.max(0, Math.min(100, rawCoveragePct)) : null;

  // A plain WBS-vs-plan gap is reported by the strip's figures and the bullet
  // bars, not by this list — project/discipline variance is deliberately NOT
  // part of `hasIssues`. Only the five gap buckets (which the strip's chips
  // also reflect) can open this card, and each subsection below only renders
  // when ITS OWN bucket is non-empty — nothing in this card is ever a
  // zero-state message.
  const unassignedHasIssues = unassignedWbs.byDiscipline.length > 0;
  const unmappedHasIssues = unmappedPlan.rows.length > 0;
  const coverageHasIssues =
    coverage != null && (coverage.unplaced.length > 0 || coverage.empty.length > 0 || coverage.phaseMismatch.length > 0);
  const hasIssues = unassignedHasIssues || unmappedHasIssues || coverageHasIssues;

  // Same finiteness guard as `maxAbsVariance` (reused, not reimplemented): a
  // non-finite wbsHours/planHours must not turn rowMax into NaN, which would
  // fall through `|| 1`'s falsy check (NaN is falsy) and render `width:
  // "NaN%"` for every bar.
  const rowMax = maxAbsVariance(byDiscipline.flatMap((r) => [r.wbsHours, r.planHours])) || 1;

  const pivot = pivotPhaseDiscipline(report);
  const maxAbsPhaseVariance = maxAbsVariance(
    pivot.rows.flatMap((row) => row.cells.filter((c): c is PhaseDisciplineVariance => c !== null).map((c) => c.varianceHours))
  );

  const maxAbsPeriodVariance = byPeriodMatrix
    ? maxAbsVariance([
        ...byPeriodMatrix.rows.flatMap((r) => r.cells.map((c) => c.variance)),
        ...byPeriodMatrix.rows.map((r) => r.total.variance),
        ...byPeriodMatrix.totalRow.cells.map((c) => c.variance),
        byPeriodMatrix.totalRow.total.variance,
      ])
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Reconciliation</h2>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4 md:gap-6">
          <dl className="flex items-center gap-4 md:gap-6">
            <div>
              <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">WBS</dt>
              <dd className="text-lg font-semibold">
                <span>{formatHours(projectTotal.wbsHours)}</span>{' '}
                <span className="text-muted-foreground text-xs font-normal">h</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Plan</dt>
              <dd className="text-lg font-semibold">
                <span>{formatHours(projectTotal.planHours)}</span>{' '}
                <span className="text-muted-foreground text-xs font-normal">h</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Variance</dt>
              <dd className={cn('text-lg font-semibold', varianceClass(projectTotal.varianceHours))}>
                <span>{formatVariance(projectTotal.varianceHours)}</span>
              </dd>
            </div>
          </dl>

          <div className="bg-border h-9 w-px shrink-0" />

          <div className="min-w-40 flex-1">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              {coverageBarPct !== null && (
                <div className="h-full rounded-full bg-indigo-600" style={{ width: `${coverageBarPct}%` }} />
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {rawCoveragePct !== null
                ? `Plan covers ${Math.round(rawCoveragePct)}% of the WBS estimate`
                : 'No WBS estimate yet to cover'}
            </p>
          </div>

          <div className="bg-border h-9 w-px shrink-0" />

          <ReconciliationChips report={report} coverage={coverage} />
        </CardContent>
      </Card>

      {hasIssues && (
        <Card>
          <CardHeader>
            <CardTitle>Open issues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(unassignedHasIssues || unmappedHasIssues) && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {unassignedHasIssues && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-medium">Unassigned (WBS)</h4>
                      <Badge variant="outline">{formatHours(unassignedWbs.totalHours)} h</Badge>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {unassignedWbs.byDiscipline.map((row) => (
                        <li key={row.discipline} className="flex justify-between">
                          <span>{row.discipline}</span>
                          <span className="font-medium">{formatHours(row.hours)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {unmappedHasIssues && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-medium">Unmapped (plan)</h4>
                      <Badge variant="outline">{formatHours(unmappedPlan.totalHours)} h</Badge>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {unmappedPlan.rows.map((row) => (
                        <li key={row.resourcePlanId} className="flex justify-between">
                          <span>{row.role}</span>
                          <span className="font-medium">{formatHours(row.hours)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {coverageHasIssues && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {coverage!.unplaced.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-medium">Unplaced (WBS)</h4>
                      <Badge variant="outline">
                        {formatHours(coverage!.unplacedHours)} h · {(coverage!.unplacedShare * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {coverage!.unplaced.map((row) => (
                        <li key={row.wbsItemId} className="flex justify-between">
                          <span className="truncate">{row.name}</span>
                          <span className="font-medium">{formatHours(row.hours)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {coverage!.empty.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-medium">Empty (roadmap)</h4>
                      <Badge variant="outline">{coverage!.empty.length}</Badge>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {coverage!.empty.map((row) => (
                        <li key={row.roadmapItemId} className="truncate">
                          {row.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {coverage!.phaseMismatch.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-medium">Phase mismatch</h4>
                      <Badge variant="outline">{coverage!.phaseMismatch.length}</Badge>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {coverage!.phaseMismatch.map((row, index) => (
                        <li key={`${index}-${row.roadmapItemId}-${row.wbsItemId}`} className="truncate">
                          <span className="font-medium">{row.itemName}</span> · {row.leafName} · {row.phaseName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>By discipline</CardTitle>
          {byDiscipline.length > 0 && (
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="bg-muted-foreground/30 h-2 w-2 rounded-full" aria-hidden="true" />
                WBS
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-600" aria-hidden="true" />
                Plan
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {byDiscipline.length === 0 ? (
            <p className="text-muted-foreground text-sm">No WBS estimates or plan allocations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discipline</TableHead>
                  <TableHead>WBS / Plan</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDiscipline.map((row) => {
                  const { track, fill, over } = bulletBarWidths(row, rowMax);
                  return (
                    <TableRow key={row.discipline}>
                      <TableCell className="font-medium">{row.discipline}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                            {formatHours(row.wbsHours)} / {formatHours(row.planHours)}
                          </span>
                          <div
                            className="bg-muted relative h-2 flex-1 rounded-full"
                            title={`WBS ${formatHours(row.wbsHours)} h · Plan ${formatHours(row.planHours)} h`}
                          >
                            <div
                              className="bg-muted-foreground/30 absolute inset-y-0 left-0 rounded-full"
                              style={{ width: `${track}%` }}
                            />
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-indigo-600"
                              style={{ width: `${fill}%` }}
                            />
                            {over > 0 && (
                              <div
                                className="absolute inset-y-0 rounded-full bg-red-500"
                                style={{ left: `${track}%`, width: `${over}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn('text-right font-medium tabular-nums', varianceClass(row.varianceHours))}>
                        {formatVariance(row.varianceHours)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>By phase &times; discipline</CardTitle>
          {phaseLevelAvailable && pivot.rows.length > 0 && (
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                Over-planned
              </span>
              <span className="flex items-center gap-1">
                <span className="bg-muted-foreground/30 h-2 w-2 rounded-full" aria-hidden="true" />
                Balanced
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                Under-planned
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!phaseLevelAvailable ? (
            <p className="text-muted-foreground text-sm">
              Not enough phase-assigned data to show a per-phase breakdown yet. Add a project phase (if none exist
              yet) and assign at least one WBS item to it to unlock this view.
            </p>
          ) : pivot.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No phase/discipline pairs have hours on either side yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Discipline</TableHead>
                    {pivot.phases.map((phase) => (
                      <TableHead key={phase} className="text-right">
                        {phase}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivot.rows.map((row) => (
                    <TableRow key={row.discipline}>
                      <TableCell className="font-medium">{row.discipline}</TableCell>
                      {row.cells.map((cell, i) => (
                        <TableCell
                          key={i}
                          className={cn(
                            'text-right tabular-nums',
                            cell ? varianceClass(cell.varianceHours) : 'text-muted-foreground'
                          )}
                          style={cell ? varianceTint(cell.varianceHours, maxAbsPhaseVariance) : undefined}
                          title={
                            cell ? `WBS ${formatHours(cell.wbsHours)} h · Plan ${formatHours(cell.planHours)} h` : undefined
                          }
                        >
                          {cell ? (
                            <>
                              {deltaText(cell.varianceHours)}
                              <span className="sr-only">{`${formatHours(cell.wbsHours)}/${formatHours(cell.planHours)}`}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {byPeriodMatrix && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>By period</CardTitle>
            <ToggleGroup
              type="single"
              size="sm"
              value={byPeriodDimension}
              onValueChange={(v) => v && setByPeriodDimension(v as RoadmapLoadDimension)}
              aria-label="By-period dimension"
            >
              <ToggleGroupItem value="role">Role</ToggleGroupItem>
              <ToggleGroupItem value="discipline">Discipline</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {byPeriodPhaseBaselineOnly && (
              <p className="text-muted-foreground mb-2 text-xs">
                No roadmap yet — figures are the WBS phase baseline (each item's own hours spread over its phase).
              </p>
            )}
            {byPeriodMatrix.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No demand or supply on either side yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{byPeriodDimension === 'discipline' ? 'Discipline' : 'Role'}</TableHead>
                      {byPeriodMatrix.periods.map((period) => (
                        <TableHead key={period} className="text-right" data-testid={`by-period-col-${period}`}>
                          W{period}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byPeriodMatrix.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.key || '(none)'}</TableCell>
                        {row.cells.map((cell, i) => (
                          <TableCell
                            key={i}
                            className={cn('text-right tabular-nums', varianceClass(cell.variance))}
                            style={varianceTint(cell.variance, maxAbsPeriodVariance)}
                            title={`${formatHours(cell.demand)}/${formatHours(cell.supply)}`}
                          >
                            {deltaText(cell.variance)}
                            <span className="sr-only">{`${formatHours(cell.demand)}/${formatHours(cell.supply)}`}</span>
                          </TableCell>
                        ))}
                        <TableCell
                          className={cn('text-right font-medium tabular-nums', varianceClass(row.total.variance))}
                          style={varianceTint(row.total.variance, maxAbsPeriodVariance)}
                          title={`${formatHours(row.total.demand)}/${formatHours(row.total.supply)}`}
                        >
                          {deltaText(row.total.variance)}
                          <span className="sr-only">{`${formatHours(row.total.demand)}/${formatHours(row.total.supply)}`}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      {byPeriodMatrix.totalRow.cells.map((cell, i) => (
                        <TableCell
                          key={i}
                          className={cn('text-right tabular-nums', varianceClass(cell.variance))}
                          style={varianceTint(cell.variance, maxAbsPeriodVariance)}
                          title={`${formatHours(cell.demand)}/${formatHours(cell.supply)}`}
                        >
                          {deltaText(cell.variance)}
                          <span className="sr-only">{`${formatHours(cell.demand)}/${formatHours(cell.supply)}`}</span>
                        </TableCell>
                      ))}
                      <TableCell
                        className={cn('text-right tabular-nums', varianceClass(byPeriodMatrix.totalRow.total.variance))}
                        style={varianceTint(byPeriodMatrix.totalRow.total.variance, maxAbsPeriodVariance)}
                        title={`${formatHours(byPeriodMatrix.totalRow.total.demand)}/${formatHours(byPeriodMatrix.totalRow.total.supply)}`}
                      >
                        {deltaText(byPeriodMatrix.totalRow.total.variance)}
                        <span className="sr-only">{`${formatHours(byPeriodMatrix.totalRow.total.demand)}/${formatHours(byPeriodMatrix.totalRow.total.supply)}`}</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
