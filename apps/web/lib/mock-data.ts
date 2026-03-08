import type {
  GraphNode,
  GraphEdge,
  DecisionItem,
  ActionItem,
  IssueItem,
} from "@copilot/shared";
import { demoTranscriptChunks } from "@copilot/shared";

export const mockTranscript = demoTranscriptChunks;

export const mockNodes: GraphNode[] = [
  { id: "priya", label: "Priya", type: "person" },
  { id: "kevin", label: "Kevin", type: "person" },
  { id: "sara", label: "Sara", type: "person" },
  { id: "marcus", label: "Marcus", type: "person" },
  { id: "eng", label: "Engineering", type: "team" },
  { id: "payments", label: "Payments Team", type: "team" },
  { id: "api-gateway", label: "API Gateway", type: "system" },
  { id: "billing", label: "Billing Integration", type: "system" },
  { id: "onboarding", label: "Onboarding Flow", type: "system" },
  { id: "staging", label: "Staging Environment", type: "system" },
  { id: "aurora-launch", label: "Aurora Launch (Mar 28)", type: "milestone" },
];

export const mockEdges: GraphEdge[] = [
  { id: "e1", source: "kevin", target: "eng", type: "owns", label: "leads" },
  { id: "e2", source: "eng", target: "api-gateway", type: "owns" },
  { id: "e3", source: "billing", target: "payments", type: "depends_on", label: "waiting on v2" },
  { id: "e4", source: "sara", target: "onboarding", type: "owns", label: "designed" },
  { id: "e5", source: "eng", target: "onboarding", type: "owns", label: "implementing" },
  { id: "e6", source: "billing", target: "aurora-launch", type: "blocks", label: "blocker" },
  { id: "e7", source: "staging", target: "onboarding", type: "blocks", label: "flaky deploys" },
  { id: "e8", source: "priya", target: "aurora-launch", type: "owns", label: "driving" },
  { id: "e9", source: "marcus", target: "staging", type: "relates_to" },
];

export const mockDecisions: DecisionItem[] = [
  {
    id: "d1",
    text: "Fix staging reliability before running final QA pass",
    timestamp: 50,
  },
  {
    id: "d2",
    text: "Target March 28 for Project Aurora public launch",
    timestamp: 0,
  },
];

export const mockActions: ActionItem[] = [
  {
    id: "a1",
    text: "Fix staging deploy pipeline reliability",
    owner: "Kevin (Eng)",
    timestamp: 58,
  },
  {
    id: "a2",
    text: "Flag QA assignment for onboarding with QA lead",
    owner: "Marcus (Ops)",
    timestamp: 40,
  },
];

export const mockIssues: IssueItem[] = [
  {
    id: "i1",
    text: "No owner assigned for onboarding QA pass",
    severity: "blocker",
    timestamp: 34,
  },
  {
    id: "i2",
    text: "Billing integration blocked by Payments Team v2 migration — no ETA confirmed",
    severity: "warning",
    timestamp: 58,
  },
];
