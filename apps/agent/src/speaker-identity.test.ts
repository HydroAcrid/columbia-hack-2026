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

test("creates a canonical profile from direct self-identification", () => {
  const state = createState([
    { id: "1", speaker: "Speaker 1", text: "My name is Kevin", timestamp: 1 },
  ]);

  assert.deepEqual(inferSpeakerProfileUpdates(state), [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 3,
      sourceSpeakerIds: ["Speaker 1"],
    },
  ]);
});

test("attaches a new raw Deepgram speaker id to the existing canonical person on direct self-id", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is Kevin", timestamp: 1 },
    { id: "2", speaker: "Speaker 3", text: "This is Kevin.", timestamp: 8 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 6,
      sourceSpeakerIds: ["Speaker 1", "Speaker 3"],
    },
  ]);
});

test("weak vocative-response evidence does not create a new canonical profile", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 0", text: "Kevin, can you take the auth bug?", timestamp: 1 },
    { id: "2", speaker: "Speaker 1", text: "Yes, I can take that.", timestamp: 3 },
    { id: "3", speaker: "Speaker 0", text: "Thanks Kevin, that helps.", timestamp: 6 },
    { id: "4", speaker: "Speaker 1", text: "I will have it done by Friday.", timestamp: 8 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), []);
});

test("heuristic evidence can strengthen an existing canonical mapping without changing identity", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is Kevin", timestamp: 1 },
    { id: "2", speaker: "Speaker 0", text: "Kevin, can you take the auth bug?", timestamp: 4 },
    { id: "3", speaker: "Speaker 1", text: "Yes, I can take that.", timestamp: 6 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 4,
      sourceSpeakerIds: ["Speaker 1"],
    },
  ]);
});

test("high-confidence profiles ignore contradictory direct claims on the same raw speaker id", () => {
  const currentProfiles = [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high" as const,
      evidenceCount: 3,
      sourceSpeakerIds: ["Speaker 1"],
    },
  ];
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is Marcus", timestamp: 5 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript, currentProfiles)), []);
});

test("rejects obvious non-name phrases", () => {
  const transcript: TranscriptChunk[] = [
    { id: "1", speaker: "Speaker 1", text: "My name is thinking of", timestamp: 1 },
    { id: "2", speaker: "Speaker 2", text: "This is heard of", timestamp: 2 },
    { id: "3", speaker: "Speaker 3", text: "I am kind of", timestamp: 3 },
  ];

  assert.deepEqual(inferSpeakerProfileUpdates(createState(transcript)), []);
});
