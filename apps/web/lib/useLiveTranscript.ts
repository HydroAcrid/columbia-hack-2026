"use client";

import { useCallback, useRef, useState } from "react";
import type { TranscriptChunk } from "@copilot/shared";
import type { TranscriptSource } from "./transcriptSource";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000";

export interface LiveTranscriptState {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * useLiveTranscript
 *
 * Drives the full live transcript flow:
 *   1. Calls source.start() to begin mic capture + transcription
 *   2. On each emitted TranscriptChunk:
 *      - Appends to local state immediately (instant UI update)
 *      - POSTs to POST /sessions/:id/transcript-chunks
 *   3. Calls source.stop() on demand
 *
 * The `source` is a TranscriptSource — WebSpeechAdapter or GeminiLiveAdapter.
 * This hook doesn't care which. Swapping adapters requires no changes here.
 */
export function useLiveTranscript(
  sessionId: string | null,
  source: TranscriptSource | null
): LiveTranscriptState {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable ref so onChunk always sees current sessionId without re-registering
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const onChunk = useCallback(async (chunk: TranscriptChunk) => {
    // Update UI immediately
    setChunks((prev) => [...prev, chunk]);

    const sid = sessionIdRef.current;
    if (!sid) return;

    // POST to agent — same endpoint as replay mode
    try {
      const res = await fetch(`${AGENT_URL}/sessions/${sid}/transcript-chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error("[useLiveTranscript] chunk POST failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("[useLiveTranscript] network error:", err);
    }
  }, []);

  const start = useCallback(async () => {
    if (!source) return;
    setError(null);
    setChunks([]);
    try {
      await source.start(onChunk);
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [source, onChunk]);

  const stop = useCallback(async () => {
    if (!source) return;
    await source.stop();
    setIsRecording(false);
  }, [source]);

  return { chunks, isRecording, error, start, stop };
}
