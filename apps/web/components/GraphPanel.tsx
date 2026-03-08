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

const NODE_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  person: {
    bg: "#f8fafc",
    border: "#bfdbfe",
    text: "#1e3a5f",
    badge: "#93c5fd",
  },
  team: {
    bg: "#f8fdf9",
    border: "#bbf7d0",
    text: "#14532d",
    badge: "#86efac",
  },
  system: {
    bg: "#faf8ff",
    border: "#ddd6fe",
    text: "#4c1d95",
    badge: "#c4b5fd",
  },
  milestone: {
    bg: "#fffbf5",
    border: "#fed7aa",
    text: "#7c2d12",
    badge: "#fdba74",
  },
};

const TYPE_LABELS: Record<string, string> = {
  person: "Person",
  team: "Team",
  system: "System",
  milestone: "Milestone",
};

function EntityNode({ data }: { data: { label: string; nodeType: string } }) {
  const style = NODE_STYLES[data.nodeType] ?? NODE_STYLES.system;
  return (
    <div
      className="rounded-xl border px-5 py-3 text-center transition-shadow hover:shadow-md"
      style={{
        background: style.bg,
        borderColor: style.border,
        color: style.text,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        minWidth: 100,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-[13px] font-semibold leading-tight">{data.label}</div>
      <div
        className="mx-auto mt-1.5 w-fit rounded-full px-2 py-px text-[9px] font-semibold uppercase tracking-wider"
        style={{
          background: style.badge + "33",
          color: style.text,
        }}
      >
        {TYPE_LABELS[data.nodeType] ?? data.nodeType}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };

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
    const totalWidth = group.length * 200;
    const offsetX = -totalWidth / 2;
    for (let i = 0; i < group.length; i++) {
      result.push({
        id: group[i].id,
        type: "entity",
        position: { x: offsetX + i * 200, y },
        data: { label: group[i].label, nodeType: group[i].type },
      });
    }
    if (group.length > 0) y += 160;
  }

  return result;
}

const EDGE_COLORS: Record<string, string> = {
  owns: "#a3d9b1",
  depends_on: "#93b5e1",
  blocks: "#e5a0a0",
  relates_to: "#c8c4c0",
};

function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => {
    const stroke = EDGE_COLORS[e.type] ?? EDGE_COLORS.relates_to;
    const showLabel = e.type === "blocks" || e.type === "depends_on";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: showLabel ? (e.label ?? e.type) : undefined,
      type: "smoothstep",
      style: { stroke, strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: "#a8a29e" },
    };
  });
}

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
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)]">
          Knowledge Graph
        </h2>
      </div>
      <div className="flex-1">
        <ReactFlow
          colorMode="light"
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1.2}/>
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
