import { WbsItem } from '../services/api';

/** A `WbsItem` assembled into a tree via `parentId`, with its direct children attached. */
export interface WbsTreeNode extends WbsItem {
  children: WbsTreeNode[];
}

/** A flattened tree row: a node plus its rendering depth (0 = root). */
export interface WbsFlatRow {
  node: WbsTreeNode;
  depth: number;
  hasChildren: boolean;
}

/**
 * Assemble a flat `WbsItem[]` (as returned by `GET .../wbs`) into a forest of
 * `WbsTreeNode`s, linking children to parents via `parentId`. An item whose
 * `parentId` doesn't resolve to another item in the same list (missing/orphaned
 * parent, e.g. because the parent was deleted or belongs to another project) is
 * surfaced as a root rather than dropped, so no item is ever silently hidden.
 * Siblings are ordered by `displayOrder`, then `id` as a deterministic tiebreaker
 * (mirrors the server's own `GET .../wbs` ordering).
 */
export function buildWbsTree(items: WbsItem[]): WbsTreeNode[] {
  const nodeById = new Map<number, WbsTreeNode>();
  items.forEach((item) => {
    nodeById.set(item.id, { ...item, children: [] });
  });

  const roots: WbsTreeNode[] = [];
  items.forEach((item) => {
    const node = nodeById.get(item.id)!;
    const parent = item.parentId != null ? nodeById.get(item.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const bySiblingOrder = (a: WbsTreeNode, b: WbsTreeNode) =>
    a.displayOrder - b.displayOrder || a.id - b.id;
  const sortRecursive = (nodes: WbsTreeNode[]) => {
    nodes.sort(bySiblingOrder);
    nodes.forEach((n) => sortRecursive(n.children));
  };
  sortRecursive(roots);

  return roots;
}

/**
 * Flatten a tree into depth-annotated rows for a plain indented table, in
 * pre-order (parent immediately followed by its visible descendants). A node
 * whose id is in `collapsedIds` still appears itself, but its descendants are
 * skipped — collapsing a node hides only its subtree, never the node itself
 * or its siblings.
 */
export function flattenVisibleTree(
  tree: WbsTreeNode[],
  collapsedIds: Set<number> = new Set()
): WbsFlatRow[] {
  const rows: WbsFlatRow[] = [];
  const walk = (nodes: WbsTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth, hasChildren: node.children.length > 0 });
      if (node.children.length > 0 && !collapsedIds.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return rows;
}

/**
 * Roll up hours per discipline across a node's own estimates plus every
 * descendant's estimates (own + all descendants, not just direct children).
 * Same-discipline hours are merged (summed) — the map holds one entry per
 * discipline, not one entry per estimate row.
 */
export function rollupHours(node: WbsTreeNode): Map<string, number> {
  const totals = new Map<string, number>();
  const visit = (n: WbsTreeNode) => {
    n.estimates.forEach((estimate) => {
      totals.set(estimate.discipline, (totals.get(estimate.discipline) ?? 0) + estimate.hours);
    });
    n.children.forEach(visit);
  };
  visit(node);
  return totals;
}

/**
 * Outline ("WBS") numbers for every node in a forest: `1`, `1.1`, `1.2.2.1`,
 * depth-first, 1-based, dot-joined, derived purely from tree position and
 * sibling order. Never persisted — a node's number changes the moment its
 * position does, so storing it would immediately go stale.
 *
 * Numbers are assigned over the WHOLE tree, not the visible rows: collapsing a
 * subtree hides rows but must not renumber the ones that remain.
 */
export function outlineNumbers(tree: WbsTreeNode[]): Map<number, string> {
  const numbers = new Map<number, string>();
  const walk = (nodes: WbsTreeNode[], prefix: string) => {
    nodes.forEach((node, index) => {
      const outline = prefix === '' ? String(index + 1) : `${prefix}.${index + 1}`;
      numbers.set(node.id, outline);
      walk(node.children, outline);
    });
  };
  walk(tree, '');
  return numbers;
}

/** A node's resolved phase: the name actually in force, and whether it came from an ancestor. */
export interface EffectivePhase {
  /** The phase in force for this node, or `null` for Unassigned. */
  phaseName: string | null;
  /** True when `phaseName` came from an ancestor rather than this node's own `phaseName`. */
  inherited: boolean;
}

/**
 * Resolve phase inheritance over a forest: a node with no phase of its own
 * takes the nearest ancestor's, and only a node with no ancestor value at all
 * is Unassigned.
 *
 * `validPhaseNames` are the project's current phase names. A `phaseName` that
 * matches none of them is *stale* (the phase was renamed or deleted) and is
 * treated exactly as if it were `null` — it resolves to Unassigned rather than
 * being rendered verbatim, and it never propagates down the subtree. Rendering
 * a stale name would both contradict the reconciliation engine (which already
 * folds unknown names into its Unassigned bucket) and leave the phase picker
 * displaying a value that isn't among its own options.
 *
 * Omitting `validPhaseNames` disables the staleness check and honours every
 * non-null name — useful for tests of pure inheritance.
 */
export function effectivePhases(
  tree: WbsTreeNode[],
  validPhaseNames?: Iterable<string>
): Map<number, EffectivePhase> {
  const valid = validPhaseNames === undefined ? undefined : new Set(validPhaseNames);
  const isLive = (name: string | null): name is string =>
    name != null && (valid === undefined || valid.has(name));

  const resolved = new Map<number, EffectivePhase>();
  const walk = (nodes: WbsTreeNode[], inheritedName: string | null) => {
    for (const node of nodes) {
      const own = isLive(node.phaseName) ? node.phaseName : null;
      const phaseName = own ?? inheritedName;
      resolved.set(node.id, { phaseName, inherited: own === null && phaseName !== null });
      walk(node.children, phaseName);
    }
  };
  walk(tree, null);
  return resolved;
}

/**
 * The same flat `WbsItem[]` with each item's `phaseName` replaced by its
 * *effective* (inherited, staleness-resolved) phase.
 *
 * `buildReconciliationReport` attributes an item's hours to its own
 * `phaseName` only — it deliberately knows nothing about the tree. This is the
 * one-line adapter that resolves inheritance first, so a child with no phase
 * of its own is attributed to its parent's phase instead of falling into
 * Unassigned, without teaching `wbs.ts` to walk the tree.
 */
export function withEffectivePhases(items: WbsItem[], validPhaseNames?: Iterable<string>): WbsItem[] {
  const resolved = effectivePhases(buildWbsTree(items), validPhaseNames);
  return items.map((item) => {
    const effective = resolved.get(item.id);
    return effective === undefined ? item : { ...item, phaseName: effective.phaseName };
  });
}

/**
 * Ids of every descendant (not including `id` itself) of the item identified
 * by `id`, in the tree assembled from `items`. Used both to size the
 * confirmation prompt before a delete and to cascade the removal through
 * local state after the server confirms it (mirroring the DB's own
 * `onDelete: Cascade`, which is otherwise silent to the client).
 */
export function descendantIds(items: WbsItem[], id: number): number[] {
  const tree = buildWbsTree(items);

  const findNode = (nodes: WbsTreeNode[]): WbsTreeNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(node.children);
      if (found) return found;
    }
    return undefined;
  };

  const target = findNode(tree);
  if (!target) return [];

  const ids: number[] = [];
  const collect = (node: WbsTreeNode) => {
    node.children.forEach((child) => {
      ids.push(child.id);
      collect(child);
    });
  };
  collect(target);
  return ids;
}
