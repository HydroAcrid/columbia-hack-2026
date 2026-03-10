"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { LiveModeBar } from "@/components/LiveModeBar";
import { CricketVoiceOverlay } from "@/components/CricketVoiceOverlay";
import { HelpModal } from "@/components/HelpModal";
import {
  createSession,
  getSessionEventsUrl,
  getSessionState,
  postTranscriptChunk,
} from "@/lib/agent-client";
import type { TranscriptSourceConnectionState } from "@/lib/transcriptSource";
import { applyPatch } from "@copilot/graph";
import {
  demoTranscriptChunks,
  type ActionItem,
  type DecisionItem,
  type GraphPatchEvent,
  type IssueItem,
  type SessionState,
  type TranscriptChunk,
  containsCricketWakeWord,
  extractCricketRequestText,
  mergeSpeakerProfiles as mergeSpeakerProfileRecords,
} from "@copilot/shared";
import { DeepgramSTTAdapter } from "@/lib/deepgramSTTAdapter";
import { useLiveTranscript } from "@/lib/useLiveTranscript";
import { useCricketTTS } from "@/lib/useCricketTTS";
import { useCricketVoiceMode } from "@/lib/useCricketVoiceMode";

type ConnectionState = "connecting" | "connected" | "recovering" | "disconnected";
type Mode = "replay" | "live";

const SESSION_STORAGE_KEY = "launch-copilot:session-id";
const LAST_EVENT_STORAGE_KEY = "launch-copilot:last-event-id";
const HELP_DISMISSED_STORAGE_KEY = "launch-copilot:help-dismissed";
const SSE_BASE_RECONNECT_MS = 1000;
const SSE_MAX_RECONNECT_MS = 8000;
const MAX_LIVE_SSE_RECONNECT_ATTEMPTS = 4;
const SSE_WATCHDOG_INTERVAL_MS = 5000;
const SSE_STALE_AFTER_MS = 45000;

function createEmptySessionState(id: string): SessionState {
  return {
    id,
    transcript: [],
    nodes: [],
    edges: [],
    decisions: [],
    actions: [],
    issues: [],
    speakerProfiles: [],
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
    speakerProfiles: mergeSpeakerProfiles(state.speakerProfiles, patch.upsertSpeakerProfiles),
  };
}

function mergeSpeakerProfiles(
  profiles: SessionState["speakerProfiles"],
  nextProfiles: GraphPatchEvent["upsertSpeakerProfiles"],
) {
  return mergeSpeakerProfileRecords(profiles, nextProfiles);
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

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
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
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const [mode, setMode] = useState<Mode>("replay");

  const eventSourceRef = useRef<EventSource | null>(null);
  const replayRunRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);
  const lastSessionEventAtRef = useRef<number | null>(null);

  // Live adapter — only when connected to a live session
  const adapterRef = useRef<DeepgramSTTAdapter | null>(null);
  const adapter = useMemo(() => {
    if (mode !== "live") {
      return null;
    }

    if (!adapterRef.current) {
      adapterRef.current = new DeepgramSTTAdapter(sessionId ?? "live");
    }

    return adapterRef.current;
  }, [mode, sessionId]);

  useEffect(() => {
    if (mode !== "live") {
      adapterRef.current = null;
      return;
    }

    if (sessionId && adapterRef.current) {
      adapterRef.current.setSessionId(sessionId);
    }
  }, [mode, sessionId]);

  // When the hook silently creates a new backend session (after a 404),
  // it tells us the new ID so we can update React state + localStorage.
  const handleSessionSwapped = useCallback((newId: string) => {
    console.log("[page] Session swapped to:", newId);
    lastEventIdRef.current = null;
    lastSessionEventAtRef.current = null;
    removeStorage(LAST_EVENT_STORAGE_KEY);
    setConnectionState("recovering");
    setErrorMessage(null);
    setSessionId(newId);
    writeStorage(SESSION_STORAGE_KEY, newId);
    void getSessionState(newId)
      .then((nextState) => {
        setSessionState(nextState);
      })
      .catch((error) => {
        console.error("[page] Failed to sync recovered session:", error);
        setSessionState(createEmptySessionState(newId));
      });
  }, []);

  const {
    chunks: liveChunks,
    isRecording,
    error: liveError,
    sourceState: liveSourceState,
    start,
    stop,
    recoverSession,
  } =
    useLiveTranscript(sessionId, adapter, handleSessionSwapped);
  const liveRecoverSessionRef = useRef(recoverSession);
  liveRecoverSessionRef.current = recoverSession;

  // Cricket TTS — plays interruptMessage audio from SSE events
  const cricketTTS = useCricketTTS();
  const cricketSpeakRef = useRef(cricketTTS.speak);
  cricketSpeakRef.current = cricketTTS.speak;
  const {
    state: cricketVoiceState,
    markHeard,
    beginResponse,
    reset: resetCricketVoice,
  } = useCricketVoiceMode(mode, {
    phase: cricketTTS.phase,
    playbackMode: cricketTTS.playbackMode,
    lastError: cricketTTS.lastError,
  });
  const lastHeardRequestKeyRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cricketTTSPhaseRef = useRef(cricketTTS.phase);
  cricketTTSPhaseRef.current = cricketTTS.phase;
  const cricketVoicePhaseRef = useRef(cricketVoiceState.phase);
  cricketVoicePhaseRef.current = cricketVoiceState.phase;
  const lastSpokenInterruptRef = useRef<{ text: string; at: number } | null>(null);
  const resolvedConnectionState = deriveConnectionState({
    sessionStreamState: connectionState,
    liveSourceState,
    isBootstrapping,
    isRecording,
    mode,
  });

  useEffect(() => {
    if (readStorage(HELP_DISMISSED_STORAGE_KEY) === "1") {
      return;
    }

    setIsHelpOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setErrorMessage(null);

      try {
        eventSourceRef.current?.close();
        const restoredSessionId = readStorage(SESSION_STORAGE_KEY);

        if (restoredSessionId) {
          try {
            const restoredState = await getSessionState(restoredSessionId);
            if (cancelled) return;

            setSessionId(restoredSessionId);
            setSessionState(restoredState);
            lastEventIdRef.current = readStorage(LAST_EVENT_STORAGE_KEY);
            lastSessionEventAtRef.current = Date.now();
            setConnectionState("connecting");
            return;
          } catch {
            removeStorage(SESSION_STORAGE_KEY);
            removeStorage(LAST_EVENT_STORAGE_KEY);
            lastEventIdRef.current = null;
            lastSessionEventAtRef.current = null;
          }
        }

        const session = await createSession();
        const state = await getSessionState(session.id);
        if (cancelled) {
          return;
        }

        writeStorage(SESSION_STORAGE_KEY, session.id);
        removeStorage(LAST_EVENT_STORAGE_KEY);
        lastEventIdRef.current = null;
        lastSessionEventAtRef.current = null;
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

    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempt = 0;
    let sessionRecoveryInFlight = false;
    let heartbeatListener: ((event: Event) => void) | null = null;

    const markSessionStreamHealthy = () => {
      lastSessionEventAtRef.current = Date.now();
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const clearWatchdogTimer = () => {
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
    };

    const teardownSource = () => {
      clearWatchdogTimer();

      if (!source) {
        return;
      }

      if (heartbeatListener) {
        source.removeEventListener("heartbeat", heartbeatListener);
      }
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();

      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }

      source = null;
      heartbeatListener = null;
    };

    const attemptSessionRecovery = async () => {
      if (cancelled || sessionRecoveryInFlight || modeRef.current !== "live") {
        return;
      }

      sessionRecoveryInFlight = true;
      setConnectionState("recovering");
      setErrorMessage(null);

      const newId = await liveRecoverSessionRef.current();
      if (cancelled) {
        return;
      }

      if (!newId) {
        setConnectionState("disconnected");
        setErrorMessage("Live session connection was lost. Please refresh the page.");
      }
    };

    const scheduleReconnect = (reason: string) => {
      teardownSource();
      clearReconnectTimer();

      if (cancelled) {
        return;
      }

      reconnectAttempt += 1;

      if (modeRef.current === "live" && reconnectAttempt > MAX_LIVE_SSE_RECONNECT_ATTEMPTS) {
        void attemptSessionRecovery();
        return;
      }

      const delay = computeReconnectDelay(reconnectAttempt);
      console.warn(`[page] Event stream recovering (${reason}), retrying in ${delay}ms`);
      setConnectionState("recovering");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        openSource();
      }, delay);
    };

    const openSource = () => {
      if (cancelled) {
        return;
      }

      teardownSource();
      clearWatchdogTimer();
      setConnectionState(reconnectAttempt > 0 ? "recovering" : "connecting");

      const nextSource = new EventSource(getSessionEventsUrl(sessionId, lastEventIdRef.current));
      source = nextSource;
      eventSourceRef.current = nextSource;
      markSessionStreamHealthy();

      heartbeatListener = () => {
        markSessionStreamHealthy();
        setConnectionState("connected");
      };
      nextSource.addEventListener("heartbeat", heartbeatListener);

      nextSource.onopen = () => {
        reconnectAttempt = 0;
        sessionRecoveryInFlight = false;
        markSessionStreamHealthy();
        setConnectionState("connected");
      };

      nextSource.onmessage = (event) => {
        markSessionStreamHealthy();
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
          writeStorage(LAST_EVENT_STORAGE_KEY, event.lastEventId);
        }

        const patch = JSON.parse(event.data) as GraphPatchEvent;
        setSessionState((current) => (current ? mergeSessionState(current, patch) : current));

        if (
          patch.interruptMessage &&
          modeRef.current === "live" &&
          cricketTTSPhaseRef.current !== "requesting" &&
          cricketTTSPhaseRef.current !== "speaking" &&
          (cricketVoicePhaseRef.current === "heard" || cricketVoicePhaseRef.current === "thinking")
        ) {
          const now = Date.now();
          const lastSpoken = lastSpokenInterruptRef.current;
          if (
            lastSpoken &&
            lastSpoken.text === patch.interruptMessage &&
            now - lastSpoken.at < 5000
          ) {
            return;
          }

          lastSpokenInterruptRef.current = {
            text: patch.interruptMessage,
            at: now,
          };
          beginResponse(patch.interruptMessage);
          cricketSpeakRef.current(patch.interruptMessage);
        }
      };

      nextSource.onerror = () => {
        scheduleReconnect("event-source-error");
      };

      watchdogTimer = setInterval(() => {
        const lastActivity = lastSessionEventAtRef.current;
        if (
          source &&
          lastActivity &&
          Date.now() - lastActivity > SSE_STALE_AFTER_MS
        ) {
          scheduleReconnect("event-source-stale");
        }
      }, SSE_WATCHDOG_INTERVAL_MS);
    };

    openSource();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      teardownSource();
    };
  }, [beginResponse, sessionId]);

  useEffect(() => {
    if (mode !== "live" || liveChunks.length === 0) {
      return;
    }

    if (cricketVoiceState.phase === "speaking" || cricketTTS.phase === "requesting") {
      return;
    }

    const request = resolveRecentCricketRequest(liveChunks);
    if (!request || lastHeardRequestKeyRef.current === request.key) {
      return;
    }

    lastHeardRequestKeyRef.current = request.key;
    markHeard(request.text);
  }, [cricketTTS.phase, cricketVoiceState.phase, liveChunks, markHeard, mode]);

  useEffect(() => {
    lastHeardRequestKeyRef.current = null;
  }, [mode, sessionId]);

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
      writeStorage(SESSION_STORAGE_KEY, session.id);
      removeStorage(LAST_EVENT_STORAGE_KEY);
      lastEventIdRef.current = null;
      lastSessionEventAtRef.current = null;
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
        writeStorage(SESSION_STORAGE_KEY, session.id);
        removeStorage(LAST_EVENT_STORAGE_KEY);
        lastEventIdRef.current = null;
        lastSessionEventAtRef.current = null;
        setSessionId(session.id);
        setSessionState(emptyState);
        setConnectionState("connecting");
        setMode("live");
      } catch (err) {
        console.error("[page] failed to setup live session:", err);
      }
    } else if (next === "replay" && mode === "live") {
      if (isRecording) await stop();
      resetCricketVoice();
      setMode("replay");
    }
  };

  const closeHelp = useCallback(() => {
    writeStorage(HELP_DISMISSED_STORAGE_KEY, "1");
    setIsHelpOpen(false);
  }, []);

  const openHelp = useCallback(() => {
    setIsHelpOpen(true);
  }, []);

  const switchToLiveFromHelp = useCallback(async () => {
    if (mode !== "live") {
      await handleModeChange("live");
    }

    closeHelp();
  }, [closeHelp, handleModeChange, mode]);

  const handleMicToggle = async () => {
    if (isRecording) await stop();
    else await start();
  };

  const state = sessionState ?? createEmptySessionState("pending");
  const transcriptToDisplay = mode === "live" ? liveChunks : state.transcript;
  const totalSignals = state.decisions.length + state.actions.length + state.issues.length;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-ground)]">
      {/* ── Full-screen graph canvas ── */}
      <div className="absolute inset-0 z-0">
        <GraphPanel
          nodes={state.nodes}
          edges={state.edges}
          transcript={state.transcript}
          speakerProfiles={state.speakerProfiles}
        />
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
              Nota
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

            {mode === "replay" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                Replay Demo
              </span>
            )}

            <StatusPill state={resolvedConnectionState} />

            {totalSignals > 0 ? (
              <span className="rounded-md bg-[var(--accent-violet-muted)] px-2 py-1 text-[11px] font-semibold tabular-nums text-violet-600">
                {totalSignals}
              </span>
            ) : null}

            <span className="mx-0.5 h-4 w-px bg-[var(--border-primary)]" />

            {mode === "replay" && (
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
            )}
          </div>
        </div>
      </header>

      {/* ── Left overlay — Transcript ── */}
      <aside
        className="animate-overlay-appear absolute top-[68px] bottom-3 left-3 z-10 w-[340px]"
        style={{ animationDelay: "60ms" }}
      >
        <div className="overlay-panel flex h-full flex-col overflow-hidden">
          <LiveModeBar
            mode={mode}
            isRecording={isRecording}
            isSupported={true}
            error={liveError}
            onModeChange={handleModeChange}
            onMicToggle={handleMicToggle}
          />
          <TranscriptPanel chunks={transcriptToDisplay} speakerProfiles={state.speakerProfiles} />
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

      {/* ── Nota voice mode overlay ── */}
      {mode === "live" ? <CricketVoiceOverlay state={cricketVoiceState} /> : null}

      <button
        type="button"
        onClick={openHelp}
        className="animate-overlay-appear absolute right-5 bottom-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/8 bg-white/92 text-[var(--text-primary)] shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] hover:bg-white"
        aria-label="Open help"
      >
        <span className="text-[18px] font-semibold leading-none">?</span>
      </button>

      <HelpModal
        isOpen={isHelpOpen}
        isLiveMode={mode === "live"}
        isRecording={isRecording}
        onClose={closeHelp}
        onSwitchToLive={switchToLiveFromHelp}
        onStartRecording={handleMicToggle}
      />
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
    recovering: { dot: "bg-sky-500 animate-pulse-subtle", label: "Recovering" },
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

function deriveConnectionState(options: {
  sessionStreamState: ConnectionState;
  liveSourceState: TranscriptSourceConnectionState;
  isBootstrapping: boolean;
  isRecording: boolean;
  mode: Mode;
}): ConnectionState {
  const {
    sessionStreamState,
    liveSourceState,
    isBootstrapping,
    isRecording,
    mode,
  } = options;

  if (isBootstrapping) {
    return "connecting";
  }

  if (sessionStreamState === "disconnected") {
    return "disconnected";
  }

  if (mode === "live" && isRecording) {
    if (liveSourceState === "recovering" || liveSourceState === "error") {
      return "recovering";
    }

    if (liveSourceState === "connecting") {
      return "connecting";
    }
  }

  if (sessionStreamState === "recovering") {
    return "recovering";
  }

  if (sessionStreamState === "connecting") {
    return "connecting";
  }

  return "connected";
}

function computeReconnectDelay(attempt: number) {
  const normalizedAttempt = Math.max(0, attempt - 1);
  return Math.min(SSE_MAX_RECONNECT_MS, SSE_BASE_RECONNECT_MS * (2 ** normalizedAttempt));
}

function resolveRecentCricketRequest(chunks: TranscriptChunk[]) {
  const last = chunks.at(-1);
  if (!last) {
    return null;
  }

  const direct = extractCricketRequestText(last.text);
  if (direct) {
    return {
      key: last.id,
      text: direct,
    };
  }

  const previous = chunks.at(-2);
  if (
    previous &&
    previous.speaker === last.speaker &&
    last.timestamp - previous.timestamp <= 1.4 &&
    containsCricketWakeWord(previous.text)
  ) {
    const combined = extractCricketRequestText(`${previous.text} ${last.text}`);
    if (combined) {
      return {
        key: `${previous.id}:${last.id}`,
        text: combined,
      };
    }
  }

  return null;
}
