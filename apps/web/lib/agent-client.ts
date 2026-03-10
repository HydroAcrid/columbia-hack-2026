import type {
  SessionState,
  TranscriptChunk,
} from "@copilot/shared";

const DEFAULT_AGENT_BASE_URL = "http://localhost:4000";
const AGENT_BASE_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? DEFAULT_AGENT_BASE_URL;
const VISITOR_STORAGE_KEY = "launch-copilot:visitor-id";

export function getSessionEventsUrl(sessionId: string, lastEventId?: string | null) {
  const url = new URL(`${AGENT_BASE_URL}/sessions/${sessionId}/events`);
  if (lastEventId) {
    url.searchParams.set("lastEventId", lastEventId);
  }

  return url.toString();
}

export async function createSession() {
  const response = await request(`${AGENT_BASE_URL}/sessions`, {
    method: "POST",
  });

  return parseJson<{ id: string }>(response);
}

export async function createSessionResponse() {
  return request(`${AGENT_BASE_URL}/sessions`, {
    method: "POST",
  });
}

export async function getSessionState(sessionId: string) {
  const response = await request(`${AGENT_BASE_URL}/sessions/${sessionId}/state`);
  return parseJson<SessionState>(response);
}

export async function postTranscriptChunk(sessionId: string, chunk: TranscriptChunk) {
  const response = await request(`${AGENT_BASE_URL}/sessions/${sessionId}/transcript-chunks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chunk),
  });

  return parseJson(response);
}

export async function postTranscriptChunkResponse(sessionId: string, chunk: TranscriptChunk) {
  return request(`${AGENT_BASE_URL}/sessions/${sessionId}/transcript-chunks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chunk),
  });
}

export function getAgentBaseUrl() {
  return AGENT_BASE_URL;
}

export function getVisitorId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY)?.trim();
    if (existing) {
      return existing;
    }

    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function getVisitorHeaders() {
  const headers = new Headers();
  const visitorId = getVisitorId();
  if (visitorId) {
    headers.set("x-nota-visitor-id", visitorId);
  }

  return headers;
}

export async function readAgentErrorMessage(response: Response) {
  const fallback = `Request failed with status ${response.status}`;
  const body = await response.text();
  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as { error?: string };
    return parsed.error?.trim() || fallback;
  } catch {
    return body;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readAgentErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function request(input: string, init?: RequestInit) {
  try {
    const headers = new Headers(init?.headers);
    const visitorHeaders = getVisitorHeaders();
    visitorHeaders.forEach((value, key) => {
      headers.set(key, value);
    });

    return await fetch(input, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new Error(
      `Unable to reach the agent at ${AGENT_BASE_URL}. ${error instanceof Error ? error.message : "Network request failed."}`,
    );
  }
}
