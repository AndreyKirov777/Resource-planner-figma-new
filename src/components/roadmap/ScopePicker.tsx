/**
 * The item editor's scope section: a search box and the WBS tree with
 * checkboxes, indented, hours at the right of every node — CAP-5's "point at
 * WBS nodes rather than retyping them". Checking a node stores ONE direct
 * link (its subtree follows by inheritance, via `effectiveRoadmapItems`); a
 * node already inherited from THIS item shows a muted, non-interactive
 * check; a node owned by ANOTHER item is muted with that item's name —
 * checking it moves it here.
 */
import { useMemo, useState } from 'react';
import { WbsItem } from '../../services/api';
import { buildWbsTree, flattenVisibleTree } from '../../utils/wbsTree';
import {
  effectiveRoadmapItems,
  itemEffort,
  scopeLeaves,
  subtreeHours,
  totalHours,
  RoadmapLinkRecord,
} from '../../utils/roadmap';
import { formatHours } from '../../utils/wbsGrid';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { cn } from '../ui/utils';

interface ScopePickerProps {
  wbsItems: WbsItem[];
  currentItemId: number;
  links: RoadmapLinkRecord[];
  itemNames: Map<number, string>;
  onChange: (nextWbsItemIds: number[]) => void;
}

export function ScopePicker({ wbsItems, currentItemId, links, itemNames, onChange }: ScopePickerProps) {
  const [query, setQuery] = useState('');

  const tree = useMemo(() => buildWbsTree(wbsItems), [wbsItems]);
  const effective = useMemo(() => effectiveRoadmapItems(tree, links), [tree, links]);
  const rows = useMemo(() => flattenVisibleTree(tree), [tree]);
  const ownLinkSet = useMemo(
    () => new Set(links.filter((l) => l.roadmapItemId === currentItemId).map((l) => l.wbsItemId)),
    [links, currentItemId]
  );

  const effort = useMemo(
    () => itemEffort(currentItemId, wbsItems, tree, effective),
    [currentItemId, wbsItems, tree, effective]
  );
  const leafCount = useMemo(
    () => scopeLeaves(currentItemId, tree, effective).length,
    [currentItemId, tree, effective]
  );

  function toggle(nodeId: number) {
    const next = ownLinkSet.has(nodeId)
      ? [...ownLinkSet].filter((id) => id !== nodeId)
      : [...ownLinkSet, nodeId];
    onChange(next);
  }

  const filtered = query.trim()
    ? rows.filter((r) => r.node.name.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        Linked: {formatHours(totalHours(effort))} h across {leafCount} leaves
      </div>
      <Input
        placeholder="Search WBS…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search WBS scope"
      />
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground p-3 text-sm">No matching WBS nodes.</div>
        ) : (
          filtered.map(({ node, depth }) => {
            const ownChecked = ownLinkSet.has(node.id);
            const eff = effective.get(node.id);
            const inheritedChecked = !ownChecked && eff?.roadmapItemId === currentItemId;
            const ownedElsewhereId =
              eff?.roadmapItemId != null && eff.roadmapItemId !== currentItemId ? eff.roadmapItemId : null;
            const checked = ownChecked || inheritedChecked;
            const hours = subtreeHours(node);

            return (
              <div
                key={node.id}
                data-testid={`scope-row-${node.id}`}
                className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0"
                style={{ paddingLeft: 8 + depth * 16 }}
              >
                <Checkbox
                  checked={checked}
                  disabled={inheritedChecked}
                  onCheckedChange={() => toggle(node.id)}
                  aria-label={`Link ${node.name}`}
                />
                <span className={cn('flex-1 truncate', inheritedChecked && 'text-muted-foreground')}>
                  {node.name}
                </span>
                {ownedElsewhereId !== null && (
                  <span className="text-muted-foreground truncate text-xs">
                    {itemNames.get(ownedElsewhereId) ?? 'another item'}
                  </span>
                )}
                <span className="text-muted-foreground w-14 shrink-0 text-right tabular-nums">
                  {formatHours(hours)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
