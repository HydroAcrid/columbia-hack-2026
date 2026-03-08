import {
  applyPatch,
  canonicalizeGraphLabel,
  getCanonicalAliasEntries,
  normalizeGraphLabel,
  slugifyGraphId,
} from "@copilot/graph";
import type {
  ActionItem,
  DecisionItem,
  GraphEdge,
  GraphNode,
  GraphPatchEvent,
  IssueItem,
  SessionState,
  TranscriptChunk,
} from "@copilot/shared";

const GRAPH_BUDGET = {
  maxNodes: 16,
  maxEdges: 20,
} as const;

const GENERIC_NODE_LABELS = new Set([
  "api",
  "app",
  "backend",
  "database",
  "flow",
  "frontend",
  "infra",
  "infrastructure",
  "platform",
  "service",
  "system",
  "team",
]);

const EDGE_PRIORITY: Record<GraphEdge["type"], number> = {
  blocks: 4,
  depends_on: 3,
  owns: 2,
  relates_to: 1,
};

const LIVE_ALIAS_CANONICALS = new Set([
  "Cloud Run",
  "Google Cloud",
  "Postgres",
  "Supabase",
]);

export interface LiveExtractionContextOptions {
  transcriptLines: number;
  nodeLimit: number;
  edgeLimit: number;
}

export function buildGraphExtractionContext(state: SessionState, chunks: TranscriptChunk[]) {
  const chunkIds = new Set(chunks.map((chunk) => chunk.id));
  const priorTranscript = state.transcript
    .filter((chunk) => !chunkIds.has(chunk.id))
    .slice(-6)
    .map((chunk) => `${chunk.speaker}: ${chunk.text}`);

  const entityInventory = state.nodes
    .slice()
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((node) => {
      const variants = getCanonicalAliasEntries()
        .filter((entry) => entry.canonical === node.label)
        .map((entry) => entry.spoken);
      const variantSuffix = variants.length ? ` | spoken variants: ${variants.join(", ")}` : "";
      return `- ${node.id} | ${node.label} | ${node.type}${variantSuffix}`;
    });

  const edgeInventory = state.edges
    .slice(-12)
    .map((edge) => `- ${edge.source} -[${edge.type}]-> ${edge.target}`);

  const speakerInventory = state.speakerProfiles
    .map((profile) => `- ${profile.speakerId} => ${profile.name} (${profile.confidence})`)
    .sort();

  return [
    "## Canonical entity inventory (reuse these IDs and labels when relevant)",
    entityInventory.length ? entityInventory.join("\n") : "(none yet)",
    "",
    "## Existing graph structure",
    edgeInventory.length ? edgeInventory.join("\n") : "(no edges yet)",
    "",
    "## Known spoken/canonical corrections",
    getCanonicalAliasEntries()
      .map((entry) => `- "${entry.spoken}" => "${entry.canonical}"`)
      .join("\n"),
    "",
    "## Known speaker identities",
    speakerInventory.length ? speakerInventory.join("\n") : "(none yet)",
    "",
    `## Graph cleanliness policy
- Current graph size: ${state.nodes.length} nodes / ${state.edges.length} edges
- Reuse canonical entities instead of inventing near-duplicates
- Skip generic nouns unless explicitly scoped
- Prefer no output over weak or redundant output
- Avoid low-value "relates_to" edges`,
    "",
    "## Recent conversation context before these chunks",
    priorTranscript.length ? priorTranscript.join("\n") : "(start of conversation)",
  ].join("\n");
}

export function buildLiveExtractionContext(
  state: SessionState,
  chunks: TranscriptChunk[],
  options: LiveExtractionContextOptions,
) {
  const chunkIds = new Set(chunks.map((chunk) => chunk.id));
  const priorChunks = state.transcript
    .filter((chunk) => !chunkIds.has(chunk.id))
    .slice(-options.transcriptLines);
  const priorTranscript = priorChunks.map((chunk) => `${chunk.speaker}: ${chunk.text}`);
  const batchText = normalizeGraphLabel(chunks.map((chunk) => chunk.text).join(" "));
  const priorText = normalizeGraphLabel(priorChunks.map((chunk) => chunk.text).join(" "));
  const selectedNodes = selectLiveContextNodes(
    state.nodes,
    state.edges,
    batchText,
    priorText,
    options.nodeLimit,
  );
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = selectLiveContextEdges(state.edges, selectedNodeIds, options.edgeLimit);
  const speakerIds = new Set(chunks.map((chunk) => chunk.speaker));
  const speakerInventory = state.speakerProfiles
    .filter((profile) => speakerIds.has(profile.speakerId))
    .map((profile) => `- ${profile.speakerId} => ${profile.name} (${profile.confidence})`)
    .sort();
  const aliasInventory = getCanonicalAliasEntries()
    .filter((entry) => LIVE_ALIAS_CANONICALS.has(entry.canonical))
    .map((entry) => `- "${entry.spoken}" => "${entry.canonical}"`);

  return [
    "## Reuse these canonical entities when relevant",
    selectedNodes.length
      ? selectedNodes.map((node) => `- ${node.id} | ${node.label} | ${node.type}`).join("\n")
      : "(none yet)",
    "",
    "## Relevant existing edges",
    selectedEdges.length
      ? selectedEdges.map((edge) => `- ${edge.source} -[${edge.type}]-> ${edge.target}`).join("\n")
      : "(none yet)",
    "",
    "## Demo-critical spoken corrections",
    aliasInventory.length ? aliasInventory.join("\n") : "(none)",
    "",
    "## Speakers in this batch",
    speakerInventory.length ? speakerInventory.join("\n") : "(none yet)",
    "",
    "## Recent conversation context",
    priorTranscript.length ? priorTranscript.join("\n") : "(start of conversation)",
    "",
    `## Clean graph rules
- Current graph size: ${state.nodes.length} nodes / ${state.edges.length} edges
- Reuse canonical IDs and labels
- Skip generic nouns and weak structure
- Prefer blockers, dependencies, owners, milestones, decisions, actions, and issues`,
  ].join("\n");
}

export function buildCricketAnswerContext(
  state: SessionState,
  triggeringRequest: string,
) {
  const normalizedRequest = normalizeGraphLabel(triggeringRequest);
  const recentTranscript = state.transcript
    .slice(-8)
    .map((chunk) => `${chunk.speaker}: ${chunk.text}`);
  const selectedNodes = selectLiveContextNodes(
    state.nodes,
    state.edges,
    normalizedRequest,
    normalizedRequest,
    12,
  );
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = selectLiveContextEdges(state.edges, selectedNodeIds, 10);
  const labelById = new Map(state.nodes.map((node) => [node.id, node.label]));
  const speakerInventory = state.speakerProfiles
    .map((profile) => `- ${profile.speakerId} => ${profile.name} (${profile.confidence})`)
    .sort();
  const decisions = state.decisions
    .slice(-6)
    .map((decision) => `- ${decision.text}`);
  const actions = state.actions
    .slice(-6)
    .map((action) => `- ${action.text}${action.owner ? ` (owner: ${action.owner})` : ""}`);
  const issues = state.issues
    .slice(-6)
    .map((issue) => `- [${issue.severity}] ${issue.text}`);
  const summaryLines = [
    `- decisions: ${state.decisions.length}`,
    `- actions: ${state.actions.length}`,
    `- issues: ${state.issues.length}`,
    `- blockers: ${state.issues.filter((issue) => issue.severity === "blocker").length}`,
    `- warnings: ${state.issues.filter((issue) => issue.severity === "warning").length}`,
    `- graph nodes: ${state.nodes.length}`,
    `- graph edges: ${state.edges.length}`,
  ];

  return [
    "## Current user request to Cricket",
    triggeringRequest,
    "",
    "## Meeting state summary",
    summaryLines.join("\n"),
    "",
    "## Recent meeting transcript",
    recentTranscript.length ? recentTranscript.join("\n") : "(no recent transcript yet)",
    "",
    "## Current decisions",
    decisions.length ? decisions.join("\n") : "(none yet)",
    "",
    "## Current action items",
    actions.length ? actions.join("\n") : "(none yet)",
    "",
    "## Current issues and blockers",
    issues.length ? issues.join("\n") : "(none yet)",
    "",
    "## Relevant graph entities",
    selectedNodes.length
      ? selectedNodes.map((node) => `- ${node.label} (${node.type})`).join("\n")
      : "(none yet)",
    "",
    "## Relevant graph relationships",
    selectedEdges.length
      ? selectedEdges
        .map((edge) => {
          const source = labelById.get(edge.source) ?? edge.source;
          const target = labelById.get(edge.target) ?? edge.target;
          return `- ${source} -[${edge.type}]-> ${target}`;
        })
        .join("\n")
      : "(none yet)",
    "",
    "## Known speaker identities",
    speakerInventory.length ? speakerInventory.join("\n") : "(none yet)",
  ].join("\n");
}

export function mergePatchIntoSessionState(
  state: SessionState,
  patch: GraphPatchEvent,
): SessionState {
  const graph = applyPatch(
    {
      nodes: state.nodes,
      edges: state.edges,
    },
    patch,
  );

  const nextState: SessionState = {
    ...state,
    transcript: [...state.transcript],
    nodes: graph.nodes,
    edges: graph.edges,
    decisions: [...state.decisions],
    actions: [...state.actions],
    issues: [...state.issues],
    speakerProfiles: [...state.speakerProfiles],
  };

  mergeDecisionItems(nextState.decisions, patch.addDecisions);
  mergeActionItems(nextState.actions, patch.addActions);
  mergeIssueItems(nextState.issues, patch.addIssues);
  mergeSpeakerProfiles(nextState, patch.upsertSpeakerProfiles);

  return nextState;
}

export function normalizeGraphPatch(
  patch: GraphPatchEvent,
  state: SessionState,
): GraphPatchEvent {
  const idRemap = new Map<string, string>();
  const existingNodes = state.nodes;
  const existingIds = new Set(existingNodes.map((node) => node.id));
  const newNodes: GraphNode[] = [];
  const seenNodeKeys = new Set<string>();
  const graphIsDense = state.nodes.length >= GRAPH_BUDGET.maxNodes || state.edges.length >= GRAPH_BUDGET.maxEdges;

  for (const incomingNode of patch.addNodes ?? []) {
    const canonicalNode = canonicalizeIncomingNode(incomingNode, existingNodes, newNodes, existingIds);
    idRemap.set(incomingNode.id, canonicalNode.id);

    if (canonicalNode.existing || isGenericNodeLabel(canonicalNode.node)) {
      continue;
    }

    const key = nodeKey(canonicalNode.node);
    if (seenNodeKeys.has(key)) {
      continue;
    }

    seenNodeKeys.add(key);
    newNodes.push(canonicalNode.node);
    existingIds.add(canonicalNode.node.id);
  }

  const normalizedActions = dedupeActionItems(
    normalizeActionItems(patch.addActions ?? [], state, newNodes),
  );
  const normalizedDecisions = dedupeDecisionItems(patch.addDecisions ?? []);
  const normalizedIssues = dedupeIssueItems(patch.addIssues ?? []);
  const ownerLabels = new Set(
    normalizedActions
      .map((action) => action.owner)
      .filter((owner): owner is string => Boolean(owner))
      .map((owner) => normalizeGraphLabel(owner)),
  );

  const normalizedEdges = dedupeEdges(
    normalizeEdges(patch.addEdges ?? [], state, newNodes, idRemap, ownerLabels, graphIsDense),
  );

  const keptNodes = filterAndBudgetNodes(newNodes, normalizedEdges, ownerLabels, state.nodes.length);
  const keptNodeIds = new Set(keptNodes.map((node) => node.id));
  const keptEdges = filterAndBudgetEdges(
    normalizedEdges.filter((edge) => keptNodeIds.has(edge.source) || existingIds.has(edge.source))
      .filter((edge) => keptNodeIds.has(edge.target) || existingIds.has(edge.target)),
    state.edges.length,
  );
  const highlightNodeIds = dedupeStrings(
    (patch.highlightNodeIds ?? [])
      .map((id) => idRemap.get(id) ?? id)
      .filter((id) => keptNodeIds.has(id) || existingNodes.some((node) => node.id === id)),
  );

  return compactGraphPatch({
    ...patch,
    addNodes: keptNodes,
    addEdges: keptEdges,
    addActions: normalizedActions,
    addDecisions: normalizedDecisions,
    addIssues: normalizedIssues,
    highlightNodeIds,
  });
}

export function mergeDecisionItems(
  target: DecisionItem[],
  items: DecisionItem[] | undefined,
) {
  mergeBySemanticKey(target, items, (item) => normalizeInsightText(item.text), (existing, incoming) => ({
    ...existing,
    text: pickPreferredText(existing.text, incoming.text),
    timestamp: Math.min(existing.timestamp, incoming.timestamp),
  }));
}

export function mergeActionItems(
  target: ActionItem[],
  items: ActionItem[] | undefined,
) {
  mergeBySemanticKey(
    target,
    items,
    (item) => `${normalizeInsightText(item.text)}|${normalizeGraphLabel(item.owner ?? "")}`,
    (existing, incoming) => ({
      ...existing,
      text: pickPreferredText(existing.text, incoming.text),
      owner: incoming.owner ?? existing.owner,
      timestamp: Math.min(existing.timestamp, incoming.timestamp),
    }),
  );
}

export function mergeIssueItems(
  target: IssueItem[],
  items: IssueItem[] | undefined,
) {
  mergeBySemanticKey(
    target,
    items,
    (item) => normalizeInsightText(item.text),
    (existing, incoming) => ({
      ...existing,
      text: pickPreferredText(existing.text, incoming.text),
      severity: pickMoreSevereIssue(existing.severity, incoming.severity),
      timestamp: Math.min(existing.timestamp, incoming.timestamp),
    }),
  );
}

function canonicalizeIncomingNode(
  node: GraphNode,
  existingNodes: GraphNode[],
  pendingNodes: GraphNode[],
  usedIds: Set<string>,
) {
  const canonicalLabel = canonicalizeGraphLabel(node.label);
  const normalizedKey = `${node.type}:${normalizeGraphLabel(canonicalLabel)}`;
  const existingNode = [...existingNodes, ...pendingNodes].find((candidate) => nodeKey(candidate) === normalizedKey);

  if (existingNode) {
    return {
      existing: true,
      id: existingNode.id,
      node: existingNode,
    };
  }

  const preferredId = slugifyGraphId(canonicalLabel);
  const id = ensureUniqueNodeId(preferredId || node.id, node.type, usedIds);

  return {
    existing: false,
    id,
    node: {
      ...node,
      id,
      label: canonicalLabel,
    },
  };
}

function normalizeActionItems(
  actions: ActionItem[],
  state: SessionState,
  newNodes: GraphNode[],
) {
  return actions.map((action) => ({
    ...action,
    owner: normalizeOwner(action.owner, state, newNodes),
    text: canonicalizeInsightText(action.text),
  }));
}

function normalizeEdges(
  edges: GraphEdge[],
  state: SessionState,
  newNodes: GraphNode[],
  idRemap: Map<string, string>,
  ownerLabels: Set<string>,
  graphIsDense: boolean,
) {
  const availableNodes = [...state.nodes, ...newNodes];

  return edges
    .map((edge) => {
      const source = resolveNodeReference(edge.source, availableNodes, idRemap);
      const target = resolveNodeReference(edge.target, availableNodes, idRemap);
      if (!source || !target || source === target) {
        return null;
      }

      return {
        ...edge,
        id: `e-${source}-${target}`,
        source,
        target,
      } satisfies GraphEdge;
    })
    .filter((edge): edge is GraphEdge => Boolean(edge))
    .filter((edge) => edge.type !== "relates_to")
    .filter((edge) => {
      if (!graphIsDense) {
        return true;
      }

      if (edge.type === "blocks" || edge.type === "depends_on") {
        return true;
      }

      if (edge.type === "owns") {
        const sourceNode = availableNodes.find((node) => node.id === edge.source);
        const targetNode = availableNodes.find((node) => node.id === edge.target);
        return (
          Boolean(sourceNode && ownerLabels.has(normalizeGraphLabel(sourceNode.label))) &&
          targetNode?.type === "milestone"
        );
      }

      return false;
    });
}

function filterAndBudgetNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  ownerLabels: Set<string>,
  existingNodeCount: number,
) {
  const referencedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const eligibleNodes = nodes.filter((node) => (
    referencedIds.has(node.id) ||
    node.type === "milestone" ||
    ownerLabels.has(normalizeGraphLabel(node.label))
  ));

  const remainingBudget = Math.max(0, GRAPH_BUDGET.maxNodes - existingNodeCount);
  if (remainingBudget === 0) {
    return eligibleNodes
      .slice()
      .sort((left, right) => scoreNode(right, edges, ownerLabels) - scoreNode(left, edges, ownerLabels))
      .filter((node) => scoreNode(node, edges, ownerLabels) >= EDGE_PRIORITY.depends_on)
      .slice(0, 2);
  }

  if (eligibleNodes.length <= remainingBudget) {
    return eligibleNodes;
  }

  return eligibleNodes
    .slice()
    .sort((left, right) => scoreNode(right, edges, ownerLabels) - scoreNode(left, edges, ownerLabels))
    .slice(0, remainingBudget);
}

function filterAndBudgetEdges(edges: GraphEdge[], existingEdgeCount: number) {
  const remainingBudget = Math.max(0, GRAPH_BUDGET.maxEdges - existingEdgeCount);
  if (remainingBudget === 0) {
    return edges
      .filter((edge) => edge.type === "blocks" || edge.type === "depends_on")
      .slice(0, 2);
  }

  if (edges.length <= remainingBudget) {
    return edges;
  }

  return edges
    .slice()
    .sort((left, right) => EDGE_PRIORITY[right.type] - EDGE_PRIORITY[left.type])
    .slice(0, remainingBudget);
}

function scoreNode(node: GraphNode, edges: GraphEdge[], ownerLabels: Set<string>) {
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const edgeScore = connectedEdges.reduce((total, edge) => total + EDGE_PRIORITY[edge.type], 0);
  const milestoneBonus = node.type === "milestone" ? 3 : 0;
  const ownerBonus = ownerLabels.has(normalizeGraphLabel(node.label)) ? 2 : 0;
  return edgeScore + milestoneBonus + ownerBonus;
}

function dedupeEdges(edges: GraphEdge[]) {
  const merged = new Map<string, GraphEdge>();

  for (const edge of edges) {
    const key = `${edge.source}:${edge.target}:${edge.type}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, edge);
      continue;
    }

    merged.set(key, {
      ...existing,
      label: pickPreferredText(existing.label ?? "", edge.label ?? "") || undefined,
    });
  }

  return [...merged.values()];
}

function dedupeDecisionItems(items: DecisionItem[]) {
  return dedupeItems(items, (item) => normalizeInsightText(item.text));
}

function dedupeActionItems(items: ActionItem[]) {
  return dedupeItems(items, (item) => `${normalizeInsightText(item.text)}|${normalizeGraphLabel(item.owner ?? "")}`);
}

function dedupeIssueItems(items: IssueItem[]) {
  return dedupeItems(items, (item) => normalizeInsightText(item.text));
}

function mergeSpeakerProfiles(
  state: SessionState,
  profiles: SessionState["speakerProfiles"] | undefined,
) {
  if (!profiles?.length) {
    return;
  }

  const merged = new Map(
    state.speakerProfiles.map((profile) => [profile.speakerId, profile]),
  );

  for (const profile of profiles) {
    merged.set(profile.speakerId, profile);
  }

  state.speakerProfiles = [...merged.values()].sort((left, right) =>
    left.speakerId.localeCompare(right.speakerId),
  );
}

function dedupeItems<T>(items: T[], keyFor: (item: T) => string) {
  const deduped = new Map<string, T>();

  for (const item of items) {
    const key = keyFor(item);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()];
}

function normalizeOwner(owner: string | undefined, state: SessionState, newNodes: GraphNode[]) {
  if (!owner) {
    return owner;
  }

  const candidates = [
    ...state.nodes.filter((node) => node.type === "person"),
    ...newNodes.filter((node) => node.type === "person"),
  ];
  const normalizedOwner = normalizeGraphLabel(owner);
  const matchingNode = candidates.find((node) => normalizeGraphLabel(node.label) === normalizedOwner);
  if (matchingNode) {
    return matchingNode.label;
  }

  const matchingProfile = state.speakerProfiles.find((profile) => normalizeGraphLabel(profile.name) === normalizedOwner);
  if (matchingProfile) {
    return matchingProfile.name;
  }

  return owner.trim();
}

function selectLiveContextNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  batchText: string,
  priorText: string,
  limit: number,
) {
  return nodes
    .slice()
    .map((node) => ({
      node,
      score: scoreLiveContextNode(node, edges, batchText, priorText),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.node.label.localeCompare(right.node.label);
    })
    .slice(0, limit)
    .map((entry) => entry.node);
}

function scoreLiveContextNode(
  node: GraphNode,
  edges: GraphEdge[],
  batchText: string,
  priorText: string,
) {
  const normalizedLabel = normalizeGraphLabel(node.label);
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const connectionScore = connectedEdges.reduce((total, edge) => total + EDGE_PRIORITY[edge.type], 0);
  let score = 0;

  if (normalizedLabel && batchText.includes(normalizedLabel)) {
    score += 8;
  }
  if (normalizedLabel && priorText.includes(normalizedLabel)) {
    score += 4;
  }

  if (node.type === "milestone") {
    score += 4;
  } else if (node.type === "person") {
    score += 3;
  } else if (node.type === "system") {
    score += 2;
  }

  return score + connectionScore;
}

function selectLiveContextEdges(edges: GraphEdge[], selectedNodeIds: Set<string>, limit: number) {
  return edges
    .slice()
    .map((edge) => ({
      edge,
      score: EDGE_PRIORITY[edge.type] +
        (selectedNodeIds.has(edge.source) ? 2 : 0) +
        (selectedNodeIds.has(edge.target) ? 2 : 0),
    }))
    .filter((entry) => entry.edge.type !== "relates_to")
    .filter((entry) => entry.score > EDGE_PRIORITY.relates_to)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.edge.id.localeCompare(right.edge.id);
    })
    .slice(0, limit)
    .map((entry) => entry.edge);
}

function resolveNodeReference(
  rawReference: string,
  nodes: GraphNode[],
  idRemap: Map<string, string>,
) {
  const remapped = idRemap.get(rawReference) ?? rawReference;
  if (nodes.some((node) => node.id === remapped)) {
    return remapped;
  }

  const normalizedReference = normalizeGraphLabel(rawReference);
  const matches = nodes.filter((node) => normalizeGraphLabel(node.label) === normalizedReference);
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

function isGenericNodeLabel(node: GraphNode) {
  const normalized = normalizeGraphLabel(node.label);
  return GENERIC_NODE_LABELS.has(normalized);
}

function ensureUniqueNodeId(baseId: string, type: GraphNode["type"], usedIds: Set<string>) {
  const base = baseId || `${type}-node`;
  if (!usedIds.has(base)) {
    return base;
  }

  let candidate = `${base}-${type}`;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${type}-${index}`;
    index += 1;
  }

  return candidate;
}

function compactGraphPatch(patch: GraphPatchEvent): GraphPatchEvent {
  const interruptMessage = typeof patch.interruptMessage === "string"
    ? patch.interruptMessage.trim() || undefined
    : undefined;

  return {
    ...patch,
    addNodes: patch.addNodes?.length ? patch.addNodes : undefined,
    addEdges: patch.addEdges?.length ? patch.addEdges : undefined,
    addActions: patch.addActions?.length ? patch.addActions : undefined,
    addDecisions: patch.addDecisions?.length ? patch.addDecisions : undefined,
    addIssues: patch.addIssues?.length ? patch.addIssues : undefined,
    highlightNodeIds: patch.highlightNodeIds?.length ? patch.highlightNodeIds : undefined,
    interruptMessage,
  };
}

function canonicalizeInsightText(text: string) {
  let next = text;
  for (const entry of getCanonicalAliasEntries()) {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.spoken)}\\b`, "gi");
    next = next.replace(pattern, entry.canonical);
  }

  return next.trim();
}

function normalizeInsightText(text: string) {
  return canonicalizeInsightText(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickPreferredText(existing: string, incoming: string) {
  const current = existing.trim();
  const next = incoming.trim();
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return next.length > current.length ? next : current;
}

function pickMoreSevereIssue(existing: IssueItem["severity"], incoming: IssueItem["severity"]) {
  const score = { blocker: 3, warning: 2, info: 1 } as const;
  return score[incoming] > score[existing] ? incoming : existing;
}

function mergeBySemanticKey<T>(
  target: T[],
  items: T[] | undefined,
  keyFor: (item: T) => string,
  merge: (existing: T, incoming: T) => T,
) {
  if (!items?.length) {
    return;
  }

  const indexByKey = new Map(target.map((item) => [keyFor(item), item]));
  for (const item of items) {
    const key = keyFor(item);
    const existing = indexByKey.get(key);
    if (!existing) {
      target.push(item);
      indexByKey.set(key, item);
      continue;
    }

    const merged = merge(existing, item);
    const targetIndex = target.indexOf(existing);
    target[targetIndex] = merged;
    indexByKey.set(key, merged);
  }
}

function nodeKey(node: Pick<GraphNode, "label" | "type">) {
  return `${node.type}:${normalizeGraphLabel(node.label)}`;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
