import { ReconciliationReport } from '../utils/wbs';
import { formatHours } from '../utils/wbsGrid';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
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
 * Read-only presentational panel for a `ReconciliationReport`: project
 * totals, per-discipline and per-phase-x-discipline variance tables, plus
 * the two gap-bucket callouts (Unassigned WBS items / Unmapped plan rows).
 * All hour figures are computed upstream by `buildReconciliationReport` —
 * this component contains no reconciliation logic of its own.
 */
export function ReconciliationPanel({ report, coverage }: ReconciliationPanelProps) {
  const { projectTotal, byDiscipline, byPhaseDiscipline, phaseLevelAvailable, unassignedWbs, unmappedPlan } = report;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Reconciliation</h2>

      <Card>
        <CardHeader>
          <CardTitle>Project total</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">WBS hours</dt>
              <dd className="text-lg font-semibold">{formatHours(projectTotal.wbsHours)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan hours</dt>
              <dd className="text-lg font-semibold">{formatHours(projectTotal.planHours)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Variance</dt>
              <dd className={cn('text-lg font-semibold', varianceClass(projectTotal.varianceHours))}>
                {formatVariance(projectTotal.varianceHours)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By discipline</CardTitle>
        </CardHeader>
        <CardContent>
          {byDiscipline.length === 0 ? (
            <p className="text-muted-foreground text-sm">No WBS estimates or plan allocations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discipline</TableHead>
                  <TableHead className="text-right">WBS hours</TableHead>
                  <TableHead className="text-right">Plan hours</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDiscipline.map((row) => (
                  <TableRow key={row.discipline}>
                    <TableCell className="font-medium">{row.discipline}</TableCell>
                    <TableCell className="text-right">{formatHours(row.wbsHours)}</TableCell>
                    <TableCell className="text-right">{formatHours(row.planHours)}</TableCell>
                    <TableCell className={cn('text-right font-medium', varianceClass(row.varianceHours))}>
                      {formatVariance(row.varianceHours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By phase &times; discipline</CardTitle>
        </CardHeader>
        <CardContent>
          {!phaseLevelAvailable ? (
            <p className="text-muted-foreground text-sm">
              Not enough phase-assigned data to show a per-phase breakdown yet. Add a project phase (if none exist
              yet) and assign at least one WBS item to it to unlock this view.
            </p>
          ) : byPhaseDiscipline.length === 0 ? (
            <p className="text-muted-foreground text-sm">No phase/discipline pairs have hours on either side yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead className="text-right">WBS hours</TableHead>
                  <TableHead className="text-right">Plan hours</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPhaseDiscipline.map((row, index) => (
                  <TableRow key={`${index}-${row.phaseName}-${row.discipline}`}>
                    <TableCell className="font-medium">{row.phaseName}</TableCell>
                    <TableCell>{row.discipline}</TableCell>
                    <TableCell className="text-right">{formatHours(row.wbsHours)}</TableCell>
                    <TableCell className="text-right">{formatHours(row.planHours)}</TableCell>
                    <TableCell className={cn('text-right font-medium', varianceClass(row.varianceHours))}>
                      {formatVariance(row.varianceHours)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Unassigned (WBS)</CardTitle>
            <Badge variant={unassignedWbs.totalHours > 0 ? 'outline' : 'secondary'}>
              {formatHours(unassignedWbs.totalHours)} h
            </Badge>
          </CardHeader>
          <CardContent>
            {unassignedWbs.byDiscipline.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No unassigned WBS hours. Every estimated item has a live phase.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {unassignedWbs.byDiscipline.map((row) => (
                  <li key={row.discipline} className="flex justify-between">
                    <span>{row.discipline}</span>
                    <span className="font-medium">{formatHours(row.hours)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Unmapped (plan)</CardTitle>
            <Badge variant={unmappedPlan.totalHours > 0 ? 'outline' : 'secondary'}>
              {formatHours(unmappedPlan.totalHours)} h
            </Badge>
          </CardHeader>
          <CardContent>
            {unmappedPlan.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No unmapped plan rows. Every role resolves to a rate-card discipline.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {unmappedPlan.rows.map((row) => (
                  <li key={row.resourcePlanId} className="flex justify-between">
                    <span>{row.role}</span>
                    <span className="font-medium">{formatHours(row.hours)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {coverage && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Unplaced (WBS)</CardTitle>
              <Badge variant={coverage.unplacedHours > 0 ? 'outline' : 'secondary'}>
                {formatHours(coverage.unplacedHours)} h · {(coverage.unplacedShare * 100).toFixed(0)}%
              </Badge>
            </CardHeader>
            <CardContent>
              {coverage.unplaced.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No unplaced WBS hours. Every estimated node has an effective roadmap item.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {coverage.unplaced.map((row) => (
                    <li key={row.wbsItemId} className="flex justify-between">
                      <span className="truncate">{row.name}</span>
                      <span className="font-medium">{formatHours(row.hours)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Empty (roadmap)</CardTitle>
              <Badge variant={coverage.empty.length > 0 ? 'outline' : 'secondary'}>{coverage.empty.length}</Badge>
            </CardHeader>
            <CardContent>
              {coverage.empty.length === 0 ? (
                <p className="text-muted-foreground text-sm">No bars without scope.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {coverage.empty.map((row) => (
                    <li key={row.roadmapItemId} className="truncate">
                      {row.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Phase mismatch</CardTitle>
              <Badge variant={coverage.phaseMismatch.length > 0 ? 'outline' : 'secondary'}>
                {coverage.phaseMismatch.length}
              </Badge>
            </CardHeader>
            <CardContent>
              {coverage.phaseMismatch.length === 0 ? (
                <p className="text-muted-foreground text-sm">Every linked leaf's phase overlaps its item's window.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {coverage.phaseMismatch.map((row, index) => (
                    <li key={`${index}-${row.roadmapItemId}-${row.wbsItemId}`} className="truncate">
                      <span className="font-medium">{row.itemName}</span> · {row.leafName} · {row.phaseName}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
