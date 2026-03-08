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
