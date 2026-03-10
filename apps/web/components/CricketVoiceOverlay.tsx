"use client";

import { useEffect, useMemo, useState } from "react";
import type { CricketVoiceState } from "@/lib/useCricketVoiceMode";

interface CricketVoiceOverlayProps {
  state: CricketVoiceState;
}

export function CricketVoiceOverlay({ state }: CricketVoiceOverlayProps) {
  const [visibleWordCount, setVisibleWordCount] = useState(0);
  const responseWords = useMemo(
    () => (state.responseText ? state.responseText.split(/\s+/).filter(Boolean) : []),
    [state.responseText],
  );

  useEffect(() => {
    if (state.phase !== "speaking" || responseWords.length === 0) {
      setVisibleWordCount(responseWords.length);
      return;
    }

    setVisibleWordCount(0);
    const interval = window.setInterval(() => {
      setVisibleWordCount((current) => {
        if (current >= responseWords.length) {
          window.clearInterval(interval);
          return current;
        }
        return current + 1;
      });
    }, Math.max(45, Math.min(95, 1500 / Math.max(responseWords.length, 1))));

    return () => {
      window.clearInterval(interval);
    };
  }, [responseWords, state.phase]);

  if (state.phase === "idle") {
    return null;
  }

  const phaseClass = `is-${state.phase}`;
  const responseText = state.phase === "speaking"
    ? responseWords.slice(0, visibleWordCount).join(" ")
    : state.responseText;
  const statusLabel = ({
    heard: "Cricket heard you",
    thinking: "Cricket is thinking",
    speaking: "Cricket is speaking",
    error: "Cricket ran into a problem",
  } as const)[state.phase];

  return (
    <div className="pointer-events-none absolute right-6 bottom-6 left-6 z-30 flex justify-center">
      <div className="cricket-voice-shell animate-overlay-appear w-full max-w-[720px]">
        <div className="cricket-voice-panel flex items-center gap-5 rounded-2xl px-5 py-4 shadow-xl">
          <div className={`cricket-voice-orb shrink-0 ${phaseClass}`}>
            <div className="cricket-voice-ring cricket-voice-ring--outer" />
            <div className="cricket-voice-ring cricket-voice-ring--inner" />
            <div className="cricket-voice-core">
              <div className="cricket-voice-core__spark" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                {statusLabel}
              </span>
              {state.playbackMode ? (
                <span className="text-[11px] font-medium text-white/45">
                  gemini voice
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 text-left">
              {state.heardText ? (
                <div className="max-w-[560px] text-sm leading-6 text-white/62">
                  <span className="font-semibold text-white/48">Heard:</span>{" "}
                  <span>{state.heardText}</span>
                </div>
              ) : null}

              {responseText ? (
                <div className="max-w-[580px] text-[18px] leading-[1.45] font-medium tracking-[-0.01em] text-white">
                  {responseText}
                </div>
              ) : null}

              {state.phase === "error" && state.error ? (
                <div className="max-w-[560px] text-sm leading-6 text-rose-100/90">
                  {state.error}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
