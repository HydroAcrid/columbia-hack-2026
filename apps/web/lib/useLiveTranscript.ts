"use client";

import { useCallback, useRef, useState } from "react";
import type { TranscriptChunk } from "@copilot/shared";
import type {
  TranscriptSource,
  TranscriptSourceConnectionState,
  TranscriptSourceStatus,
} from "./transcriptSource";
import {
  createSessionResponse,
  postTranscriptChunkResponse,
  readAgentErrorMessage,
} from "./agent-client";

export interface LiveTranscriptState {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  error: string | null;
  sourceState: TranscriptSourceConnectionState;
  lastChunkAt: number | null;
  start: (options?: { clear?: boolean }) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  recoverSession: () => Promise<string | null>;
}

/**
 * useLiveTranscript
 *
 * Drives the full live transcript flow:
 *   1. Calls source.start() to begin mic capture + transcription
 *   2. On each emitted TranscriptChunk:
 *      - Appends to local state immediately (instant UI update)
 *      - POSTs to POST /sessions/:id/transcript-chunks
 *      - If the POST returns 404 (backend restarted), silently creates a
 *        new session, re-uploads all chunks, and continues. The microphone
 *        never stops. Everything happens inside onChunk — no React effects.
 *   3. Calls source.stop() on demand
 *
 * @param onSessionSwapped  Optional callback so page.tsx can update its own
 *                          sessionId state / localStorage when the hook
 *                          silently swaps to a new backend session.
 */
export function useLiveTranscript(
  sessionId: string | null,
  source: TranscriptSource | null,
  onSessionSwapped?: (newSessionId: string) => void
): LiveTranscriptState {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<TranscriptSourceConnectionState>("idle");
  const [lastChunkAt, setLastChunkAt] = useState<number | null>(null);

  // ── Refs for stable async access (no stale closures) ──
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const activeSourceRef = useRef<TranscriptSource | null>(null);
  const unsubscribeSourceStatusRef = useRef<(() => void) | null>(null);

  // Ref that always has the latest chunk list — avoids stale closure on `chunks`
  const chunksRef = useRef<TranscriptChunk[]>([]);

  // Guard: prevent multiple concurrent recovery attempts
  const isRecoveringRef = useRef(false);

  // Ref for the callback so onChunk never goes stale
  const onSessionSwappedRef = useRef(onSessionSwapped);
  onSessionSwappedRef.current = onSessionSwapped;

  const handleSourceStatus = useCallback((status: TranscriptSourceStatus) => {
    setSourceState(status.state);
  }, []);

  const bindSourceStatus = useCallback((nextSource: TranscriptSource | null) => {
    unsubscribeSourceStatusRef.current?.();
    unsubscribeSourceStatusRef.current = null;

    if (nextSource?.subscribeStatus) {
      unsubscribeSourceStatusRef.current = nextSource.subscribeStatus(handleSourceStatus);
    } else {
      setSourceState(nextSource ? "connected" : "idle");
    }
  }, [handleSourceStatus]);

  // ── Inline helper: create a new session and re-upload all chunks ──
  const recoverSession = useCallback(async (): Promise<string | null> => {
    if (isRecoveringRef.current) {
      return sessionIdRef.current;
    }

    isRecoveringRef.current = true;
    setSourceState("recovering");
    setError(null);

    try {
      console.log("[useLiveTranscript] Creating new session...");
      const res = await createSessionResponse();
      if (!res.ok) {
        const message = await readAgentErrorMessage(res);
        console.error("[useLiveTranscript] Failed to create session:", message);
        setError(message);
        return null;
      }
      const { id: newId } = await res.json();
      console.log("[useLiveTranscript] New session created:", newId);

      // Update our ref immediately so the next chunk uses the new ID
      sessionIdRef.current = newId;
      activeSourceRef.current?.setSessionId?.(newId);

      // Wait briefly for the backend to fully initialise the session's graph
      await new Promise((r) => setTimeout(r, 500));

      // Re-upload every chunk the UI already has
      const existing = chunksRef.current;
      if (existing.length > 0) {
        console.log(`[useLiveTranscript] Re-uploading ${existing.length} chunks to ${newId}`);
        for (const chunk of existing) {
          try {
            await postTranscriptChunkResponse(newId, chunk);
          } catch {
            // Best-effort — don't abort the whole recovery for one chunk
          }
        }
        console.log("[useLiveTranscript] Re-upload complete.");
      }

      // Notify page.tsx so it can update React state / localStorage
      onSessionSwappedRef.current?.(newId);

      return newId;
    } catch (err) {
      console.error("[useLiveTranscript] Recovery failed:", err);
      return null;
    } finally {
      isRecoveringRef.current = false;
    }
  }, []);

  // ── Core: handle each incoming chunk ──
  const onChunk = useCallback(async (chunk: TranscriptChunk) => {
    // 1. Always update the UI immediately
    setChunks((prev) => {
      const next = [...prev, chunk];
      chunksRef.current = next;       // keep ref in sync
      return next;
    });
    setLastChunkAt(Date.now());

    // 2. Only POST if we are actively recording
    if (!isRecordingRef.current) return;

    let sid = sessionIdRef.current;
    if (!sid) return;

    // 3. Try to POST the chunk
    try {
      console.log(`[useLiveTranscript] POSTing chunk to session ${sid}:`, chunk.text);
      const res = await postTranscriptChunkResponse(sid, chunk);

      if (res.status === 404) {
        // ── Backend restarted — recover inline ──
        console.warn("[useLiveTranscript] Session 404 — recovering inline...");
        const newId = await recoverSession();

        if (!newId) {
          console.error("[useLiveTranscript] Could not recover. Stopping.");
          if (activeSourceRef.current) await activeSourceRef.current.stop();
          setIsRecording(false);
          isRecordingRef.current = false;
          setError("Session lost. Please refresh the page.");
          return;
        }

        // The current chunk was already added to chunksRef and re-uploaded
        // inside recoverSession, so we're good. Next chunk will use newId.
      } else if (!res.ok) {
        const message = await readAgentErrorMessage(res);
        console.error("[useLiveTranscript] chunk POST failed:", res.status, message);

        if (res.status === 429) {
          if (activeSourceRef.current) {
            await activeSourceRef.current.stop();
            activeSourceRef.current = null;
          }
          bindSourceStatus(null);
          setIsRecording(false);
          isRecordingRef.current = false;
          setError(message);
          return;
        }

        setError(`Transcript sync failed (${res.status}). Recovering if needed.`);
      } else {
        console.log(`[useLiveTranscript] ✅ Posted chunk to session ${sid}:`, chunk.text);
        setError(null);
      }
    } catch (err) {
      console.error("[useLiveTranscript] network error:", err);
      setError(err instanceof Error ? err.message : "Live transcript network error.");
    }
  }, [recoverSession]);

  // ── Public API ──

  const start = useCallback(async (options?: { clear?: boolean }) => {
    if (!source) return;
    if (isRecordingRef.current) return;
    setError(null);
    if (options?.clear !== false) {
      setChunks([]);
      chunksRef.current = [];
    }
    try {
      activeSourceRef.current = source;
      bindSourceStatus(source);
      source.setSessionId?.(sessionIdRef.current ?? "live");
      await source.start(onChunk);
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      bindSourceStatus(null);
      activeSourceRef.current = null;
    }
  }, [bindSourceStatus, onChunk, source]);

  const stop = useCallback(async () => {
    const activeSource = activeSourceRef.current;
    if (!activeSource) {
      return;
    }

    await activeSource.stop();
    activeSourceRef.current = null;
    bindSourceStatus(null);
    setIsRecording(false);
    isRecordingRef.current = false;
    setError(null);
  }, [bindSourceStatus]);

  const reset = useCallback(() => {
    setChunks([]);
    chunksRef.current = [];
    setLastChunkAt(null);
  }, []);

  return { chunks, isRecording, error, sourceState, lastChunkAt, start, stop, reset, recoverSession };
}
