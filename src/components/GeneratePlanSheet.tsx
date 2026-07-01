import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from './ui/sheet';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { cn } from './ui/utils';
import {
  api,
  Phase,
  GeneratePlanRegion,
  GeneratePlanResponse,
  GeneratePlanResourcePlan,
  GeneratePlanDraft,
} from '../services/api';
import { PHASE_COLORS, getPhaseForPeriod, descriptionSuggestsPhaseProposal, isPlaceholderSinglePhase, parsePhasesFromDescription } from '../utils/phases';
import { GENERATE_PLAN_REGIONS } from '../utils/regions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGIONS = GENERATE_PLAN_REGIONS;

// Allocation bar heights (px) per snapped % value
const ALLOC_HEIGHTS: Record<number, number> = {
  0: 2,
  25: 7,
  50: 13,
  75: 18,
  100: 24,
};

// Allocation timeline layout (shared by bar renderer and sheet width)
const ALLOC_BAR_W = 6;
const ALLOC_BAR_GAP = 2;
const ALLOC_GROUP_GAP = 6;
const ALLOC_HEADER_H = 28;
const ALLOC_BAR_MAX = 24;
// Floor width per phase so even a 1-week phase can show its "Nw" label / name.
const ALLOC_MIN_BAND = 18;

// Width of just the bars for a phase (no group gap).
function phaseBarsWidth(weekCount: number): number {
  return weekCount > 0
    ? weekCount * (ALLOC_BAR_W + ALLOC_BAR_GAP) - ALLOC_BAR_GAP
    : 0;
}

// Rendered width of a phase band: wide enough for its bars OR its label.
function phaseBandWidth(weekCount: number): number {
  return Math.max(phaseBarsWidth(weekCount), ALLOC_MIN_BAND);
}

function computeAllocTimelineWidth(phases: Phase[]): number {
  let totalWidth = 0;
  phases.forEach((ph, idx) => {
    totalWidth += phaseBandWidth(ph.periodCount ?? 0);
    if (idx < phases.length - 1) totalWidth += ALLOC_GROUP_GAP;
  });
  return totalWidth;
}

// Proposed-plan sheet width: padding + role + rates + allocation column.
const RESULT_SHEET_ROLE_COL = 240;
const RESULT_SHEET_ROLE_MIN = 150; // role col may shrink this far before we scroll
const RESULT_SHEET_INT_RATE_COL = 72;
const RESULT_SHEET_CLIENT_RATE_COL = 80;
const RESULT_SHEET_H_PADDING = 32; // scroll area p-4 (left + right)
const RESULT_SHEET_SCROLLBAR_GUTTER = 16; // reserved by scrollbarGutter: 'stable'
const RESULT_SHEET_ALLOC_PADDING = 12; // allocation cell pl-3 (left)
const RESULT_SHEET_ALLOC_TRAILING = 12; // breathing room right of the timeline

// Allocation column = left padding + timeline width + trailing breathing room.
function computeAllocColWidth(phases: Phase[]): number {
  return (
    RESULT_SHEET_ALLOC_PADDING +
    computeAllocTimelineWidth(phases) +
    RESULT_SHEET_ALLOC_TRAILING
  );
}

// Natural table width (all four columns, no outer chrome).
function computeResultTableWidth(phases: Phase[]): number {
  return (
    RESULT_SHEET_ROLE_COL +
    RESULT_SHEET_INT_RATE_COL +
    RESULT_SHEET_CLIENT_RATE_COL +
    computeAllocColWidth(phases)
  );
}

// Full sheet width = table + horizontal padding + reserved scrollbar gutter, so
// the whole allocation timeline stays visible without clipping at the edge.
function computeResultSheetWidth(phases: Phase[]): number {
  return (
    computeResultTableWidth(phases) +
    RESULT_SHEET_H_PADDING +
    RESULT_SHEET_SCROLLBAR_GUTTER
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapAllocation(pct: number): number {
  const snaps = [0, 25, 50, 75, 100];
  return snaps.reduce((prev, curr) =>
    Math.abs(curr - pct) < Math.abs(prev - pct) ? curr : prev,
  );
}

function barHeightPx(pct: number): number {
  return ALLOC_HEIGHTS[snapAllocation(pct)] ?? 2;
}

// ---------------------------------------------------------------------------
// Allocation timeline sub-component
// ---------------------------------------------------------------------------

interface AllocTimelineProps {
  plan: GeneratePlanResourcePlan;
  phases: Phase[];
}

function AllocTimeline({ plan, phases }: AllocTimelineProps) {
  const sortedAllocs = [...plan.allocations].sort(
    (a, b) => a.periodNumber - b.periodNumber,
  );

  if (sortedAllocs.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  // Compute phase bands for header
  const phaseBands: Array<{ name: string; weekCount: number; color: string }> = phases.map(
    (ph, idx) => ({
      name: ph.name,
      weekCount: ph.periodCount ?? 0,
      color: ph.color ?? PHASE_COLORS[idx % PHASE_COLORS.length],
    }),
  );

  // Build aria label for accessibility
  const ariaLabel = phaseBands
    .map((band, idx) => {
      const start = phaseBands.slice(0, idx).reduce((s, b) => s + b.weekCount, 0) + 1;
      const end = start + band.weekCount - 1;
      const bandsAllocs = sortedAllocs.filter((a) => {
        const { phaseIndex } = getPhaseForPeriod(a.periodNumber, phases);
        return phaseIndex === idx;
      });
      if (bandsAllocs.length === 0) return null;
      const avgPct = Math.round(
        bandsAllocs.reduce((s, a) => s + snapAllocation(a.allocation), 0) / bandsAllocs.length,
      );
      return `${band.name} wk${start}–${end}: ${avgPct}%`;
    })
    .filter(Boolean)
    .join('; ');

  const totalWidth = computeAllocTimelineWidth(phases);

  return (
    <div aria-label={ariaLabel} role="img" className="inline-block">
      <div style={{ minWidth: `${totalWidth}px` }}>
        {/* Phase header: week-count row then phase-name bands */}
        <div className="flex items-end mb-0.5" style={{ height: `${ALLOC_HEADER_H}px` }}>
          {phaseBands.map((band, idx) => {
            const bandWidth =
              phaseBandWidth(band.weekCount) +
              (idx < phaseBands.length - 1 ? ALLOC_GROUP_GAP : 0);
            return (
              <div
                key={band.name}
                style={{
                  width: `${bandWidth}px`,
                  flexShrink: 0,
                }}
              >
                {/* Week count */}
                <div
                  className="text-muted-foreground overflow-hidden"
                  style={{ fontSize: '9px', lineHeight: '10px', whiteSpace: 'nowrap' }}
                >
                  {band.weekCount}w
                </div>
                {/* Phase name band */}
                <div
                  className="overflow-hidden"
                  style={{
                    background: band.color,
                    borderRadius: '5px',
                    height: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '3px',
                    marginTop: '2px',
                  }}
                >
                  <span
                    className="overflow-hidden"
                    style={{
                      fontSize: '8px',
                      lineHeight: '10px',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      color: '#444',
                      maxWidth: '100%',
                    }}
                  >
                    {band.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bars */}
        <div className="flex items-end" style={{ height: `${ALLOC_BAR_MAX + 2}px` }}>
          {phaseBands.map((band, phaseIdx) => {
            const weekStart =
              phaseBands.slice(0, phaseIdx).reduce((s, b) => s + b.weekCount, 0) + 1;
            const weekNums = Array.from(
              { length: band.weekCount },
              (_, i) => weekStart + i,
            );
            return (
              <React.Fragment key={phaseIdx}>
                {/* Band container floors at ALLOC_MIN_BAND; bars left-align inside
                    so they stay aligned with the wider header band. */}
                <div
                  className="flex items-end"
                  style={{ width: `${phaseBandWidth(band.weekCount)}px`, flexShrink: 0 }}
                >
                  {weekNums.map((weekNum, wIdx) => {
                    const alloc = sortedAllocs.find((a) => a.periodNumber === weekNum);
                    const pct = alloc ? alloc.allocation : 0;
                    const snapped = snapAllocation(pct);
                    const h = barHeightPx(pct);
                    const isZero = snapped === 0;
                    return (
                      <div
                        key={weekNum}
                        style={{
                          width: `${ALLOC_BAR_W}px`,
                          height: `${h}px`,
                          background: isZero ? '#d4d4d8' : '#52525b',
                          borderRadius: '2px',
                          flexShrink: 0,
                          marginRight: wIdx < weekNums.length - 1 ? `${ALLOC_BAR_GAP}px` : 0,
                        }}
                        title={`Wk ${weekNum}: ${snapped}%`}
                      />
                    );
                  })}
                </div>
                {phaseIdx < phaseBands.length - 1 && (
                  <div style={{ width: `${ALLOC_GROUP_GAP}px`, flexShrink: 0 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GeneratePlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: number;
  phases?: Phase[];
  planningMode?: string;
  onAcceptPlan?: (draft: GeneratePlanDraft) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GeneratePlanSheet({
  open,
  onOpenChange,
  projectId,
  phases: propPhases,
  planningMode: _planningMode,
  onAcceptPlan,
}: GeneratePlanSheetProps) {
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState<GeneratePlanRegion>('ukraine');
  const [applyProposedPhases, setApplyProposedPhases] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratePlanResponse | null>(null);

  const abortController = useRef<AbortController | null>(null);

  // Default phase proposal on for placeholder timelines; auto-enable when description asks.
  useEffect(() => {
    if (!open) return;
    if (propPhases && isPlaceholderSinglePhase(propPhases)) {
      setApplyProposedPhases(true);
    }
  }, [open, propPhases]);

  useEffect(() => {
    if (descriptionSuggestsPhaseProposal(description) || parsePhasesFromDescription(description).length >= 2) {
      setApplyProposedPhases(true);
    }
  }, [description]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function resetState() {
    setDescription('');
    setRegion('ukraine');
    setApplyProposedPhases(false);
    setLoading(false);
    setAccepting(false);
    setError(null);
    setResult(null);
    abortController.current = null;
  }

  // Intercept open-change: during loading, abort instead of closing
  function handleOpenChange(open: boolean) {
    if (!open && loading) {
      abortController.current?.abort();
      // loading clears in the catch handler; do NOT close the sheet
      return;
    }
    if (!open) resetState();
    onOpenChange(open);
  }

  // -------------------------------------------------------------------------
  // Generate handler
  // -------------------------------------------------------------------------

  async function handleGenerate() {
    const ac = new AbortController();
    abortController.current = ac;
    setLoading(true);
    setError(null);
    const effectiveApplyPhases =
      applyProposedPhases || descriptionSuggestsPhaseProposal(description.trim());
    try {
      const response = await api.generatePlan(
        {
          mode: 'current',
          projectId,
          description,
          region,
          applyProposedPhases: effectiveApplyPhases,
        },
        ac.signal,
      );
      setResult(response);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // cancelled — restore form silently (no error)
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      abortController.current = null;
    }
  }

  async function handleAccept() {
    if (!result || !onAcceptPlan) return;
    setAccepting(true);
    setError(null);
    try {
      await onAcceptPlan({
        ...result.draft,
        region: result.draft.region ?? region,
      });
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply plan');
    } finally {
      setAccepting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Phase resolution for the allocation timeline
  // -------------------------------------------------------------------------

  const resolvedPhases = useMemo((): Phase[] => {
    if (result?.draft?.phases && result.draft.phases.length > 0) {
      return result.draft.phases.map((p, idx) => ({
        name: p.name,
        periodCount: p.periodCount ?? 0,
        color: PHASE_COLORS[idx % PHASE_COLORS.length],
      }));
    }
    if (propPhases && propPhases.length > 0) {
      return propPhases;
    }
    // Fallback: single band covering all periods
    const allPeriods =
      result?.draft?.resourcePlans?.flatMap((rp) =>
        rp.allocations.map((a) => a.periodNumber),
      ) ?? [];
    const total = allPeriods.length > 0 ? Math.max(...allPeriods) : 8;
    return [{ name: 'Plan', periodCount: total, color: PHASE_COLORS[0] }];
  }, [result, propPhases]);

  const resultSheetExactWidth = useMemo(
    () => (result ? computeResultSheetWidth(resolvedPhases) : undefined),
    [result, resolvedPhases],
  );

  const resultSheetWidth = useMemo(() => {
    if (resultSheetExactWidth == null) return undefined;
    const viewportCap =
      typeof window !== 'undefined'
        ? Math.floor(window.innerWidth * 0.92)
        : 1200;
    return Math.min(viewportCap, resultSheetExactWidth);
  }, [resultSheetExactWidth]);

  const resultTableWidth = useMemo(
    () => (result ? computeResultTableWidth(resolvedPhases) : undefined),
    [result, resolvedPhases],
  );

  const allocColWidth = useMemo(
    () => computeAllocColWidth(resolvedPhases),
    [resolvedPhases],
  );

  // Space the table actually gets inside the (possibly 92vw-capped) sheet.
  const availableTableWidth = useMemo(
    () =>
      resultSheetWidth != null
        ? resultSheetWidth - RESULT_SHEET_H_PADDING - RESULT_SHEET_SCROLLBAR_GUTTER
        : undefined,
    [resultSheetWidth],
  );

  // Smallest table that still shows the allocation timeline in full — the role
  // column absorbs any shortfall down to its minimum before we ever scroll.
  const minTableWidth =
    RESULT_SHEET_ROLE_MIN +
    RESULT_SHEET_INT_RATE_COL +
    RESULT_SHEET_CLIENT_RATE_COL +
    allocColWidth;

  const tableNeedsHorizontalScroll =
    availableTableWidth != null && availableTableWidth < minTableWidth;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        fitWidth={result != null}
        className={cn(
          'flex flex-col gap-0 p-0 overflow-hidden',
          !result && 'sm:max-w-[420px]',
        )}
        style={{
          borderLeft: '3px solid #030213',
          boxShadow: '-8px 0 24px rgba(0,0,0,.08)',
          ...(resultSheetWidth != null
            ? { width: `${resultSheetWidth}px`, maxWidth: '92vw' }
            : {}),
        }}
      >
        {/* ------------------------------------------------------------------ */}
        {/* LOADING VIEW                                                        */}
        {/* ------------------------------------------------------------------ */}
        {loading && (
          <>
            <SheetHeader className="p-4 border-b">
              <SheetTitle>
                <span aria-hidden="true" className="text-violet-700 mr-1">✦</span>
                Generate AI Plan
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
              {/* Quoted prompt */}
              <p className="text-sm text-muted-foreground italic text-center max-w-xs">
                "{description}"
              </p>

              {/* Spinner */}
              <div
                className="w-8 h-8 rounded-full border-2 border-muted border-t-foreground animate-spin"
                role="status"
                aria-label="Loading"
              />

              {/* Status text */}
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Drafting team…
              </p>
              <p className="text-xs text-muted-foreground">Usually 5–20 seconds.</p>
            </div>

            <SheetFooter className="border-t p-4 flex-row justify-end">
              <Button
                variant="outline"
                onClick={() => abortController.current?.abort()}
              >
                Cancel
              </Button>
            </SheetFooter>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* FORM VIEW                                                           */}
        {/* ------------------------------------------------------------------ */}
        {!loading && !result && (
          <>
            <SheetHeader className="p-4 border-b">
              <SheetTitle>
                <span aria-hidden="true" className="text-violet-700 mr-1">✦</span>
                Generate AI Plan
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
              {/* Error banner */}
              {error !== null && (
                <div
                  className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2"
                  aria-live="assertive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gp-description">Describe the project</Label>
                <Textarea
                  id="gp-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 3-month e-commerce redesign, ~6 people, build-heavy"
                  rows={4}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The AI proposes roles &amp; allocations grounded in your rate card. Nothing is saved until you accept.
                </p>
              </div>

              {/* Region */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gp-region">Delivery region</Label>
                <Select
                  value={region}
                  onValueChange={(v) => setRegion(v as GeneratePlanRegion)}
                >
                  <SelectTrigger id="gp-region">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Apply proposed phases */}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="gp-apply-phases"
                  checked={applyProposedPhases}
                  onCheckedChange={(checked) =>
                    setApplyProposedPhases(checked === true)
                  }
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="gp-apply-phases" className="cursor-pointer">
                    Apply proposed phases
                  </Label>
                  <p
                    id="gp-apply-phases-hint"
                    className="text-xs text-muted-foreground mt-0.5"
                  >
                    Let the AI define Discovery / Build / Launch-style phases and apply them on accept. Auto-enabled when your description mentions phases or the project still has the default single phase.
                  </p>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t p-4 flex-row justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!description.trim()}
              >
                Generate
              </Button>
            </SheetFooter>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* RESULT VIEW                                                         */}
        {/* ------------------------------------------------------------------ */}
        {!loading && result !== null && (
          <>
            <SheetHeader className="p-4 border-b">
              <SheetTitle>
                <span aria-hidden="true" className="text-violet-700 mr-1">✦</span>
                Proposed plan
              </SheetTitle>
            </SheetHeader>

            <div
              className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3"
              style={{ scrollbarGutter: 'stable' }}
            >
              {/* Error banner */}
              {error !== null && (
                <div
                  className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2"
                  aria-live="assertive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Warnings callout */}
              {result.warnings.length > 0 && (
                <div
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{
                    background: '#fffbeb',
                    borderColor: '#fde68a',
                    color: '#92400e',
                  }}
                  aria-live="polite"
                >
                  {result.warnings.map((w, idx) => (
                    <div key={`w-${idx}`} className="flex gap-1.5">
                      <span style={{ color: '#d97706' }}>⚠</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Proposed timeline */}
              {resolvedPhases.length > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="text-xs font-medium text-foreground mb-1.5">Proposed timeline</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resolvedPhases.map((phase, idx) => (
                      <span
                        key={`${phase.name}-${idx}`}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: phase.color ?? PHASE_COLORS[idx % PHASE_COLORS.length],
                          color: '#444',
                        }}
                      >
                        {phase.name} · {phase.periodCount ?? 0}
                        {_planningMode === 'monthly' ? 'mo' : 'wk'}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Phases are applied to the project when you click Accept plan.
                  </p>
                </div>
              )}

              {/* Result summary */}
              <p className="text-xs text-muted-foreground">
                {result.draft.resourcePlans.length} plan row{result.draft.resourcePlans.length === 1 ? '' : 's'}
                {' · '}
                {(result.draft.resourceLists?.length ?? 0)} resource{(result.draft.resourceLists?.length ?? 0) === 1 ? '' : 's'}.
                {' '}Accepting replaces the Resource Plan and Resource List with the generated team.
              </p>

              {/* Result hint */}
              <p className="text-xs text-muted-foreground">
                Rates to 2 decimals. Allocation: one bar = one week, height snapped to 0/25/50/75/100% (0–8h/day). Long timelines scroll horizontally.
              </p>

              {/* Resource plans table */}
              <div className={cn(tableNeedsHorizontalScroll && 'overflow-x-auto')}>
              <table
                className="w-full text-sm border-collapse table-fixed"
                style={tableNeedsHorizontalScroll ? { minWidth: `${resultTableWidth}px` } : undefined}
              >
                <colgroup>
                  <col />
                  <col style={{ width: `${RESULT_SHEET_INT_RATE_COL}px` }} />
                  <col style={{ width: `${RESULT_SHEET_CLIENT_RATE_COL}px` }} />
                  <col style={{ width: `${allocColWidth}px` }} />
                </colgroup>
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground text-[11.5px]">
                      Role
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium text-muted-foreground text-[11.5px] whitespace-nowrap">
                      Int. rate
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium text-muted-foreground text-[11.5px] whitespace-nowrap">
                      Client rate
                    </th>
                    <th className="text-left py-1.5 pl-3 font-medium text-muted-foreground text-[11.5px] whitespace-nowrap">
                      Allocation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.draft.resourcePlans.map((plan, idx) => (
                      <tr key={`${plan.displayOrder}-${idx}`} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 align-top">
                          <div className="font-medium">{plan.clientRole ?? plan.role}</div>
                          {plan.rationale && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {plan.rationale}
                            </div>
                          )}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right align-top tabular-nums whitespace-nowrap"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {plan.intHourlyRate.toFixed(2)}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right align-top tabular-nums whitespace-nowrap"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {plan.clientHourlyRate.toFixed(2)}
                        </td>
                        <td className="py-1.5 pl-3 align-middle overflow-visible">
                          <AllocTimeline plan={plan} phases={resolvedPhases} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>

            <SheetFooter className="border-t p-4 flex-row gap-2">
              {/* Left-side actions */}
              <Button
                variant="outline"
                onClick={() => setResult(null)}
                disabled={accepting}
              >
                ‹ Back
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={accepting}
              >
                Discard
              </Button>
              {/* Spacer */}
              <div className="flex-1" />
              {/* Primary action */}
              <Button
                onClick={handleAccept}
                disabled={accepting || !onAcceptPlan}
              >
                {accepting ? 'Applying…' : 'Accept plan'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default GeneratePlanSheet;
