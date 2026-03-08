import type { GraphEdge, GraphNode, GraphPatchEvent } from "@copilot/shared";
import {
  canonicalizeGraphLabel,
  normalizeGraphLabel,
} from "./canonicalization.js";

export {
  canonicalizeGraphLabel,
  getCanonicalAliasEntries,
  normalizeGraphLabel,
  slugifyGraphId,
} from "./canonicalization.js";

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function applyPatch(state: GraphState, patch: GraphPatchEvent): GraphState {
  const nodes = [...state.nodes];
  const edges = [...state.edges];
  const nodeIdMap = new Map<string, string>();

  for (const node of nodes) {
    nodeIdMap.set(node.id, node.id);
  }

  if (patch.addNodes) {
    for (const incomingNode of patch.addNodes) {
      const canonicalId = mergeNode(nodes, incomingNode);
      nodeIdMap.set(incomingNode.id, canonicalId);
    }
  }

  if (patch.updateNodes) {
    for (const update of patch.updateNodes) {
      const canonicalId = resolveNodeId(nodeIdMap, update.id);
      const index = nodes.findIndex((node) => node.id === canonicalId);

      if (index !== -1) {
        nodes[index] = { ...nodes[index], ...update, id: canonicalId } as GraphNode;
        continue;
      }

      const fallbackNode: GraphNode = {
        id: canonicalId,
        label: update.label ?? canonicalId,
        type: update.type ?? "system",
      };
      const mergedId = mergeNode(nodes, fallbackNode);
      nodeIdMap.set(update.id, mergedId);
    }
  }

  if (patch.addEdges) {
    for (const incomingEdge of patch.addEdges) {
      const edge = remapEdge(incomingEdge, nodeIdMap);
      mergeEdge(edges, edge);
    }
  }

  return { nodes, edges };
}

export function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const deduped: GraphNode[] = [];
  for (const node of nodes) {
    mergeNode(deduped, node);
  }
  return deduped;
}

function mergeNode(nodes: GraphNode[], incomingNode: GraphNode) {
  const sameIdIndex = nodes.findIndex((node) => node.id === incomingNode.id);
  if (sameIdIndex !== -1) {
    nodes[sameIdIndex] = mergeNodeRecord(nodes[sameIdIndex], incomingNode);
    return nodes[sameIdIndex].id;
  }

  const normalizedKey = nodeKey(incomingNode);
  const semanticIndex = nodes.findIndex((node) => nodeKey(node) === normalizedKey);
  if (semanticIndex !== -1) {
    nodes[semanticIndex] = mergeNodeRecord(nodes[semanticIndex], incomingNode);
    return nodes[semanticIndex].id;
  }

  nodes.push(incomingNode);
  return incomingNode.id;
}

function mergeEdge(edges: GraphEdge[], incomingEdge: GraphEdge) {
  const sameIdIndex = edges.findIndex((edge) => edge.id === incomingEdge.id);
  if (sameIdIndex !== -1) {
    edges[sameIdIndex] = { ...edges[sameIdIndex], ...incomingEdge };
    return;
  }

  const semanticIndex = edges.findIndex((edge) => edgeKey(edge) === edgeKey(incomingEdge));
  if (semanticIndex !== -1) {
    edges[semanticIndex] = {
      ...edges[semanticIndex],
      ...incomingEdge,
      id: edges[semanticIndex].id,
      source: edges[semanticIndex].source,
      target: edges[semanticIndex].target,
      type: edges[semanticIndex].type,
    };
    return;
  }

  edges.push(incomingEdge);
}

function mergeNodeRecord(existingNode: GraphNode, incomingNode: GraphNode): GraphNode {
  return {
    ...existingNode,
    ...incomingNode,
    id: existingNode.id,
    label: pickPreferredLabel(existingNode.label, incomingNode.label),
    type: existingNode.type,
  };
}

function pickPreferredLabel(existingLabel: string, incomingLabel: string) {
  const existingTrimmed = existingLabel.trim();
  const incomingTrimmed = incomingLabel.trim();

  if (!existingTrimmed) {
    return incomingTrimmed;
  }

  if (!incomingTrimmed) {
    return existingTrimmed;
  }

  return incomingTrimmed.length > existingTrimmed.length ? incomingTrimmed : existingTrimmed;
}

function remapEdge(edge: GraphEdge, nodeIdMap: Map<string, string>): GraphEdge {
  return {
    ...edge,
    source: resolveNodeId(nodeIdMap, edge.source),
    target: resolveNodeId(nodeIdMap, edge.target),
  };
}

function resolveNodeId(nodeIdMap: Map<string, string>, id: string) {
  return nodeIdMap.get(id) ?? id;
}

function nodeKey(node: Pick<GraphNode, "label" | "type">) {
  return `${node.type}:${normalizeGraphLabel(node.label)}`;
}

function edgeKey(edge: Pick<GraphEdge, "source" | "target" | "type">) {
  return `${edge.source}:${edge.target}:${edge.type}`;
}

function normalizeLabel(label: string) {
  return normalizeGraphLabel(label);
}
