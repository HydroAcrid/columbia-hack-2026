import type {
  TranscriptChunk,
  GraphPatchEvent,
} from "./schemas.js";

export interface DemoExtraction {
  chunkId: TranscriptChunk["id"];
  patch: GraphPatchEvent;
}

export const demoTranscriptChunks: TranscriptChunk[] = [
  {
    id: "t1",
    speaker: "Priya (PM)",
    text: "Alright, let's lock down the launch timeline. We're targeting March 28 for the public release of Project Aurora.",
    timestamp: 0,
  },
  {
    id: "t2",
    speaker: "Kevin (Eng)",
    text: "The API gateway is ready, but the billing integration still depends on the payments team finishing their v2 migration.",
    timestamp: 8,
  },
  {
    id: "t3",
    speaker: "Sara (Design)",
    text: "The onboarding flow redesign is done on my end. I handed it off to frontend last week.",
    timestamp: 18,
  },
  {
    id: "t4",
    speaker: "Kevin (Eng)",
    text: "We picked that up. The new onboarding screens are in staging, but we haven't gotten QA sign-off yet.",
    timestamp: 26,
  },
  {
    id: "t5",
    speaker: "Priya (PM)",
    text: "Who owns the QA pass for onboarding? I don't see it assigned anywhere.",
    timestamp: 34,
  },
  {
    id: "t6",
    speaker: "Marcus (Ops)",
    text: "I can flag that with the QA lead, but honestly the staging environment has been flaky. We should fix the deploy pipeline first.",
    timestamp: 40,
  },
  {
    id: "t7",
    speaker: "Priya (PM)",
    text: "Okay, decision: we fix staging reliability before we run the final QA pass. Kevin, can your team own that?",
    timestamp: 50,
  },
  {
    id: "t8",
    speaker: "Kevin (Eng)",
    text: "Yes, we'll prioritise the staging fix. But if payments v2 slips, billing integration blocks the whole launch.",
    timestamp: 58,
  },
];

export const demoExtractions: DemoExtraction[] = [
  {
    chunkId: "t1",
    patch: {
      addNodes: [
        { id: "priya", label: "Priya", type: "person" },
        { id: "aurora-launch", label: "Aurora Launch (Mar 28)", type: "milestone" },
      ],
      addEdges: [
        { id: "e8", source: "priya", target: "aurora-launch", type: "owns", label: "driving" },
      ],
      addDecisions: [
        {
          id: "d2",
          text: "Target March 28 for Project Aurora public launch",
          timestamp: 0,
        },
      ],
      highlightNodeIds: ["priya", "aurora-launch"],
    },
  },
  {
    chunkId: "t2",
    patch: {
      addNodes: [
        { id: "kevin", label: "Kevin", type: "person" },
        { id: "eng", label: "Engineering", type: "team" },
        { id: "payments", label: "Payments Team", type: "team" },
        { id: "api-gateway", label: "API Gateway", type: "system" },
        { id: "billing", label: "Billing Integration", type: "system" },
      ],
      addEdges: [
        { id: "e1", source: "kevin", target: "eng", type: "owns", label: "leads" },
        { id: "e2", source: "eng", target: "api-gateway", type: "owns" },
        { id: "e3", source: "billing", target: "payments", type: "depends_on", label: "waiting on v2" },
      ],
      highlightNodeIds: ["billing", "payments", "api-gateway"],
    },
  },
  {
    chunkId: "t3",
    patch: {
      addNodes: [
        { id: "sara", label: "Sara", type: "person" },
        { id: "onboarding", label: "Onboarding Flow", type: "system" },
      ],
      addEdges: [
        { id: "e4", source: "sara", target: "onboarding", type: "owns", label: "designed" },
      ],
      highlightNodeIds: ["sara", "onboarding"],
    },
  },
  {
    chunkId: "t4",
    patch: {
      addNodes: [
        { id: "staging", label: "Staging Environment", type: "system" },
      ],
      addEdges: [
        { id: "e5", source: "eng", target: "onboarding", type: "owns", label: "implementing" },
      ],
      addIssues: [
        {
          id: "i3",
          text: "QA sign-off for onboarding is still pending",
          severity: "info",
          timestamp: 26,
        },
      ],
      highlightNodeIds: ["onboarding", "staging"],
    },
  },
  {
    chunkId: "t5",
    patch: {
      addIssues: [
        {
          id: "i1",
          text: "No owner assigned for onboarding QA pass",
          severity: "blocker",
          timestamp: 34,
        },
      ],
      highlightNodeIds: ["onboarding"],
    },
  },
  {
    chunkId: "t6",
    patch: {
      addNodes: [
        { id: "marcus", label: "Marcus", type: "person" },
      ],
      addEdges: [
        { id: "e7", source: "staging", target: "onboarding", type: "blocks", label: "flaky deploys" },
        { id: "e9", source: "marcus", target: "staging", type: "relates_to" },
      ],
      addActions: [
        {
          id: "a2",
          text: "Flag QA assignment for onboarding with QA lead",
          owner: "Marcus (Ops)",
          timestamp: 40,
        },
      ],
      highlightNodeIds: ["marcus", "staging", "onboarding"],
    },
  },
  {
    chunkId: "t7",
    patch: {
      addDecisions: [
        {
          id: "d1",
          text: "Fix staging reliability before running final QA pass",
          timestamp: 50,
        },
      ],
      highlightNodeIds: ["kevin", "staging", "onboarding"],
    },
  },
  {
    chunkId: "t8",
    patch: {
      addEdges: [
        { id: "e6", source: "billing", target: "aurora-launch", type: "blocks", label: "blocker" },
      ],
      addActions: [
        {
          id: "a1",
          text: "Fix staging deploy pipeline reliability",
          owner: "Kevin (Eng)",
          timestamp: 58,
        },
      ],
      addIssues: [
        {
          id: "i2",
          text: "Billing integration blocked by Payments Team v2 migration — no ETA confirmed",
          severity: "warning",
          timestamp: 58,
        },
      ],
      highlightNodeIds: ["billing", "payments", "aurora-launch"],
    },
  },
];

export const demoExtractionByChunkId = Object.fromEntries(
  demoExtractions.map(({ chunkId, patch }) => [chunkId, patch]),
) as Record<string, GraphPatchEvent>;
