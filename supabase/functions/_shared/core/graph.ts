import type { Design, DesignEdge } from './types.ts';

export interface ValidationIssue {
  code: 'no_client' | 'dangling_edge' | 'self_loop' | 'cycle' | 'duplicate_id' | 'client_has_incoming';
  message: string;
  nodeIds: string[];
  edgeIds: string[];
}

export function outgoingMap(design: Design): Map<string, DesignEdge[]> {
  const out = new Map<string, DesignEdge[]>();
  for (const n of design.nodes) out.set(n.id, []);
  for (const e of design.edges) out.get(e.source)?.push(e);
  return out;
}

/** Kahn's algorithm. Returns null when the graph has a cycle. */
export function topologicalOrder(design: Design): string[] | null {
  const indeg = new Map<string, number>();
  for (const n of design.nodes) indeg.set(n.id, 0);
  for (const e of design.edges) {
    if (indeg.has(e.target) && indeg.has(e.source)) indeg.set(e.target, indeg.get(e.target)! + 1);
  }
  const out = outgoingMap(design);
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of out.get(id) ?? []) {
      if (!indeg.has(e.target)) continue;
      const d = indeg.get(e.target)! - 1;
      indeg.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  return order.length === design.nodes.length ? order : null;
}

/** Node ids that sit on a cycle (empty when acyclic). */
export function nodesOnCycles(design: Design): string[] {
  const order = topologicalOrder(design);
  if (order) return [];
  // Repeatedly strip nodes with no incoming / no outgoing edges; what remains is cyclic.
  const nodes = new Set(design.nodes.map((n) => n.id));
  let changed = true;
  while (changed) {
    changed = false;
    const edges = design.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target));
    for (const id of [...nodes]) {
      const hasIn = edges.some((e) => e.target === id);
      const hasOut = edges.some((e) => e.source === id);
      if (!hasIn || !hasOut) {
        nodes.delete(id);
        changed = true;
      }
    }
  }
  return [...nodes];
}

/** Ids reachable from any client node. */
export function reachableFromClients(design: Design): Set<string> {
  const out = outgoingMap(design);
  const seen = new Set<string>();
  const stack = design.nodes.filter((n) => n.kind === 'client').map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of out.get(id) ?? []) stack.push(e.target);
  }
  return seen;
}

export function validateDesign(design: Design): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const n of design.nodes) {
    if (ids.has(n.id)) issues.push({ code: 'duplicate_id', message: `Duplicate node id "${n.id}".`, nodeIds: [n.id], edgeIds: [] });
    ids.add(n.id);
  }
  if (!design.nodes.some((n) => n.kind === 'client')) {
    issues.push({ code: 'no_client', message: 'Add a Clients node so there is traffic to simulate.', nodeIds: [], edgeIds: [] });
  }
  for (const e of design.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      issues.push({ code: 'dangling_edge', message: 'An edge points to a node that no longer exists.', nodeIds: [], edgeIds: [e.id] });
    } else if (e.source === e.target) {
      issues.push({ code: 'self_loop', message: 'A node cannot call itself.', nodeIds: [e.source], edgeIds: [e.id] });
    }
  }
  const clientIds = new Set(design.nodes.filter((n) => n.kind === 'client').map((n) => n.id));
  const intoClient = design.edges.filter((e) => clientIds.has(e.target));
  if (intoClient.length) {
    issues.push({
      code: 'client_has_incoming',
      message: 'Clients only send traffic; nothing should point into them.',
      nodeIds: [...new Set(intoClient.map((e) => e.target))],
      edgeIds: intoClient.map((e) => e.id),
    });
  }
  const cyclic = nodesOnCycles(design);
  if (cyclic.length) {
    issues.push({
      code: 'cycle',
      message: 'Request paths must not loop. Remove an edge to break the cycle.',
      nodeIds: cyclic,
      edgeIds: design.edges.filter((e) => cyclic.includes(e.source) && cyclic.includes(e.target)).map((e) => e.id),
    });
  }
  return issues;
}
