"use client";

import type { TranscriptChunk } from "@copilot/shared";

interface TranscriptPanelProps {
  chunks: TranscriptChunk[];
}

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fae8ff", text: "#6b21a8" },
  { bg: "#ffedd5", text: "#9a3412" },
  { bg: "#e0e7ff", text: "#3730a3" },
  { bg: "#fef9c3", text: "#854d0e" },
];

function getInitials(speaker: string): string {
  const name = speaker.replace(/\s*\(.*\)\s*$/, "").trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(speaker: string) {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getRole(speaker: string): string | null {
  const match = speaker.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}

function getName(speaker: string): string {
  return speaker.replace(/\s*\(.*\)\s*$/, "").trim();
}

export function TranscriptPanel({ chunks }: TranscriptPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)]">
          Transcript
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ul className="space-y-1">
          {chunks.map((chunk) => {
            const color = getAvatarColor(chunk.speaker);
            const initials = getInitials(chunk.speaker);
            const name = getName(chunk.speaker);
            const role = getRole(chunk.speaker);

            return (
              <li
                key={chunk.id}
                className="group rounded-lg px-2 py-3 transition-colors hover:bg-stone-50"
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Speaker + timestamp */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {name}
                      </span>
                      {role && (
                        <span className="text-[11px] text-[var(--text-tertiary)]">
                          {role}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] tabular-nums text-[var(--text-tertiary)]">
                        {formatTime(chunk.timestamp)}
                      </span>
                    </div>

                    {/* Body */}
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                      {chunk.text}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
