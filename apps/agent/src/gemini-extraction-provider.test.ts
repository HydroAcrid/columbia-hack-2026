import test from "node:test";
import assert from "node:assert/strict";
import type { SessionState, TranscriptChunk } from "@copilot/shared";
import type { LiveExtractionConfig } from "./config.js";
import { GeminiExtractionProvider } from "./gemini-extraction-provider.js";

function createState(transcript: TranscriptChunk[]): SessionState {
  return {
    id: "session-1",
    transcript,
    nodes: [],
    edges: [],
    decisions: [],
    actions: [],
    issues: [],
    speakerProfiles: [],
  };
}

function createChunk(id: string, text: string, timestamp: number): TranscriptChunk {
  return {
    id,
    speaker: "Speaker 0",
    text,
    timestamp,
  };
}

function createLiveConfig(overrides: Partial<LiveExtractionConfig> = {}): LiveExtractionConfig {
  return {
    batchIdleMs: 20,
    batchMaxMs: 50,
    minMeaningfulWords: 1,
    contextTranscriptLines: 2,
    contextNodeLimit: 8,
    contextEdgeLimit: 6,
    ...overrides,
  };
}

function createProvider(
  generateContent: (prompt: string) => Promise<{ response: { text(): string } }>,
  liveConfig: Partial<LiveExtractionConfig> = {},
) {
  return new GeminiExtractionProvider("test", "gemini-2.5-flash", createLiveConfig(liveConfig), {
    modelClient: { generateContent },
    logger: {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("flushes a live batch after the idle window", async () => {
  const prompts: string[] = [];
  const provider = createProvider(async (prompt) => {
    prompts.push(prompt);
    return {
      response: {
        text: () => JSON.stringify({
          addDecisions: [{ id: "d-1", text: "Ship auth with Supabase.", timestamp: 1 }],
        }),
      },
    };
  });

  const chunk = createChunk("live-1", "We decided to ship auth with Supabase.", 1);
  const resultPromise = provider.extract(chunk, createState([chunk]));

  await sleep(35);
  const patch = await resultPromise;

  assert.equal(prompts.length, 1);
  assert.deepEqual(patch.addDecisions, [
    { id: "d-1", text: "Ship auth with Supabase.", timestamp: 1 },
  ]);
});

test("forces a flush at max wait even while new chunks keep arriving", async () => {
  const prompts: string[] = [];
  const provider = createProvider(async (prompt) => {
    prompts.push(prompt);
    return {
      response: {
        text: () => JSON.stringify({
          addIssues: [{ id: "i-1", text: "Cloud Run is blocking launch.", severity: "blocker", timestamp: 1 }],
        }),
      },
    };
  });

  const chunks = [
    createChunk("live-1", "Cloud Run", 1),
    createChunk("live-2", "is blocking", 2),
    createChunk("live-3", "launch today", 3),
  ];

  const first = provider.extract(chunks[0], createState([chunks[0]]));
  await sleep(15);
  const second = provider.extract(chunks[1], createState(chunks.slice(0, 2)));
  await sleep(15);
  const third = provider.extract(chunks[2], createState(chunks));

  await sleep(30);
  const patches = await Promise.all([first, second, third]);

  assert.equal(prompts.length, 1);
  assert.deepEqual(patches[0].addIssues, [
    { id: "i-1", text: "Cloud Run is blocking launch.", severity: "blocker", timestamp: 1 },
  ]);
  assert.deepEqual(patches[1], {});
  assert.deepEqual(patches[2], {});
});

test("holds filler batches until they become meaningful", async () => {
  const prompts: string[] = [];
  const provider = createProvider(async (prompt) => {
    prompts.push(prompt);
    return {
      response: {
        text: () => JSON.stringify({
          addActions: [{ id: "a-1", text: "Fix the deploy blocker.", owner: "Kevin", timestamp: 1 }],
        }),
      },
    };
  }, { minMeaningfulWords: 4, batchIdleMs: 20, batchMaxMs: 80 });

  const chunk1 = createChunk("live-1", "uh", 1);
  const chunk2 = createChunk("live-2", "yeah", 2);
  const chunk3 = createChunk("live-3", "we should fix the deploy blocker", 3);

  const first = provider.extract(chunk1, createState([chunk1]));
  await sleep(25);
  assert.equal(prompts.length, 0);

  const second = provider.extract(chunk2, createState([chunk1, chunk2]));
  await sleep(25);
  assert.equal(prompts.length, 0);

  const third = provider.extract(chunk3, createState([chunk1, chunk2, chunk3]));
  await sleep(30);
  const patches = await Promise.all([first, second, third]);

  assert.equal(prompts.length, 1);
  assert.deepEqual(patches[0].addActions, [
    { id: "a-1", text: "Fix the deploy blocker.", owner: "Kevin", timestamp: 1 },
  ]);
  assert.deepEqual(patches[1], {});
  assert.deepEqual(patches[2], {});
});

test("returns an empty patch when the model response is invalid JSON", async () => {
  const provider = createProvider(async () => ({
    response: {
      text: () => "{not-json}",
    },
  }));

  const chunk = createChunk("live-1", "We decided to ship auth with Supabase.", 1);
  const resultPromise = provider.extract(chunk, createState([chunk]));

  await sleep(35);
  assert.deepEqual(await resultPromise, {});
});
