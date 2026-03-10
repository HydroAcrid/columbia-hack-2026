import test from "node:test";
import assert from "node:assert/strict";
import type {
  ActionItem,
  DecisionItem,
  GraphPatchEvent,
  IssueItem,
  SessionState,
} from "@copilot/shared";
import {
  buildCricketAnswerContext,
  buildLiveExtractionContext,
  mergePatchIntoSessionState,
  mergeActionItems,
  mergeDecisionItems,
  mergeIssueItems,
  normalizeGraphPatch,
} from "./graph-engine.js";

function createState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "session-1",
    transcript: [],
    nodes: [],
    edges: [],
    decisions: [],
    actions: [],
    issues: [],
    speakerProfiles: [],
    ...overrides,
  };
}

test("normalizes spoken alias variants to existing canonical graph nodes", () => {
  const state = createState({
    nodes: [
      { id: "supabase", label: "Supabase", type: "system" },
      { id: "onboarding", label: "Onboarding Flow", type: "system" },
    ],
  });

  const patch: GraphPatchEvent = {
    addNodes: [
      { id: "superbase", label: "superbase", type: "system" },
    ],
    addEdges: [
      {
        id: "e-superbase-onboarding",
        source: "superbase",
        target: "onboarding",
        type: "depends_on",
        label: "auth hook",
      },
    ],
  };

  const normalized = normalizeGraphPatch(patch, state);

  assert.equal(normalized.addNodes, undefined);
  assert.deepEqual(normalized.addEdges, [
    {
      id: "e-supabase-onboarding",
      source: "supabase",
      target: "onboarding",
      type: "depends_on",
      label: "auth hook",
    },
  ]);
});

test("suppresses generic orphan nodes and weak relates_to edges", () => {
  const state = createState();
  const patch: GraphPatchEvent = {
    addNodes: [
      { id: "backend", label: "backend", type: "system" },
      { id: "payments", label: "Payments API", type: "system" },
    ],
    addEdges: [
      {
        id: "e-backend-payments",
        source: "backend",
        target: "payments",
        type: "relates_to",
        label: "mentioned near",
      },
    ],
  };

  const normalized = normalizeGraphPatch(patch, state);

  assert.equal(normalized.addNodes, undefined);
  assert.equal(normalized.addEdges, undefined);
});

test("dedupes repeated actions by semantic text and normalized owner", () => {
  const target: ActionItem[] = [
    { id: "a-1", text: "Own Supabase migration", owner: "Kevin", timestamp: 10 },
  ];

  mergeActionItems(target, [
    { id: "a-2", text: "Own superbase migration", owner: "kevin", timestamp: 14 },
  ]);

  assert.equal(target.length, 1);
  assert.equal(target[0]?.text, "Own superbase migration");
  assert.equal(target[0]?.owner, "kevin");
  assert.equal(target[0]?.timestamp, 10);
});

test("dedupes repeated decisions and issues semantically", () => {
  const decisions: DecisionItem[] = [
    { id: "d-1", text: "Ship with Supabase auth", timestamp: 12 },
  ];
  const issues: IssueItem[] = [
    { id: "i-1", text: "Supabase callback is failing in staging", severity: "warning", timestamp: 20 },
  ];

  mergeDecisionItems(decisions, [
    { id: "d-2", text: "Ship with superbase auth", timestamp: 18 },
  ]);
  mergeIssueItems(issues, [
    { id: "i-2", text: "superbase callback is failing in staging", severity: "blocker", timestamp: 26 },
  ]);

  assert.equal(decisions.length, 1);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.severity, "blocker");
});

test("protects graph budgets by prioritizing blocker structure in dense sessions", () => {
  const existingNodes = Array.from({ length: 16 }, (_, index) => ({
    id: `existing-${index}`,
    label: `Existing ${index}`,
    type: "system" as const,
  }));

  const state = createState({
    nodes: [
      ...existingNodes,
      { id: "launch", label: "Launch", type: "milestone" },
    ],
  });

  const patch: GraphPatchEvent = {
    addNodes: [
      { id: "payments", label: "Payments Service", type: "system" },
      { id: "auth", label: "Auth Callback", type: "system" },
    ],
    addEdges: [
      {
        id: "e-auth-launch",
        source: "auth",
        target: "launch",
        type: "blocks",
        label: "blocking sign-in",
      },
      {
        id: "e-payments-launch",
        source: "payments",
        target: "launch",
        type: "owns",
        label: "owner",
      },
    ],
  };

  const normalized = normalizeGraphPatch(patch, state);

  assert.deepEqual(normalized.addNodes, [
    { id: "auth-callback", label: "Auth Callback", type: "system" },
  ]);
  assert.deepEqual(normalized.addEdges, [
    {
      id: "e-auth-callback-launch",
      source: "auth-callback",
      target: "launch",
      type: "blocks",
      label: "blocking sign-in",
    },
  ]);
});

test("builds a slim live extraction context with limited transcript, nodes, edges, and speakers", () => {
  const state = createState({
    transcript: [
      { id: "old-1", speaker: "Speaker 2", text: "Legacy Service was mentioned earlier", timestamp: 1 },
      { id: "old-2", speaker: "Speaker 0", text: "Kevin owns launch prep", timestamp: 2 },
      { id: "old-3", speaker: "Speaker 1", text: "Cloud Run is blocking launch", timestamp: 3 },
    ],
    nodes: [
      { id: "kevin", label: "Kevin", type: "person" },
      { id: "launch", label: "Launch", type: "milestone" },
      { id: "cloud-run", label: "Cloud Run", type: "system" },
      { id: "supabase", label: "Supabase", type: "system" },
      { id: "legacy-service", label: "Legacy Service", type: "system" },
    ],
    edges: [
      {
        id: "e-cloud-run-launch",
        source: "cloud-run",
        target: "launch",
        type: "blocks",
        label: "blocks",
      },
      {
        id: "e-legacy-supabase",
        source: "legacy-service",
        target: "supabase",
        type: "relates_to",
        label: "mentioned with",
      },
    ],
    speakerProfiles: [
      {
        speakerId: "kevin",
        name: "Kevin",
        confidence: "high",
        evidenceCount: 3,
        sourceSpeakerIds: ["Speaker 0"],
      },
      {
        speakerId: "marcus",
        name: "Marcus",
        confidence: "medium",
        evidenceCount: 2,
        sourceSpeakerIds: ["Speaker 9"],
      },
    ],
  });

  const context = buildLiveExtractionContext(
    state,
    [
      {
        id: "new-1",
        speaker: "Speaker 0",
        text: "Kevin says Cloud Run is still blocking launch with Supabase auth.",
        timestamp: 4,
      },
    ],
    {
      transcriptLines: 2,
      nodeLimit: 3,
      edgeLimit: 1,
    },
  );

  assert.match(context, /- Speaker 0 => Kevin \[kevin\] \(high\)/);
  assert.doesNotMatch(context, /Speaker 9 => Marcus \[marcus\]/);
  assert.match(context, /- kevin \| Kevin \| person/);
  assert.match(context, /- launch \| Launch \| milestone/);
  assert.match(context, /- cloud-run \| Cloud Run \| system/);
  assert.doesNotMatch(context, /Legacy Service/);
  assert.match(context, /- cloud-run -\[blocks\]-> launch/);
  assert.doesNotMatch(context, /e-legacy-supabase/);
  assert.match(context, /Kevin \[Speaker 0\]: Kevin owns launch prep/);
  assert.match(context, /Speaker 1: Cloud Run is blocking launch/);
  assert.doesNotMatch(context, /Legacy Service was mentioned earlier/);
  assert.match(context, /"superbase" => "Supabase"/);
});

test("builds a dedicated Cricket answer context with insights and graph state", () => {
  const state = createState({
    transcript: [
      { id: "t-1", speaker: "Speaker 0", text: "Cricket, who owns staging?", timestamp: 1 },
      { id: "t-2", speaker: "Speaker 1", text: "Kevin owns the staging fix.", timestamp: 2 },
    ],
    nodes: [
      { id: "kevin", label: "Kevin", type: "person" },
      { id: "staging", label: "Staging", type: "system" },
      { id: "launch", label: "Launch", type: "milestone" },
    ],
    edges: [
      { id: "e-staging-launch", source: "staging", target: "launch", type: "blocks", label: "blocks" },
    ],
    decisions: [
      { id: "d-1", text: "Fix staging before final QA.", timestamp: 2 },
    ],
    actions: [
      { id: "a-1", text: "Fix staging reliability", owner: "Kevin", timestamp: 2 },
    ],
    issues: [
      { id: "i-1", text: "Staging is blocking launch readiness.", severity: "blocker", timestamp: 2 },
    ],
    speakerProfiles: [
      {
        speakerId: "kevin",
        name: "Kevin",
        confidence: "high",
        evidenceCount: 3,
        sourceSpeakerIds: ["Speaker 1"],
      },
    ],
  });

  const context = buildCricketAnswerContext(state, "Cricket, who owns staging?");

  assert.match(context, /Current user request to Cricket/);
  assert.match(context, /Meeting state summary/);
  assert.match(context, /- decisions: 1/);
  assert.match(context, /- actions: 1/);
  assert.match(context, /- blockers: 1/);
  assert.match(context, /Fix staging before final QA/);
  assert.match(context, /Fix staging reliability \(owner: Kevin\)/);
  assert.match(context, /\[blocker\] Staging is blocking launch readiness/);
  assert.match(context, /Kevin \(person\)/);
  assert.match(context, /Kevin \[kevin\] <= Speaker 1 \(high\)/);
});

test("merges a normalized patch into session state for Cricket answer context", () => {
  const state = createState({
    transcript: [{ id: "t-1", speaker: "Speaker 0", text: "Cricket, who owns staging?", timestamp: 1 }],
  });

  const merged = mergePatchIntoSessionState(state, {
    addNodes: [{ id: "kevin", label: "Kevin", type: "person" }],
    addActions: [{ id: "a-1", text: "Fix staging reliability", owner: "Kevin", timestamp: 1 }],
    addIssues: [{ id: "i-1", text: "Staging is blocking launch readiness.", severity: "blocker", timestamp: 1 }],
  });

  assert.equal(state.nodes.length, 0);
  assert.equal(merged.nodes.length, 1);
  assert.equal(merged.actions[0]?.owner, "Kevin");
  assert.equal(merged.issues[0]?.severity, "blocker");
});
