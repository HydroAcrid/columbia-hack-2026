"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphEdge } from "@copilot/shared";

// ---------- colour mapping ----------

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  person:    { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  team:      { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  system:    { bg: "#fdf4ff", border: "#a855f7", text: "#6b21a8" },
  milestone: { bg: "#fff7ed", border: "#f97316", text: "#9a3412" },
};

// ---------- custom node ----------

function EntityNode({ data }: { data: { label: string; nodeType: string } }) {
  const colors = NODE_COLORS[data.nodeType] ?? NODE_COLORS.system;
  return (
    <div
      className="rounded-lg border-2 px-4 py-2 shadow-sm text-sm font-medium min-w-[80px] text-center"
      style={{
        background: colors.bg,
        borderColor: colors.border,
        color: colors.text,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-400" />
      <span className="mr-1.5 text-xs opacity-60">{typeIcon(data.nodeType)}</span>
      {data.label}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400" />
    </div>
  );
}

function typeIcon(t: string) {
  switch (t) {
    case "person":    return "👤";
    case "team":      return "👥";
    case "system":    return "⚙️";
    case "milestone": return "🏁";
    default:          return "●";
  }
}

const nodeTypes: NodeTypes = { entity: EntityNode };

// ---------- layout helpers ----------

function toFlowNodes(nodes: GraphNode[]): Node[] {
  const byType: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    (byType[n.type] ??= []).push(n);
  }

  const typeOrder = ["person", "team", "system", "milestone"];
  const result: Node[] = [];
  let y = 0;

  for (const type of typeOrder) {
    const group = byType[type] ?? [];
    let x = 0;
    for (const n of group) {
      result.push({
        id: n.id,
        type: "entity",
        position: { x: x * 220, y },
        data: { label: n.label, nodeType: n.type },
      });
      x++;
    }
    if (group.length > 0) y += 120;
  }

  return result;
}

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  owns:       { stroke: "#22c55e" },
  depends_on: { stroke: "#3b82f6", strokeDasharray: "6 3" },
  blocks:     { stroke: "#ef4444" },
  relates_to: { stroke: "#a1a1aa", strokeDasharray: "4 4" },
};

function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => {
    const style = EDGE_STYLES[e.type] ?? EDGE_STYLES.relates_to;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? e.type,
      type: "default",
      style,
      labelStyle: { fontSize: 11, fill: "#71717a" },
    };
  });
}

// ---------- component ----------

interface GraphPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphPanel({ nodes, edges }: GraphPanelProps) {
  const initialNodes = useMemo(() => toFlowNodes(nodes), [nodes]);
  const initialEdges = useMemo(() => toFlowEdges(edges), [edges]);

  const [flowNodes, , onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback(() => {}, []);

  return (
    <div className="flex h-full flex-col">
      <h2 className="shrink-0 border-b border-zinc-200 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Knowledge Graph
      </h2>
      <div className="flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
