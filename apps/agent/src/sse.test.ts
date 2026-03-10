import test from "node:test";
import assert from "node:assert/strict";
import {
  SSE_RETRY_MS,
  serializeHeartbeatEvent,
  serializeSseRetry,
} from "./sse.js";

test("serializeSseRetry emits the configured retry hint", () => {
  const payload = new TextDecoder().decode(serializeSseRetry());

  assert.equal(payload, `retry: ${SSE_RETRY_MS}\n\n`);
});

test("serializeHeartbeatEvent emits a heartbeat event with timestamp data", () => {
  const payload = new TextDecoder().decode(serializeHeartbeatEvent(1234));

  assert.equal(payload, 'event: heartbeat\ndata: {"timestamp":1234}\n\n');
});
