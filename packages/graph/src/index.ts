import type { GraphNode, GraphEdge, GraphPatchEvent } from "@copilot/shared";

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Apply a GraphPatchEvent to an existing graph state, returning a new state.
 * TODO: implement merge logic with deduplication.
 */
export function applyPatch(
  state: GraphState,
  patch: GraphPatchEvent
): GraphState {
  const nodes = [...state.nodes];
  const edges = [...state.edges];

  if (patch.addNodes) {
    for (const node of patch.addNodes) {
      if (!nodes.some((n) => n.id === node.id)) {
        nodes.push(node);
      }
    }
  }

  if (patch.updateNodes) {
    for (const update of patch.updateNodes) {
      const idx = nodes.findIndex((n) => n.id === update.id);
      if (idx !== -1) {
        nodes[idx] = { ...nodes[idx], ...update } as GraphNode;
      }
    }
  }

  if (patch.addEdges) {
    for (const edge of patch.addEdges) {
      if (!edges.some((e) => e.id === edge.id)) {
        edges.push(edge);
      }
    }
  }

  return { nodes, edges };
}

/**
 * Deduplicate nodes by normalising labels to lowercase for comparison.
 * Keeps the first occurrence.
 */
export function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    const key = node.label.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, node);
    }
  }
  return Array.from(seen.values());
}
