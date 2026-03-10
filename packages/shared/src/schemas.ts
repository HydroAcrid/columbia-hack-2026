import { z } from "zod";

// ---------- Enums ----------

export const NodeType = z.enum(["person", "team", "system", "milestone"]);
export type NodeType = z.infer<typeof NodeType>;

export const EdgeType = z.enum(["owns", "depends_on", "blocks", "relates_to"]);
export type EdgeType = z.infer<typeof EdgeType>;

// ---------- Transcript ----------

export const TranscriptWord = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speakerId: z.string().optional(),
  confidence: z.number().optional(),
});
export type TranscriptWord = z.infer<typeof TranscriptWord>;

export const TranscriptChunk = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  timestamp: z.number(),
  start: z.number().optional(),
  end: z.number().optional(),
  words: z.array(TranscriptWord).optional(),
});
export type TranscriptChunk = z.infer<typeof TranscriptChunk>;

export const SpeakerProfile = z
  .object({
    speakerId: z.string(),
    name: z.string(),
    confidence: z.enum(["low", "medium", "high"]).default("low"),
    evidenceCount: z.number().int().nonnegative().default(0),
    sourceSpeakerIds: z.array(z.string()).optional(),
  })
  .transform((profile) => ({
    ...profile,
    sourceSpeakerIds: profile.sourceSpeakerIds?.length ? profile.sourceSpeakerIds : [profile.speakerId],
  }));
export type SpeakerProfile = z.infer<typeof SpeakerProfile>;

// ---------- Graph primitives ----------

export const GraphNode = z.object({
  id: z.string(),
  label: z.string(),
  type: NodeType,
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: EdgeType,
  label: z.string().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

// ---------- Insight items ----------

export const DecisionItem = z.object({
  id: z.string(),
  text: z.string(),
  timestamp: z.number(),
});
export type DecisionItem = z.infer<typeof DecisionItem>;

export const ActionItem = z.object({
  id: z.string(),
  text: z.string(),
  owner: z.string().optional(),
  timestamp: z.number(),
});
export type ActionItem = z.infer<typeof ActionItem>;

export const IssueItem = z.object({
  id: z.string(),
  text: z.string(),
  severity: z.enum(["blocker", "warning", "info"]).default("warning"),
  timestamp: z.number(),
});
export type IssueItem = z.infer<typeof IssueItem>;

// ---------- Graph patch event (SSE payload) ----------

export const GraphPatchEvent = z.object({
  addNodes: z.array(GraphNode).optional(),
  updateNodes: z.array(GraphNode.partial().extend({ id: z.string() })).optional(),
  addEdges: z.array(GraphEdge).optional(),
  addDecisions: z.array(DecisionItem).optional(),
  addActions: z.array(ActionItem).optional(),
  addIssues: z.array(IssueItem).optional(),
  upsertSpeakerProfiles: z.array(SpeakerProfile).optional(),
  highlightNodeIds: z.array(z.string()).optional(),
  interruptMessage: z.string().optional(),
});
export type GraphPatchEvent = z.infer<typeof GraphPatchEvent>;

// ---------- Session state ----------

export const SessionState = z.object({
  id: z.string(),
  transcript: z.array(TranscriptChunk),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  decisions: z.array(DecisionItem),
  actions: z.array(ActionItem),
  issues: z.array(IssueItem),
  speakerProfiles: z.array(SpeakerProfile).default([]),
});
export type SessionState = z.infer<typeof SessionState>;
