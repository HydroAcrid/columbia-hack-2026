const encoder = new TextEncoder();

export const SSE_RETRY_MS = 3000;
export const SSE_HEARTBEAT_MS = 15000;

export function serializeSseRetry(retryMs = SSE_RETRY_MS) {
  return encoder.encode(`retry: ${retryMs}\n\n`);
}

export function serializeHeartbeatEvent(timestamp = Date.now()) {
  return encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ timestamp })}\n\n`);
}
