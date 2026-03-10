"use client";

import { useEffect, useRef } from "react";
import { resolveSpeakerProfile } from "@copilot/shared";
import type { SpeakerProfile, TranscriptChunk } from "@copilot/shared";

interface TranscriptPanelProps {
  chunks: TranscriptChunk[];
  speakerProfiles?: SpeakerProfile[];
}

/* ──────────────────────────────────────────
   Speaker identity helpers
   ────────────────────────────────────────── */

const AVATAR_PALETTE = [
  { bg: "#dbeafe", text: "#2563eb" },
  { bg: "#d1fae5", text: "#059669" },
  { bg: "#ede9fe", text: "#7c3aed" },
  { bg: "#fef3c7", text: "#d97706" },
  { bg: "#fce7f3", text: "#db2777" },
  { bg: "#e0e7ff", text: "#4f46e5" },
];

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hashSpeaker(speaker: string) {
  let hash = 0;
  for (let i = 0; i < speaker.length; i += 1) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getRole(speaker: string): string | null {
  const match = speaker.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}

function getName(speaker: string): string {
  return speaker.replace(/\s*\(.*\)\s*$/, "").trim();
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ──────────────────────────────────────────
   TranscriptPanel
   ────────────────────────────────────────── */

export function TranscriptPanel({ chunks, speakerProfiles }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const profiles = speakerProfiles ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chunks.length]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <h2 className="text-[12px] font-semibold tracking-wide uppercase text-[var(--text-tertiary)]">
          Meeting Feed
        </h2>
        {chunks.length > 0 ? (
          <span className="rounded-md bg-[var(--accent-blue-muted)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-blue-600">
            {chunks.length}
          </span>
        ) : null}
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-3">
        {chunks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-inset)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2C4.69 2 2 4.69 2 8s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10.8A4.8 4.8 0 013.2 8 4.8 4.8 0 018 3.2 4.8 4.8 0 0112.8 8 4.8 4.8 0 018 12.8zM8.4 5H7.2v3.6l3.15 1.89.6-1-.35-.21L8.4 8.2V5z"
                    fill="var(--text-muted)"
                  />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                Waiting for transcript
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
                Press Replay to stream the meeting.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {chunks.map((chunk, index) => {
              const profile = resolveSpeakerProfile(profiles, chunk.speaker);
              const palette = hashSpeaker(chunk.speaker);
              const rawName = getName(chunk.speaker);
              const inferredName = profile ? `${profile.name}${profile.confidence === "low" ? "?" : ""}` : null;
              const name = inferredName ?? rawName;
              const initials = getInitials(name);
              const role = profile ? chunk.speaker : getRole(chunk.speaker);

              return (
                <div
                  key={chunk.id}
                  className="animate-slide-in group rounded-lg px-2.5 py-2.5 transition-colors duration-150 hover:bg-black/[0.02]"
                  style={{ animationDelay: `${Math.min(index * 30, 500)}ms` }}
                >
                  <div className="flex gap-2.5">
                    {/* Avatar */}
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: palette.bg, color: palette.text }}
                    >
                      {initials}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">
                          {name}
                        </span>
                        {role ? (
                          <span className="rounded bg-[var(--surface-inset)] px-1.5 py-px text-[10px] font-medium text-[var(--text-tertiary)]">
                            {role}
                          </span>
                        ) : null}
                        <span className="ml-auto text-[10px] tabular-nums text-[var(--text-muted)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          {formatTime(chunk.timestamp)}
                        </span>
                      </div>

                      <p className="mt-1 text-[13px] leading-[1.65] text-[var(--text-secondary)]">
                        {chunk.text}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
