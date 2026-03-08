"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphEdge, GraphNode } from "@copilot/shared";

/* ──────────────────────────────────────────
   Node visual system
   ────────────────────────────────────────── */

const NODE_THEMES: Record<
  string,
  { bg: string; border: string; text: string; accent: string; icon: string }
> = {
  person: {
    bg: "#ffffff",
    border: "#dbeafe",
    text: "#1e40af",
    accent: "#3b82f6",
    icon: "P",
  },
  team: {
    bg: "#ffffff",
    border: "#d1fae5",
    text: "#065f46",
    accent: "#10b981",
    icon: "T",
  },
  system: {
    bg: "#ffffff",
    border: "#ede9fe",
    text: "#5b21b6",
    accent: "#8b5cf6",
    icon: "S",
  },
  milestone: {
    bg: "#ffffff",
    border: "#fef3c7",
    text: "#92400e",
    accent: "#f59e0b",
    icon: "M",
  },
};

const TYPE_LABELS: Record<string, string> = {
  person: "Person",
  team: "Team",
  system: "System",
  milestone: "Milestone",
};

function EntityNode({ data }: { data: { label: string; nodeType: string } }) {
  const theme = NODE_THEMES[data.nodeType] ?? NODE_THEMES.system;

  return (
    <div
      className="animate-node-enter group relative flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-all duration-200 hover:shadow-lg"
      style={{
        borderColor: theme.border,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        minWidth: 140,
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
        style={{ background: theme.accent }}
      >
        {theme.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: theme.text }}>
          {data.label}
        </div>
        <div className="mt-0.5 text-[10px] font-medium tracking-wide" style={{ color: theme.accent, opacity: 0.7 }}>
          {TYPE_LABELS[data.nodeType] ?? data.nodeType}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };

/* ──────────────────────────────────────────
   Layout — compute positions by type tier
   ────────────────────────────────────────── */

const NODE_GAP_X = 240;
const NODE_GAP_Y = 140;

function toFlowNodes(nodes: GraphNode[]): Node[] {
  const byType: Record<string, GraphNode[]> = {};
  for (const node of nodes) {
    (byType[node.type] ??= []).push(node);
  }

  const typeOrder = ["person", "team", "system", "milestone"];
  const result: Node[] = [];
  let y = 0;

  for (const type of typeOrder) {
    const group = byType[type] ?? [];
    if (group.length === 0) continue;

    const totalWidth = group.length * NODE_GAP_X;
    const offsetX = -totalWidth / 2 + NODE_GAP_X / 2;

    for (let i = 0; i < group.length; i += 1) {
      result.push({
        id: group[i].id,
        type: "entity",
        position: { x: offsetX + i * NODE_GAP_X, y },
        data: { label: group[i].label, nodeType: group[i].type },
      });
    }

    y += NODE_GAP_Y;
  }

  return result;
}

/* ──────────────────────────────────────────
   Edge styling — refined, minimal
   ────────────────────────────────────────── */

const EDGE_COLORS: Record<string, string> = {
  owns: "#86efac",
  depends_on: "#93c5fd",
  blocks: "#fca5a5",
  relates_to: "#d1d5db",
};

function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => {
    const stroke = EDGE_COLORS[edge.type] ?? EDGE_COLORS.relates_to;
    const isImportant = edge.type === "blocks";

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: isImportant ? edge.type : undefined,
      type: "smoothstep",
      animated: edge.type === "blocks",
      style: {
        stroke,
        strokeWidth: isImportant ? 2 : 1.5,
        strokeOpacity: 0.8,
      },
      labelStyle: {
        fontSize: 9,
        fontWeight: 500,
        fill: "#9ca3af",
        fontFamily: "var(--font-sans)",
      },
    };
  });
}

/* ──────────────────────────────────────────
   GraphPanel component
   ────────────────────────────────────────── */

interface GraphPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphPanel({ nodes, edges }: GraphPanelProps) {
  const initialNodes = useMemo(() => toFlowNodes(nodes), [nodes]);
  const initialEdges = useMemo(() => toFlowEdges(edges), [edges]);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  useEffect(() => {
    setFlowNodes(initialNodes);
    setFlowEdges(initialEdges);

    if (flowRef.current && initialNodes.length > 0) {
      requestAnimationFrame(() => {
        flowRef.current?.fitView({ padding: 0.35, duration: 400 });
      });
    }
  }, [initialEdges, initialNodes, setFlowEdges, setFlowNodes]);

  const onInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    flowRef.current = instance;
    if (initialNodes.length > 0) {
      instance.fitView({ padding: 0.35 });
    }
  }, [initialNodes.length]);

  return (
    <ReactFlow
      colorMode="light"
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={onInit}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.35 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: "smoothstep" }}
    >
      <Background gap={20} size={1} color="#e5e7eb" />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
