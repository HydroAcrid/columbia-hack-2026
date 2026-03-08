import type {
  SessionState,
  TranscriptChunk,
} from "@copilot/shared";

const AGENT_BASE_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000";

export function getSessionEventsUrl(sessionId: string, lastEventId?: string | null) {
  const url = new URL(`${AGENT_BASE_URL}/sessions/${sessionId}/events`);
  if (lastEventId) {
    url.searchParams.set("lastEventId", lastEventId);
  }

  return url.toString();
}

export async function createSession() {
  const response = await fetch(`${AGENT_BASE_URL}/sessions`, {
    method: "POST",
  });

  return parseJson<{ id: string }>(response);
}

export async function getSessionState(sessionId: string) {
  const response = await fetch(`${AGENT_BASE_URL}/sessions/${sessionId}/state`);
  return parseJson<SessionState>(response);
}

export async function postTranscriptChunk(sessionId: string, chunk: TranscriptChunk) {
  const response = await fetch(`${AGENT_BASE_URL}/sessions/${sessionId}/transcript-chunks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chunk),
  });

  return parseJson(response);
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
