import test from "node:test";
import assert from "node:assert/strict";
import { LiveTranscriptSegmenter, type DeepgramTranscriptEvent } from "./stt-segmentation.js";

function createEvent(
  words: Array<{
    text: string;
    start: number;
    end: number;
    speaker: number;
  }>,
  options: Partial<DeepgramTranscriptEvent> = {},
): DeepgramTranscriptEvent {
  return {
    is_final: true,
    speech_final: false,
    channel: {
      alternatives: [
        {
          transcript: words.map((word) => word.text).join(" "),
          words: words.map((word) => ({
            punctuated_word: word.text,
            start: word.start,
            end: word.end,
            speaker: word.speaker,
          })),
        },
      ],
    },
    ...options,
  };
}

test("merges same-speaker finalized spans across short pauses", () => {
  const segmenter = new LiveTranscriptSegmenter();

  assert.deepEqual(segmenter.handleTranscriptEvent(createEvent([
    { text: "I", start: 0, end: 0.1, speaker: 0 },
    { text: "think", start: 0.12, end: 0.3, speaker: 0 },
  ])), []);

  assert.deepEqual(segmenter.handleTranscriptEvent(createEvent([
    { text: "we", start: 0.55, end: 0.65, speaker: 0 },
    { text: "should", start: 0.67, end: 0.85, speaker: 0 },
    { text: "ship", start: 0.87, end: 1.0, speaker: 0 },
  ])), []);

  assert.deepEqual(segmenter.handleUtteranceEnd(), [
    {
      speaker: "Speaker 0",
      text: "I think we should ship",
      timestamp: 0,
      start: 0,
      end: 1,
      words: [
        { text: "I", start: 0, end: 0.1, speakerId: "Speaker 0", confidence: undefined },
        { text: "think", start: 0.12, end: 0.3, speakerId: "Speaker 0", confidence: undefined },
        { text: "we", start: 0.55, end: 0.65, speakerId: "Speaker 0", confidence: undefined },
        { text: "should", start: 0.67, end: 0.85, speakerId: "Speaker 0", confidence: undefined },
        { text: "ship", start: 0.87, end: 1.0, speakerId: "Speaker 0", confidence: undefined },
      ],
    },
  ]);
});

test("splits same-speaker turns across longer pauses", () => {
  const segmenter = new LiveTranscriptSegmenter();

  assert.deepEqual(segmenter.handleTranscriptEvent(createEvent([
    { text: "Kevin", start: 0, end: 0.2, speaker: 0 },
    { text: "here", start: 0.21, end: 0.35, speaker: 0 },
  ])), []);

  assert.deepEqual(segmenter.handleTranscriptEvent(createEvent([
    { text: "Second", start: 1.6, end: 1.8, speaker: 0 },
    { text: "thought", start: 1.82, end: 2.0, speaker: 0 },
  ])), [
    {
      speaker: "Speaker 0",
      text: "Kevin here",
      timestamp: 0,
      start: 0,
      end: 0.35,
      words: [
        { text: "Kevin", start: 0, end: 0.2, speakerId: "Speaker 0", confidence: undefined },
        { text: "here", start: 0.21, end: 0.35, speakerId: "Speaker 0", confidence: undefined },
      ],
    },
  ]);

  assert.deepEqual(segmenter.handleUtteranceEnd(), [
    {
      speaker: "Speaker 0",
      text: "Second thought",
      timestamp: 1.6,
      start: 1.6,
      end: 2,
      words: [
        { text: "Second", start: 1.6, end: 1.8, speakerId: "Speaker 0", confidence: undefined },
        { text: "thought", start: 1.82, end: 2.0, speakerId: "Speaker 0", confidence: undefined },
      ],
    },
  ]);
});

test("splits a mixed-speaker final result into separate chunks in order", () => {
  const segmenter = new LiveTranscriptSegmenter();

  const chunks = segmenter.handleTranscriptEvent(createEvent([
    { text: "Can", start: 0, end: 0.1, speaker: 0 },
    { text: "you", start: 0.12, end: 0.2, speaker: 0 },
    { text: "take", start: 0.55, end: 0.65, speaker: 1 },
    { text: "that", start: 0.67, end: 0.8, speaker: 1 },
  ], { speech_final: true }));

  assert.deepEqual(chunks.map((chunk) => chunk.speaker), ["Speaker 0", "Speaker 1"]);
  assert.deepEqual(chunks.map((chunk) => chunk.text), ["Can you", "take that"]);
  assert.ok(chunks.every((chunk) => !chunk.speaker.includes("+")));
});

test("flushes pending audio on speech_final without inventing extra speakers", () => {
  const segmenter = new LiveTranscriptSegmenter();

  const chunks = segmenter.handleTranscriptEvent(createEvent([
    { text: "Wrapping", start: 0, end: 0.2, speaker: 2 },
    { text: "up", start: 0.22, end: 0.35, speaker: 2 },
  ], { speech_final: true }));

  assert.deepEqual(chunks, [
    {
      speaker: "Speaker 2",
      text: "Wrapping up",
      timestamp: 0,
      start: 0,
      end: 0.35,
      words: [
        { text: "Wrapping", start: 0, end: 0.2, speakerId: "Speaker 2", confidence: undefined },
        { text: "up", start: 0.22, end: 0.35, speakerId: "Speaker 2", confidence: undefined },
      ],
    },
  ]);
});
