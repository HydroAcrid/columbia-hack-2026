import test from "node:test";
import assert from "node:assert/strict";
import type { SessionState, TranscriptChunk } from "@copilot/shared";
import { inferSpeakerProfileUpdates } from "./speaker-identity.js";

function createState(
  transcript: TranscriptChunk[],
  speakerProfiles: SessionState["speakerProfiles"] = [],
): SessionState {
  return {
    id: "session-1",
    transcript,
    nodes: [],
    edges: [],
    decisions: [],
    actions: [],
    issues: [],
    speakerProfiles,
  };
}

test("locks an explicit self-identification immediately at high confidence", () => {
  const state = createState([
    { id: "1", speaker: "Speaker 1", text: "My name is Kevin", timestamp: 1 },
  ]);

  assert.deepEqual(inferSpeakerProfileUpdates(state), [
    {
      speakerId: "Speaker 1",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 3,
    },
  ]);
});

test("weak address evidence cannot override a locked explicit name", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is Kevin", timestamp: 1 },
    { id: "2", speaker: "Speaker 0", text: "Marcus, can you take the auth bug?", timestamp: 4 },
    { id: "3", speaker: "Speaker 1", text: "Yes, I can take that.", timestamp: 6 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), [
    {
      speakerId: "Speaker 1",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 3,
    },
  ]);
});

test("heuristic vocative-response fallback still works for unlabeled speakers", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 0", text: "Kevin, can you take the auth bug?", timestamp: 1 },
    { id: "2", speaker: "Speaker 1", text: "Yes, I can take that.", timestamp: 3 },
    { id: "3", speaker: "Speaker 0", text: "Thanks Kevin, that helps.", timestamp: 6 },
    { id: "4", speaker: "Speaker 1", text: "I will have it done by Friday.", timestamp: 8 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), [
    {
      speakerId: "Speaker 1",
      name: "Kevin",
      confidence: "medium",
      evidenceCount: 2,
    },
  ]);
});

test("rejects obvious non-name phrases", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is thinking of", timestamp: 1 },
    { id: "2", speaker: "Speaker 2", text: "This is heard of", timestamp: 2 },
    { id: "3", speaker: "Speaker 3", text: "I am kind of", timestamp: 3 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), []);
});

test("mixed weak evidence keeps the current heuristic name stable unless clearly beaten", () => {
  const currentProfiles = [
    {
      speakerId: "Speaker 1",
      name: "Kevin",
      confidence: "medium" as const,
      evidenceCount: 2,
    },
  ];
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 0", text: "Kevin, can you own auth?", timestamp: 1 },
    { id: "2", speaker: "Speaker 1", text: "Yes, I can.", timestamp: 3 },
    { id: "3", speaker: "Speaker 0", text: "Marcus, can you also look at billing?", timestamp: 6 },
    { id: "4", speaker: "Speaker 1", text: "Sure, I can look at that too.", timestamp: 8 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript, currentProfiles)), []);
});
