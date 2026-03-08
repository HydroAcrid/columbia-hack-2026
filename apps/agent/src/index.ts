import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { applyPatch } from "@copilot/graph";
import {
  TranscriptChunk,
  demoExtractionByChunkId,
  type GraphPatchEvent,
  type SessionState,
} from "@copilot/shared";

const app = new Hono();
const encoder = new TextEncoder();

interface SessionEvent {
  id: string;
  patch: GraphPatchEvent;
}

interface SessionRecord {
  state: SessionState;
  events: SessionEvent[];
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
  nextEventId: number;
}

const sessions = new Map<string, SessionRecord>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "copilot-agent", timestamp: Date.now() });
});

app.post("/sessions", (c) => {
  const id = crypto.randomUUID();
  const session = createSession(id);
  sessions.set(id, session);

  return c.json({ id });
});

app.post("/sessions/:id/transcript-chunks", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const payload = await c.req.json();
  const chunk = TranscriptChunk.parse(payload);

  if (session.state.transcript.some((entry: { id: string }) => entry.id === chunk.id)) {
    return c.json({ ok: true, duplicate: true });
  }

  session.state.transcript.push(chunk);

  const patch = demoExtractionByChunkId[chunk.id] ?? {};
  mergePatchIntoSession(session, patch);
  publishEvent(session, patch);

  return c.json({ ok: true, patch });
});

app.get("/sessions/:id/events", async (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      activeController = controller;
      session.subscribers.add(controller);
      controller.enqueue(encoder.encode(": connected\n\n"));

      c.req.raw.signal.addEventListener("abort", () => {
        session.subscribers.delete(controller);
        try {
          controller.close();
        } catch {
          // Ignore close races when the client disconnects.
        }
      }, { once: true });
    },
    cancel() {
      if (activeController) {
        session.subscribers.delete(activeController);
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
  const session = sessions.get(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(session.state);
});

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Agent service listening on http://localhost:${port}`);
});

function createSession(id: string): SessionRecord {
  return {
    state: {
      id,
      transcript: [],
      nodes: [],
      edges: [],
      decisions: [],
      actions: [],
      issues: [],
    },
    events: [],
    subscribers: new Set(),
    nextEventId: 1,
  };
}

function mergePatchIntoSession(session: SessionRecord, patch: GraphPatchEvent) {
  const graph = applyPatch(
    {
      nodes: session.state.nodes,
      edges: session.state.edges,
    },
    patch,
  );

  session.state.nodes = graph.nodes;
  session.state.edges = graph.edges;
  mergeItems(session.state.decisions, patch.addDecisions);
  mergeItems(session.state.actions, patch.addActions);
  mergeItems(session.state.issues, patch.addIssues);
}

function mergeItems<T extends { id: string }>(target: T[], items: T[] | undefined) {
  if (!items?.length) {
    return;
  }

  for (const item of items) {
    if (!target.some((existing) => existing.id === item.id)) {
      target.push(item);
    }
  }
}

function publishEvent(session: SessionRecord, patch: GraphPatchEvent) {
  const event: SessionEvent = {
    id: String(session.nextEventId++),
    patch,
  };
  session.events.push(event);

  const payload = encoder.encode(
    `id: ${event.id}\ndata: ${JSON.stringify(event.patch)}\n\n`,
  );

  for (const subscriber of session.subscribers) {
    try {
      subscriber.enqueue(payload);
    } catch {
      session.subscribers.delete(subscriber);
    }
  }
}
