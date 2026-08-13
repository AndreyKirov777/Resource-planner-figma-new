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
