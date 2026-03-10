import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSpeakerProfiles,
  resolveSpeakerDisplayName,
  resolveSpeakerProfile,
  type SpeakerProfile,
} from "@copilot/shared";

test("resolveSpeakerProfile finds canonical profiles by raw Deepgram speaker id", () => {
  const profiles: SpeakerProfile[] = [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 6,
      sourceSpeakerIds: ["Speaker 1", "Speaker 3"],
    },
  ];

  assert.equal(resolveSpeakerProfile(profiles, "Speaker 3")?.speakerId, "kevin");
  assert.equal(resolveSpeakerDisplayName(profiles, "Speaker 1"), "Kevin");
  assert.equal(resolveSpeakerDisplayName(profiles, "Speaker 9"), "Speaker 9");
});

test("mergeSpeakerProfiles preserves and unions source speaker ids for canonical profiles", () => {
  const currentProfiles: SpeakerProfile[] = [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 3,
      sourceSpeakerIds: ["Speaker 1"],
    },
  ];

  const merged = mergeSpeakerProfiles(currentProfiles, [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 6,
      sourceSpeakerIds: ["Speaker 3"],
    },
  ]);

  assert.deepEqual(merged, [
    {
      speakerId: "kevin",
      name: "Kevin",
      confidence: "high",
      evidenceCount: 6,
      sourceSpeakerIds: ["Speaker 1", "Speaker 3"],
    },
  ]);
});
