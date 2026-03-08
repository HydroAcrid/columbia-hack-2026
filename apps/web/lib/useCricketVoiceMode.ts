"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CricketTTSMode, CricketTTSPhase } from "./useCricketTTS";

export type CricketVoicePhase = "idle" | "heard" | "thinking" | "speaking" | "error";

export interface CricketVoiceState {
  phase: CricketVoicePhase;
  heardText: string | null;
  responseText: string | null;
  playbackMode: CricketTTSMode;
  error: string | null;
}

const INITIAL_STATE: CricketVoiceState = {
  phase: "idle",
  heardText: null,
  responseText: null,
  playbackMode: null,
  error: null,
};

const HEARD_MS = 280;
const THINKING_TIMEOUT_MS = 7000;
const DISMISS_MS = 900;

export function useCricketVoiceMode(
  mode: "replay" | "live",
  tts: {
    phase: CricketTTSPhase;
    playbackMode: CricketTTSMode;
    lastError: string | null;
  },
) {
  const [state, setState] = useState<CricketVoiceState>(INITIAL_STATE);
  const heardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of [heardTimerRef, thinkingTimerRef, dismissTimerRef]) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setState(INITIAL_STATE);
  }, [clearTimers]);

  const markHeard = useCallback((heardText: string) => {
    if (mode !== "live") {
      return;
    }

    clearTimers();
    setState({
      phase: "heard",
      heardText,
      responseText: null,
      playbackMode: null,
      error: null,
    });

    heardTimerRef.current = setTimeout(() => {
      setState((current) =>
        current.phase === "heard"
          ? {
            ...current,
            phase: "thinking",
          }
          : current,
      );
    }, HEARD_MS);

    thinkingTimerRef.current = setTimeout(() => {
      setState((current) => {
        if (current.phase !== "heard" && current.phase !== "thinking") {
          return current;
        }

        return INITIAL_STATE;
      });
    }, THINKING_TIMEOUT_MS);
  }, [clearTimers, mode]);

  const beginResponse = useCallback((responseText: string) => {
    clearTimers();
    setState((current) => ({
      phase: "speaking",
      heardText: current.heardText,
      responseText,
      playbackMode: current.playbackMode,
      error: null,
    }));
  }, [clearTimers]);

  useEffect(() => {
    if (mode !== "live") {
      reset();
    }
  }, [mode, reset]);

  useEffect(() => {
    if (tts.playbackMode) {
      setState((current) =>
        current.phase === "speaking"
          ? {
            ...current,
            playbackMode: tts.playbackMode,
          }
          : current,
      );
    }
  }, [tts.playbackMode]);

  useEffect(() => {
    if (tts.phase === "error" && tts.lastError) {
      clearTimers();
      setState((current) => ({
        phase: "error",
        heardText: current.heardText,
        responseText: current.responseText,
        playbackMode: current.playbackMode,
        error: tts.lastError,
      }));

      dismissTimerRef.current = setTimeout(() => {
        setState(INITIAL_STATE);
      }, DISMISS_MS);
      return;
    }

    if (tts.phase === "idle") {
      setState((current) => {
        if (current.phase !== "speaking") {
          return current;
        }

        dismissTimerRef.current = setTimeout(() => {
          setState(INITIAL_STATE);
        }, DISMISS_MS);

        return current;
      });
    }
  }, [clearTimers, tts.lastError, tts.phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    state,
    markHeard,
    beginResponse,
    reset,
  };
}
