import React, { useMemo, useRef, useState } from 'react';
import {
  Project,
  ResourcePlan as ResourcePlanType,
  RateCard as RateCardType,
  WbsItem,
  WbsEstimate,
} from '../services/api';
import { parsePhases } from '../utils/phases';
import { buildWbsTree, flattenVisibleTree, rollupHours, descendantIds, WbsTreeNode } from '../utils/wbsTree';
import { hoursPerPeriod } from '../utils/calculations';
import { buildReconciliationReport } from '../utils/wbs';
import { ReconciliationPanel } from './ReconciliationPanel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

// Sentinel Select value for "no phase" — Radix Select items can't carry an
// empty-string value, and the domain value for "no phase" is `null`, not "".
const UNASSIGNED_PHASE = '__unassigned__';

const INDENT_PX = 20;

type WbsCreatePayload = Omit<Partial<WbsItem>, 'estimates'> & { estimates?: Partial<WbsEstimate>[] };

interface WbsProps {
  project: Project;
  resourcePlans: ResourcePlanType[];
  rateCards: RateCardType[];
  wbsItems: WbsItem[];
  onAddWbsItem: (data: WbsCreatePayload) => Promise<WbsItem>;
  onUpdateWbsItem: (id: number, data: Partial<WbsItem>) => Promise<void>;
  onDeleteWbsItem: (id: number) => Promise<void>;
  onReplaceWbsEstimates: (wbsItemId: number, estimates: Partial<WbsEstimate>[]) => Promise<void>;
}

function totalHoursFor(node: WbsTreeNode): number {
  const totals = rollupHours(node);
  let sum = 0;
  totals.forEach((hours) => {
    sum += hours;
  });
  return sum;
}

export function Wbs({
  project,
  resourcePlans,
  rateCards,
  wbsItems,
  onAddWbsItem,
  onUpdateWbsItem,
  onDeleteWbsItem,
  onReplaceWbsEstimates,
}: WbsProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [hourDrafts, setHourDrafts] = useState<Record<string, string>>({});
  // commitHours serialization (per WBS item id) — see the comment above
  // commitHours for why this exists: without it, two rapid edits to different
  // discipline cells on the same row can race each other's
  // replaceWbsEstimates PUT (a full delete-then-recreate) and silently drop
  // one of the edits.
  const commitChainRef = useRef<Record<number, Promise<unknown>>>({});
  const pendingEstimatesRef = useRef<Record<number, Partial<WbsEstimate>[]>>({});
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [showAddDiscipline, setShowAddDiscipline] = useState(false);
  const [newDisciplineValue, setNewDisciplineValue] = useState('');

  const phases = useMemo(() => parsePhases(project.phases, resourcePlans), [project.phases, resourcePlans]);

  const hrsPerPeriod = useMemo(
    () => hoursPerPeriod((project.planningMode || 'weekly') as 'weekly' | 'monthly', project.daysInFTE),
    [project.planningMode, project.daysInFTE]
  );
  const reconciliationReport = useMemo(
    () => buildReconciliationReport(wbsItems, resourcePlans, rateCards, phases, hrsPerPeriod),
    [wbsItems, resourcePlans, rateCards, phases, hrsPerPeriod]
  );

  const tree = useMemo(() => buildWbsTree(wbsItems), [wbsItems]);
  const rows = useMemo(() => flattenVisibleTree(tree, collapsedIds), [tree, collapsedIds]);

  const disciplinesInUse = useMemo(() => {
    const set = new Set<string>();
    wbsItems.forEach((item) => item.estimates.forEach((estimate) => set.add(estimate.discipline)));
    return set;
  }, [wbsItems]);

  const columns = useMemo(() => {
    const set = new Set<string>([...disciplinesInUse, ...extraColumns]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [disciplinesInUse, extraColumns]);

  const availableDisciplines = useMemo(() => {
    const set = new Set(
      rateCards.map((rc) => rc.discipline).filter((d): d is string => !!d && d.trim() !== '')
    );
    return Array.from(set)
      .filter((d) => !columns.includes(d))
      .sort((a, b) => a.localeCompare(b));
  }, [rateCards, columns]);

  function toggleCollapse(id: number) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function siblingsOf(parentId: number | null): WbsItem[] {
    return wbsItems.filter((i) => i.parentId === parentId);
  }

  function nextDisplayOrder(parentId: number | null): number {
    const siblings = siblingsOf(parentId);
    return siblings.reduce((max, i) => Math.max(max, i.displayOrder), -1) + 1;
  }

  function handleAddRootItem() {
    onAddWbsItem({
      name: 'New item',
      parentId: null,
      phaseName: null,
      displayOrder: nextDisplayOrder(null),
    }).catch(() => {
      // Failure surfaces via the shared app-level error banner; nothing to add locally.
    });
  }

  function handleAddChild(parent: WbsTreeNode) {
    onAddWbsItem({
      name: 'New item',
      parentId: parent.id,
      phaseName: null,
      displayOrder: nextDisplayOrder(parent.id),
    }).catch(() => {});
  }

  function handleDelete(node: WbsTreeNode) {
    const descendants = descendantIds(wbsItems, node.id);
    const message =
      descendants.length > 0
        ? `Delete "${node.name}" and its ${descendants.length} descendant item${descendants.length === 1 ? '' : 's'}? This cannot be undone.`
        : `Delete "${node.name}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    onDeleteWbsItem(node.id).catch(() => {});
  }

  function handlePhaseChange(node: WbsTreeNode, value: string) {
    const phaseName = value === UNASSIGNED_PHASE ? null : value;
    if (phaseName === node.phaseName) return;
    onUpdateWbsItem(node.id, { phaseName }).catch(() => {});
  }

  function commitName(node: WbsTreeNode) {
    const draft = nameDrafts[node.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    const clearDraft = () =>
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
    if (!trimmed || trimmed === node.name) {
      // Blank name (or no real change): revert, no call.
      clearDraft();
      return;
    }
    onUpdateWbsItem(node.id, { name: trimmed }).then(clearDraft).catch(clearDraft);
  }

  // Builds and sends the merged "replace all estimates" payload for one
  // (item, discipline) cell edit, and serializes calls per item id.
  //
  // replaceWbsEstimates is a full delete-then-recreate on the server, so two
  // edits to different discipline cells on the SAME row (a normal
  // tab-across-a-row workflow) racing each other would each merge against a
  // stale `node.estimates` snapshot and silently clobber one another's
  // just-entered value. To avoid that:
  //  - `pendingEstimatesRef` holds the last merged estimate array computed
  //    for an item while a commit for that item is still in flight, so the
  //    next edit merges against that instead of the possibly-stale prop.
  //  - `commitChainRef` holds the in-flight promise chain per item id, so
  //    calls for the same item always run strictly sequentially (the next
  //    call's request is only issued after the previous one has settled),
  //    regardless of network timing.
  function commitHours(node: WbsTreeNode, discipline: string) {
    const key = `${node.id}:${discipline}`;
    const draft = hourDrafts[key];
    if (draft === undefined) return;
    const clearDraft = () =>
      setHourDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

    const trimmed = draft.trim();
    const parsed = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Invalid entry: revert, no call.
      clearDraft();
      return;
    }

    // Merge against the most recently computed result for this item (if a
    // commit is still in flight), not directly against the prop, which may
    // not yet reflect an edit made moments ago on this same row.
    const baseEstimates = pendingEstimatesRef.current[node.id] ?? node.estimates;

    const existingEntry = baseEstimates.find((e) => e.discipline === discipline && e.role === '');
    if ((existingEntry?.hours ?? 0) === parsed) {
      clearDraft();
      return;
    }

    // Preserve every other estimate on this item untouched — other disciplines
    // and any non-default-role rows on this same discipline — and merge in the
    // edited (discipline, role: "") value.
    const others = baseEstimates.filter((e) => !(e.discipline === discipline && e.role === ''));
    const nextEstimates: Partial<WbsEstimate>[] = [
      ...others.map((e) => ({ discipline: e.discipline, role: e.role, hours: e.hours })),
      { discipline, role: '', hours: parsed },
    ];

    // Record synchronously so a second rapid edit on this item (before this
    // one's request settles) reads this edit's result as its merge basis.
    pendingEstimatesRef.current[node.id] = nextEstimates;

    const previousChain = commitChainRef.current[node.id] ?? Promise.resolve();
    const requestPromise = previousChain.then(() => onReplaceWbsEstimates(node.id, nextEstimates));
    requestPromise.then(clearDraft, clearDraft);

    // The stored chain link must always settle successfully (never reject),
    // so a later edit on this item isn't permanently blocked by this one's
    // failure — it just proceeds once this attempt is done, one way or another.
    const chainLink = requestPromise.then(
      () => undefined,
      () => undefined
    );
    commitChainRef.current[node.id] = chainLink;
    chainLink.then(() => {
      // Only clear the pending merge basis once this is the LAST queued
      // commit for this item — if a newer edit has since queued behind it,
      // leave it in place so that edit still has something to merge against.
      if (commitChainRef.current[node.id] === chainLink) {
        delete pendingEstimatesRef.current[node.id];
        delete commitChainRef.current[node.id];
      }
    });
  }

  function confirmAddDiscipline() {
    const value = newDisciplineValue.trim();
    if (!value) return;
    if (!columns.includes(value)) {
      setExtraColumns((prev) => [...prev, value]);
    }
    setNewDisciplineValue('');
    setShowAddDiscipline(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Work Breakdown Structure</h2>
        <div className="flex items-center gap-2">
          {showAddDiscipline ? (
            <>
              {availableDisciplines.length > 0 ? (
                <Select value={newDisciplineValue} onValueChange={setNewDisciplineValue}>
                  <SelectTrigger className="h-8 w-48" aria-label="New discipline">
                    <SelectValue placeholder="Select discipline" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDisciplines.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 w-48"
                  placeholder="Discipline name"
                  value={newDisciplineValue}
                  onChange={(e) => setNewDisciplineValue(e.target.value)}
                  aria-label="New discipline name"
                />
              )}
              <Button size="sm" onClick={confirmAddDiscipline} disabled={!newDisciplineValue.trim()}>
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddDiscipline(false);
                  setNewDisciplineValue('');
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowAddDiscipline(true)}>
              + Add discipline
            </Button>
          )}
          <Button onClick={handleAddRootItem}>Add root item</Button>
        </div>
      </div>

      {wbsItems.length === 0 ? (
        <div className="text-muted-foreground border rounded-md p-8 text-center">
          No WBS items yet. Add a root item to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phase</TableHead>
              {columns.map((discipline) => (
                <TableHead key={discipline} className="text-right">
                  {discipline}
                </TableHead>
              ))}
              <TableHead className="text-right">Total hours</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ node, depth, hasChildren }) => (
              <TableRow key={node.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1" style={{ paddingLeft: depth * INDENT_PX }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(node.id)}
                        aria-label={collapsedIds.has(node.id) ? `Expand ${node.name}` : `Collapse ${node.name}`}
                        className="w-4 shrink-0 text-muted-foreground"
                      >
                        {collapsedIds.has(node.id) ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span className="inline-block w-4 shrink-0" />
                    )}
                    <Input
                      value={nameDrafts[node.id] ?? node.name}
                      onChange={(e) =>
                        setNameDrafts((prev) => ({ ...prev, [node.id]: e.target.value }))
                      }
                      onBlur={() => commitName(node)}
                      className="h-8"
                      aria-label={`Name for item ${node.id}`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={node.phaseName ?? UNASSIGNED_PHASE}
                    onValueChange={(value) => handlePhaseChange(node, value)}
                  >
                    <SelectTrigger className="h-8 w-40" aria-label={`Phase for item ${node.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_PHASE}>Unassigned</SelectItem>
                      {phases.map((phase) => (
                        <SelectItem key={phase.name} value={phase.name}>
                          {phase.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                {columns.map((discipline) => {
                  const key = `${node.id}:${discipline}`;
                  const existing = node.estimates.find(
                    (e) => e.discipline === discipline && e.role === ''
                  );
                  const displayValue = hourDrafts[key] ?? (existing ? String(existing.hours) : '');
                  return (
                    <TableCell key={discipline} className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={displayValue}
                        onChange={(e) =>
                          setHourDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onBlur={() => commitHours(node, discipline)}
                        className="h-8 w-20 text-right"
                        aria-label={`${discipline} hours for item ${node.id}`}
                      />
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">{totalHoursFor(node)}</TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <Button variant="outline" size="sm" onClick={() => handleAddChild(node)}>
                    + Child
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(node)}
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

      <div className="border-t pt-6">
        <ReconciliationPanel report={reconciliationReport} />
      </div>
    </div>
  );
}
