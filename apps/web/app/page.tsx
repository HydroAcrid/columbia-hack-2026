"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { LiveModeBar } from "@/components/LiveModeBar";
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
import { GeminiLiveAdapter } from "@/lib/geminiLiveAdapter";
import { useLiveTranscript } from "@/lib/useLiveTranscript";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000";

type ConnectionState = "connecting" | "connected" | "disconnected";
type Mode = "replay" | "live";

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
    {
      nodes: state.nodes,
      edges: state.edges,
    },
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
  if (currentIndex === 0) {
    return 250;
  }

  const previous = demoTranscriptChunks[currentIndex - 1];
  const current = demoTranscriptChunks[currentIndex];
  const deltaSeconds = current.timestamp - previous.timestamp;

  return Math.min(1400, Math.max(500, deltaSeconds * 120));
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export default function Home() {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isReplaying, setIsReplaying] = useState(false);
  
  const [mode, setMode] = useState<Mode>("replay");
  const [speaker, setSpeaker] = useState("Speaker 1");

  const eventSourceRef = useRef<EventSource | null>(null);
  const replayRunRef = useRef(0);

  // Live adapter — only when connected to a live session
  const adapterRef = useRef<GeminiLiveAdapter | null>(null);
  const adapter = useMemo(() => {
    if (!sessionId || mode !== "live") return null;
    const a = new GeminiLiveAdapter(sessionId, speaker);
    adapterRef.current = a;
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode]);

  useEffect(() => {
    if (adapterRef.current) {
      adapterRef.current.speaker = speaker;
    }
  }, [speaker]);

  const { chunks: liveChunks, isRecording, error, start, stop } =
    useLiveTranscript(sessionId, adapter);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setErrorMessage(null);

      try {
        eventSourceRef.current?.close();

        const session = await createSession();
        const state = await getSessionState(session.id);
        if (cancelled) {
          return;
        }

        setSessionId(session.id);
        setSessionState(state);
        setConnectionState("connecting");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Failed to bootstrap the replay session.",
        );
        setConnectionState("disconnected");
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
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
    if (!sessionId) {
      return;
    }

    const source = new EventSource(getSessionEventsUrl(sessionId));
    eventSourceRef.current = source;

    source.onopen = () => {
      setConnectionState("connected");
    };

    source.onmessage = (event) => {
      const patch = JSON.parse(event.data) as GraphPatchEvent;
      setSessionState((current) => (current ? mergeSessionState(current, patch) : current));
    };

    source.onerror = () => {
      setConnectionState("disconnected");
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [sessionId]);

  async function handleStartReplay() {
    if (isReplaying) {
      return;
    }

    if (mode === "live" && isRecording) await stop();
    setMode("replay");

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

      for (let index = 0; index < demoTranscriptChunks.length; index += 1) {
        if (replayRunRef.current !== runId) {
          return;
        }

        const chunk = demoTranscriptChunks[index];
        await sleep(getReplayDelay(index));
        setSessionState((current) => appendTranscriptChunk(current ?? emptyState, chunk));
        await postTranscriptChunk(session.id, chunk);
      }

      const syncedState = await getSessionState(session.id);
      if (replayRunRef.current === runId) {
        setSessionState(syncedState);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Replay failed to start.",
      );
      setConnectionState("disconnected");
    } finally {
      if (replayRunRef.current === runId) {
        setIsReplaying(false);
        setIsBootstrapping(false);
      }
    }
  }

  const handleModeChange = async (next: Mode) => {
    if (next === "live" && mode === "replay") {
      try {
        eventSourceRef.current?.close();
        const session = await createSession();
        const emptyState = createEmptySessionState(session.id);
        setSessionId(session.id);
        setSessionState(emptyState);
        setConnectionState("connecting");
        setMode("live");
      } catch (err) {
        console.error("[page] failed to setup live session:", err);
      }
    } else if (next === "replay" && mode === "live") {
      if (isRecording) await stop();
      setMode("replay");
    }
  };

  const handleMicToggle = async () => {
    if (isRecording) await stop();
    else await start();
  };

  const state = sessionState ?? createEmptySessionState("pending");
  const transcriptToDisplay = mode === "live" ? liveChunks : state.transcript;

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-panel)] px-8 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            Launch Copilot
          </h1>
          <span className="text-[13px] text-[var(--text-tertiary)]">/</span>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">
            Project Aurora — Launch Planning
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {mode === "replay" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                Replay Demo
              </span>
            )}
            <span className={connectionBadgeClassName(connectionState)}>
              {connectionState === "connected" ? "Agent connected" : connectionState}
            </span>
          </div>
          {mode === "replay" && (
            <button
              type="button"
              onClick={handleStartReplay}
              disabled={isBootstrapping || isReplaying}
              className="rounded-full bg-[var(--text-primary)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReplaying ? "Running replay..." : "Start Replay"}
            </button>
          )}
        </div>
      </header>

      {errorMessage ? (
        <div className="border-b border-rose-200 bg-rose-50 px-8 py-2.5 text-[12px] text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-[300px_1fr_320px] overflow-hidden">
        <div className="flex flex-col border-r border-[var(--border)] bg-[var(--surface-panel)] overflow-hidden">
          <LiveModeBar
            mode={mode}
            isRecording={isRecording}
            isSupported={true}
            speaker={speaker}
            error={error}
            onModeChange={handleModeChange}
            onSpeakerChange={setSpeaker}
            onMicToggle={handleMicToggle}
          />
          <TranscriptPanel chunks={transcriptToDisplay} />
        </div>

        <div className="overflow-hidden bg-[var(--surface)]">
          <GraphPanel nodes={state.nodes} edges={state.edges} />
        </div>

        <div className="border-l border-[var(--border)] bg-[var(--surface-panel)] overflow-hidden">
          <InsightsPanel
            decisions={state.decisions}
            actions={state.actions}
            issues={state.issues}
          />
        </div>
      </div>
    </div>
  );
}

function connectionBadgeClassName(connectionState: ConnectionState) {
  const shared =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";

  if (connectionState === "connected") {
    return `${shared} border-emerald-200 bg-emerald-50 text-emerald-700`;
  }

  if (connectionState === "connecting") {
    return `${shared} border-amber-200 bg-amber-50 text-amber-700`;
  }

  return `${shared} border-rose-200 bg-rose-50 text-rose-700`;
}
