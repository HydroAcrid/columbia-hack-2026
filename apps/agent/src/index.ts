import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { applyPatch } from "@copilot/graph";
import { attachSttServer } from "./stt-server.js";
import { textToSpeechGeminiLive } from "./tts-server.js";
import {
  TranscriptChunk,
  type GraphPatchEvent,
  type SessionState,
} from "@copilot/shared";
import { readAgentConfig } from "./config.js";
import { createExtractionProvider } from "./extraction-provider.js";
import {
  mergeActionItems,
  mergeDecisionItems,
  mergeIssueItems,
} from "./graph-engine.js";
import { inferSpeakerProfileUpdates } from "./speaker-identity.js";
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
  const id = crypto.randomUUID();
  await store.createSession(id);

  return c.json({ id });
});

app.post("/sessions/:id/transcript-chunks", async (c) => {
  const session = await store.getSession(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const payload = await c.req.json();
  const chunk = TranscriptChunk.parse(payload);

  if (session.state.transcript.some((entry: { id: string }) => entry.id === chunk.id)) {
    return c.json({ ok: true, duplicate: true });
  }

  const ingestStartedAt = Date.now();
  session.state.transcript.push(chunk);
  let degraded = false;
  let patch: GraphPatchEvent = {};

  try {
    const speakerProfileUpdates = inferSpeakerProfileUpdates(session.state);
    const extractionPatch = await provider.extract(chunk, session.state);
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

  console.log(`[TTS] Request: "${text.substring(0, 80)}..."`);
  const audioBase64 = await textToSpeechGeminiLive(text);

  if (!audioBase64) {
    return c.json({ error: "TTS failed" }, 500);
  }

  return c.json({ audio: audioBase64, sampleRate: 24000, channels: 1, bitDepth: 16 });
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
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      activeController = controller;
      controller.enqueue(encoder.encode(": connected\n\n"));
      for (const event of replayEvents) {
        controller.enqueue(serializeEvent(event));
      }
      const sessionSubscribers = subscribers.get(sessionId) ?? new Set();
      sessionSubscribers.add(controller);
      subscribers.set(sessionId, sessionSubscribers);

      c.req.raw.signal.addEventListener("abort", () => {
        const currentSubscribers = subscribers.get(sessionId);
        currentSubscribers?.delete(controller);
        if (currentSubscribers?.size === 0) {
          subscribers.delete(sessionId);
        }
        try {
          controller.close();
        } catch {
          // Ignore close races when the client disconnects.
        }
      }, { once: true });
    },
    cancel() {
      if (activeController) {
        const sessionSubscribers = subscribers.get(sessionId);
        sessionSubscribers?.delete(activeController);
        if (sessionSubscribers?.size === 0) {
          subscribers.delete(sessionId);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
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
attachSttServer(server);

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
  const graph = applyPatch(
    {
      nodes: session.state.nodes,
      edges: session.state.edges,
    },
    patch,
  );

  session.state.nodes = graph.nodes;
  session.state.edges = graph.edges;
  mergeDecisionItems(session.state.decisions, patch.addDecisions);
  mergeActionItems(session.state.actions, patch.addActions);
  mergeIssueItems(session.state.issues, patch.addIssues);
  mergeSpeakerProfiles(session.state, patch.upsertSpeakerProfiles);
}

function mergeSpeakerProfiles(
  state: SessionState,
  profiles: SessionState["speakerProfiles"] | undefined,
) {
  if (!profiles?.length) {
    return;
  }

  const merged = new Map(
    state.speakerProfiles.map((profile) => [profile.speakerId, profile]),
  );

  for (const profile of profiles) {
    merged.set(profile.speakerId, profile);
  }

  state.speakerProfiles = [...merged.values()].sort((left, right) =>
    left.speakerId.localeCompare(right.speakerId),
  );
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
    (patch.upsertSpeakerProfiles?.length ?? 0),
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
