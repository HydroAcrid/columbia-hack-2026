import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { attachSttServer } from "./stt-server.js";
import { textToSpeechGemini } from "./tts-server.js";
import {
  TranscriptChunk,
  type GraphPatchEvent,
} from "@copilot/shared";
import { readAgentConfig } from "./config.js";
import { createExtractionProvider } from "./extraction-provider.js";
import {
  mergePatchIntoSessionState,
} from "./graph-engine.js";
import { inferSpeakerProfileUpdates } from "./speaker-identity.js";
import {
  serializeHeartbeatEvent,
  serializeSseRetry,
  SSE_HEARTBEAT_MS,
} from "./sse.js";
import {
  buildVisitorBudgetExceededResponse,
  getVisitorBudgetKey,
  VisitorBudgetLimiter,
} from "./usage-limiter.js";
import {
  createSessionStore,
  type SessionEvent,
  type StoredSession,
} from "./session-store.js";

loadEnvFiles();

const app = new Hono();
const encoder = new TextEncoder();
const config = readAgentConfig();
const { provider, metadata: extractionMetadata } = createExtractionProvider(config);
const store = createSessionStore(config);
const visitorBudgetLimiter = new VisitorBudgetLimiter(config.visitorBudget);
const subscribers = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "copilot-agent",
    timestamp: Date.now(),
    sessionStoreBackend: config.sessionStoreBackend,
    vertex: extractionMetadata.vertex,
    extractionMode: extractionMetadata.mode,
  });
});

app.post("/sessions", async (c) => {
  const ownerId = getVisitorBudgetKey(c.req.raw.headers);
  const sessionBudget = visitorBudgetLimiter.consume(ownerId, "sessions");
  if (!sessionBudget.allowed) {
    const limited = buildVisitorBudgetExceededResponse({
      kind: "sessions",
      decision: sessionBudget,
    });
    return c.json(limited.body, limited.status, limited.headers);
  }

  const id = crypto.randomUUID();
  await store.createSession(id, ownerId);

  return c.json({ id });
});

app.post("/sessions/:id/transcript-chunks", async (c) => {
  const session = await store.getSession(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const payload = await c.req.json();
  const chunk = TranscriptChunk.parse(payload);

  const visitorKey = session.ownerId ?? getVisitorBudgetKey(c.req.raw.headers);
  const transcriptBudget = visitorBudgetLimiter.consume(visitorKey, "transcriptChunks");
  if (!transcriptBudget.allowed) {
    const limited = buildVisitorBudgetExceededResponse({
      kind: "transcriptChunks",
      decision: transcriptBudget,
    });
    return c.json(limited.body, limited.status, limited.headers);
  }

  if (session.state.transcript.some((entry: { id: string }) => entry.id === chunk.id)) {
    return c.json({ ok: true, duplicate: true });
  }

  const ingestStartedAt = Date.now();
  session.state.transcript.push(chunk);
  let degraded = false;
  let patch: GraphPatchEvent = {};

  try {
    const extractionPatch = await provider.extract(chunk, session.state);
    const speakerProfileUpdates = inferSpeakerProfileUpdates(
      mergePatchIntoSessionState(session.state, extractionPatch),
      {
        debug: config.sttDebugEnabled,
      },
    );
    patch = speakerProfileUpdates.length
      ? {
        ...extractionPatch,
        upsertSpeakerProfiles: speakerProfileUpdates,
      }
      : extractionPatch;
    mergePatchIntoSession(session, patch);
  } catch (error) {
    degraded = true;
    console.error("[TranscriptIngest] Failed to build patch", error);
  }

  await store.saveSession(session);

  if (hasPatchContent(patch)) {
    const event = createSessionEvent(session, patch);
    await store.appendEvent(session.state.id, event);
    publishEvent(session.state.id, event);
  }

  console.log(
    `[TranscriptIngest] ${JSON.stringify({
      sessionId: session.state.id,
      chunkId: chunk.id,
      totalMs: Date.now() - ingestStartedAt,
      degraded,
      patch: summarizePatch(patch),
    })}`,
  );

  return c.json({ ok: true, patch });
});

app.post("/tts", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text) {
    return c.json({ error: "Missing text field" }, 400);
  }

  const ttsBudget = visitorBudgetLimiter.consume(getVisitorBudgetKey(c.req.raw.headers), "tts");
  if (!ttsBudget.allowed) {
    const limited = buildVisitorBudgetExceededResponse({
      kind: "tts",
      decision: ttsBudget,
    });
    return c.json(limited.body, limited.status, limited.headers);
  }

  console.log(`[TTS] Request: "${text.substring(0, 80)}..."`);
  const ttsResult = await textToSpeechGemini(text);

  if (!ttsResult) {
    return c.json({ error: "TTS failed" }, 500);
  }

  return c.json({
    audio: ttsResult.audioBase64,
    mimeType: ttsResult.mimeType,
    sampleRate: ttsResult.sampleRate ?? 24000,
    channels: 1,
    bitDepth: 16,
  });
});

app.get("/sessions/:id/events", async (c) => {
  const sessionId = c.req.param("id");
  const session = await store.getSession(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const lastEventId = parseEventId(
    c.req.header("last-event-id") ?? c.req.header("Last-Event-ID") ?? c.req.query("lastEventId"),
  );
  const replayUpperBound = session.nextEventId;
  const replayEvents = lastEventId === null
    ? []
    : await store.listEventsAfter(sessionId, lastEventId, replayUpperBound);

  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let cleanedUp = false;

  const cleanup = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    const targetController = controller ?? activeController;
    if (targetController) {
      const currentSubscribers = subscribers.get(sessionId);
      currentSubscribers?.delete(targetController);
      if (currentSubscribers?.size === 0) {
        subscribers.delete(sessionId);
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      activeController = controller;
      controller.enqueue(serializeSseRetry());
      controller.enqueue(encoder.encode(": connected\n\n"));
      for (const event of replayEvents) {
        controller.enqueue(serializeEvent(event));
      }
      const sessionSubscribers = subscribers.get(sessionId) ?? new Set();
      sessionSubscribers.add(controller);
      subscribers.set(sessionId, sessionSubscribers);

      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(serializeHeartbeatEvent());
        } catch {
          cleanup(controller);
          try {
            controller.close();
          } catch {
            // Ignore close races when the stream is already closed.
          }
        }
      }, SSE_HEARTBEAT_MS);

      c.req.raw.signal.addEventListener("abort", () => {
        cleanup(controller);
        try {
          controller.close();
        } catch {
          // Ignore close races when the client disconnects.
        }
      }, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
});

app.get("/sessions/:id/state", (c) => {
  const session = store.getSession(c.req.param("id"));
  return session.then((record) => {
    if (!record) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(record.state);
  });
});

const port = config.port;

const server = createAdaptorServer({ fetch: app.fetch });
attachSttServer(server, { debug: config.sttDebugEnabled });

server.listen(port, () => {
  console.log(`Agent service listening on http://localhost:${port}`);
  console.log(`Session store backend: ${config.sessionStoreBackend}`);
  if (config.vertex.enabled) {
    console.log(
      `Vertex config detected for ${config.vertex.location} (${config.vertex.model ?? config.vertex.liveModel ?? "model unset"})`,
    );
  }
});

function mergePatchIntoSession(session: StoredSession, patch: GraphPatchEvent) {
  session.state = mergePatchIntoSessionState(session.state, patch);
}

function createSessionEvent(session: StoredSession, patch: GraphPatchEvent): SessionEvent {
  const event: SessionEvent = {
    id: String(session.nextEventId),
    patch,
  };
  session.nextEventId += 1;
  return event;
}

function hasPatchContent(patch: GraphPatchEvent) {
  return Boolean(
    (patch.addNodes?.length ?? 0) ||
    (patch.addEdges?.length ?? 0) ||
    (patch.addDecisions?.length ?? 0) ||
    (patch.addActions?.length ?? 0) ||
    (patch.addIssues?.length ?? 0) ||
    (patch.highlightNodeIds?.length ?? 0) ||
    (patch.upsertSpeakerProfiles?.length ?? 0) ||
    patch.interruptMessage,
  );
}

function summarizePatch(patch: GraphPatchEvent) {
  return {
    addNodes: patch.addNodes?.length ?? 0,
    addEdges: patch.addEdges?.length ?? 0,
    addDecisions: patch.addDecisions?.length ?? 0,
    addActions: patch.addActions?.length ?? 0,
    addIssues: patch.addIssues?.length ?? 0,
    upsertSpeakerProfiles: patch.upsertSpeakerProfiles?.length ?? 0,
    interruptMessage: patch.interruptMessage ?? null,
  };
}

function publishEvent(sessionId: string, event: SessionEvent) {
  const sessionSubscribers = subscribers.get(sessionId);
  if (!sessionSubscribers?.size) {
    return;
  }

  const payload = serializeEvent(event);

  for (const subscriber of sessionSubscribers) {
    try {
      subscriber.enqueue(payload);
    } catch {
      sessionSubscribers.delete(subscriber);
    }
  }

  if (sessionSubscribers.size === 0) {
    subscribers.delete(sessionId);
  }
}

function parseEventId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function serializeEvent(event: SessionEvent) {
  return encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event.patch)}\n\n`);
}

function loadEnvFiles() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = resolve(currentDir, "../../..");
  const packageRoot = resolve(currentDir, "..");

  for (const path of [
    resolve(workspaceRoot, ".env.local"),
    resolve(workspaceRoot, ".env"),
    resolve(packageRoot, ".env.local"),
    resolve(packageRoot, ".env"),
  ]) {
    if (existsSync(path)) {
      dotenv.config({ path, override: false });
    }
  }
}
