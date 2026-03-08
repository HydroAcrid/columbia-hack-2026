"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import {
  createSession,
  getSessionEventsUrl,
  getSessionState,
  postTranscriptChunk,
} from "@/lib/agent-client";
import { applyPatch } from "@copilot/graph";
import {
  demoTranscriptChunks,
  type ActionItem,
  type DecisionItem,
  type GraphPatchEvent,
  type IssueItem,
  type SessionState,
  type TranscriptChunk,
} from "@copilot/shared";

type ConnectionState = "connecting" | "connected" | "disconnected";

function createEmptySessionState(id: string): SessionState {
  return {
    id,
    transcript: [],
    nodes: [],
    edges: [],
    decisions: [],
    actions: [],
    issues: [],
  };
}

function appendUnique<T extends { id: string }>(items: T[], nextItems: T[] | undefined) {
  if (!nextItems?.length) {
    return items;
  }

  const merged = [...items];
  for (const item of nextItems) {
    if (!merged.some((existing) => existing.id === item.id)) {
      merged.push(item);
    }
  }

  return merged;
}

function mergeSessionState(state: SessionState, patch: GraphPatchEvent): SessionState {
  const graph = applyPatch(
    { nodes: state.nodes, edges: state.edges },
    patch,
  );

  return {
    ...state,
    nodes: graph.nodes,
    edges: graph.edges,
    decisions: appendUnique<DecisionItem>(state.decisions, patch.addDecisions),
    actions: appendUnique<ActionItem>(state.actions, patch.addActions),
    issues: appendUnique<IssueItem>(state.issues, patch.addIssues),
  };
}

function appendTranscriptChunk(state: SessionState, chunk: TranscriptChunk): SessionState {
  if (state.transcript.some((entry) => entry.id === chunk.id)) {
    return state;
  }

  return {
    ...state,
    transcript: [...state.transcript, chunk],
  };
}

function getReplayDelay(currentIndex: number) {
  if (currentIndex === 0) return 250;

  const previous = demoTranscriptChunks[currentIndex - 1];
  const current = demoTranscriptChunks[currentIndex];
  const deltaSeconds = current.timestamp - previous.timestamp;

  return Math.min(1400, Math.max(500, deltaSeconds * 120));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ──────────────────────────────────────────
   Main page
   ────────────────────────────────────────── */

export default function Home() {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isReplaying, setIsReplaying] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const replayRunRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setErrorMessage(null);

      try {
        eventSourceRef.current?.close();
        const session = await createSession();
        const state = await getSessionState(session.id);
        if (cancelled) return;

        setSessionId(session.id);
        setSessionState(state);
        setConnectionState("connecting");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to bootstrap session.",
        );
        setConnectionState("disconnected");
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      replayRunRef.current += 1;
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const source = new EventSource(getSessionEventsUrl(sessionId));
    eventSourceRef.current = source;

    source.onopen = () => setConnectionState("connected");

    source.onmessage = (event) => {
      const patch = JSON.parse(event.data) as GraphPatchEvent;
      setSessionState((current) => (current ? mergeSessionState(current, patch) : current));
    };

    source.onerror = () => setConnectionState("disconnected");

    return () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
  }, [sessionId]);

  async function handleStartReplay() {
    if (isReplaying) return;

    const runId = replayRunRef.current + 1;
    replayRunRef.current = runId;

    setIsReplaying(true);
    setIsBootstrapping(true);
    setErrorMessage(null);

    try {
      eventSourceRef.current?.close();
      const session = await createSession();
      const emptyState = createEmptySessionState(session.id);
      setSessionId(session.id);
      setSessionState(emptyState);
      setConnectionState("connecting");

      await sleep(250);

      for (let i = 0; i < demoTranscriptChunks.length; i += 1) {
        if (replayRunRef.current !== runId) return;
        const chunk = demoTranscriptChunks[i];
        await sleep(getReplayDelay(i));
        setSessionState((current) => appendTranscriptChunk(current ?? emptyState, chunk));
        await postTranscriptChunk(session.id, chunk);
      }

      const syncedState = await getSessionState(session.id);
      if (replayRunRef.current === runId) setSessionState(syncedState);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Replay failed.");
      setConnectionState("disconnected");
    } finally {
      if (replayRunRef.current === runId) {
        setIsReplaying(false);
        setIsBootstrapping(false);
      }
    }
  }

  const state = sessionState ?? createEmptySessionState("pending");
  const totalSignals = state.decisions.length + state.actions.length + state.issues.length;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-ground)]">
      {/* ── Full-screen graph canvas ── */}
      <div className="absolute inset-0 z-0">
        <GraphPanel nodes={state.nodes} edges={state.edges} />
      </div>

      {/* ── Floating command bar ── */}
      <header
        className="animate-overlay-appear absolute top-3 left-3 right-3 z-20"
      >
        <div className="overlay-panel flex h-12 items-center justify-between px-4">
          {/* Left: brand + session */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--text-primary)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L11 4V8L6 11L1 8V4L6 1Z" fill="white" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              Launch Copilot
            </span>
            <span className="hidden text-[12px] text-[var(--text-tertiary)] sm:inline">
              /
            </span>
            <span className="hidden text-[12px] text-[var(--text-tertiary)] sm:inline">
              Launch Planning
            </span>
          </div>

          {/* Right: status + controls */}
          <div className="flex items-center gap-2">
            {errorMessage ? (
              <span className="max-w-[200px] truncate rounded-md bg-[var(--accent-red-muted)] px-2 py-1 text-[11px] font-medium text-red-600">
                {errorMessage}
              </span>
            ) : null}

            <StatusPill state={connectionState} />

            {totalSignals > 0 ? (
              <span className="rounded-md bg-[var(--accent-violet-muted)] px-2 py-1 text-[11px] font-semibold tabular-nums text-violet-600">
                {totalSignals}
              </span>
            ) : null}

            <span className="mx-0.5 h-4 w-px bg-[var(--border-primary)]" />

            <button
              type="button"
              onClick={handleStartReplay}
              disabled={isBootstrapping || isReplaying}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 text-[12px] font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isReplaying ? (
                <>
                  <span className="animate-pulse-subtle h-1.5 w-1.5 rounded-full bg-white" />
                  Replaying
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 1.5L8.5 5L2 8.5V1.5Z" fill="currentColor" />
                  </svg>
                  Replay
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Left overlay — Transcript ── */}
      <aside
        className="animate-overlay-appear absolute top-[68px] bottom-3 left-3 z-10 w-[340px]"
        style={{ animationDelay: "60ms" }}
      >
        <div className="overlay-panel flex h-full flex-col overflow-hidden">
          <TranscriptPanel chunks={state.transcript} />
        </div>
      </aside>

      {/* ── Right overlay — Insights ── */}
      <aside
        className="animate-overlay-appear absolute top-[68px] right-3 bottom-3 z-10 w-[360px]"
        style={{ animationDelay: "120ms" }}
      >
        <div className="overlay-panel flex h-full flex-col overflow-hidden">
          <InsightsPanel
            decisions={state.decisions}
            actions={state.actions}
            issues={state.issues}
          />
        </div>
      </aside>
    </div>
  );
}

/* ──────────────────────────────────────────
   Status pill
   ────────────────────────────────────────── */

function StatusPill({ state }: { state: ConnectionState }) {
  const map = {
    connected: { dot: "bg-emerald-500", label: "Live" },
    connecting: { dot: "bg-amber-400 animate-pulse-subtle", label: "Connecting" },
    disconnected: { dot: "bg-[var(--text-muted)]", label: "Offline" },
  } as const;

  const { dot, label } = map[state];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-inset)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
      <span className={`h-[5px] w-[5px] rounded-full ${dot}`} />
      {label}
    </span>
  );
}
