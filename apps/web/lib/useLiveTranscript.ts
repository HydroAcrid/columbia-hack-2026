"use client";

import { useCallback, useRef, useState } from "react";
import type { TranscriptChunk } from "@copilot/shared";
import type { TranscriptSource } from "./transcriptSource";
import {
  createSessionResponse,
  postTranscriptChunkResponse,
} from "./agent-client";

export interface LiveTranscriptState {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  error: string | null;
  start: (options?: { clear?: boolean }) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
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

  // ── Refs for stable async access (no stale closures) ──
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Ref that always has the latest chunk list — avoids stale closure on `chunks`
  const chunksRef = useRef<TranscriptChunk[]>([]);

  // Guard: prevent multiple concurrent recovery attempts
  const isRecoveringRef = useRef(false);

  // Ref for the callback so onChunk never goes stale
  const onSessionSwappedRef = useRef(onSessionSwapped);
  onSessionSwappedRef.current = onSessionSwapped;

  // ── Inline helper: create a new session and re-upload all chunks ──
  const recoverSession = useCallback(async (): Promise<string | null> => {
    try {
      console.log("[useLiveTranscript] Creating new session...");
      const res = await createSessionResponse();
      if (!res.ok) {
        console.error("[useLiveTranscript] Failed to create session:", await res.text());
        return null;
      }
      const { id: newId } = await res.json();
      console.log("[useLiveTranscript] New session created:", newId);

      // Update our ref immediately so the next chunk uses the new ID
      sessionIdRef.current = newId;

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
        if (isRecoveringRef.current) return;      // another chunk already triggered this
        isRecoveringRef.current = true;

        console.warn("[useLiveTranscript] Session 404 — recovering inline...");
        const newId = await recoverSession();
        isRecoveringRef.current = false;

        if (!newId) {
          console.error("[useLiveTranscript] Could not recover. Stopping.");
          if (source) await source.stop();
          setIsRecording(false);
          isRecordingRef.current = false;
          setError("Session lost. Please refresh the page.");
          return;
        }

        // The current chunk was already added to chunksRef and re-uploaded
        // inside recoverSession, so we're good. Next chunk will use newId.
      } else if (!res.ok) {
        console.error("[useLiveTranscript] chunk POST failed:", res.status, await res.text());
      } else {
        console.log(`[useLiveTranscript] ✅ Posted chunk to session ${sid}:`, chunk.text);
      }
    } catch (err) {
      console.error("[useLiveTranscript] network error:", err);
    }
  }, [source, recoverSession]);

  // ── Public API ──

  const start = useCallback(async (options?: { clear?: boolean }) => {
    if (!source) return;
    setError(null);
    if (options?.clear !== false) {
      setChunks([]);
      chunksRef.current = [];
    }
    try {
      await source.start(onChunk);
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [source, onChunk]);

  const stop = useCallback(async () => {
    if (!source) return;
    await source.stop();
    setIsRecording(false);
    isRecordingRef.current = false;
  }, [source]);

  const reset = useCallback(() => {
    setChunks([]);
    chunksRef.current = [];
  }, []);

  return { chunks, isRecording, error, start, stop, reset };
}
