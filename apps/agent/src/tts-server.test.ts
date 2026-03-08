import test from "node:test";
import assert from "node:assert/strict";
import { extractAudioFromTtsResponse, parseSampleRate } from "./tts-server.js";

test("extractAudioFromTtsResponse returns inline audio data and sample rate", () => {
  const result = extractAudioFromTtsResponse({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                data: "ZmFrZS1hdWRpbw==",
                mimeType: "audio/L16;rate=24000",
              },
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(result, {
    audioBase64: "ZmFrZS1hdWRpbw==",
    mimeType: "audio/L16;rate=24000",
    sampleRate: 24000,
  });
});

test("extractAudioFromTtsResponse returns null when no audio is present", () => {
  const result = extractAudioFromTtsResponse({
    candidates: [
      {
        content: {
          parts: [{ text: "no audio" }],
        },
      },
    ],
  });

  assert.equal(result, null);
});

test("parseSampleRate ignores missing or non-rate mime types", () => {
  assert.equal(parseSampleRate(undefined), null);
  assert.equal(parseSampleRate("audio/wav"), null);
  assert.equal(parseSampleRate("audio/L16;rate=16000"), 16000);
});
