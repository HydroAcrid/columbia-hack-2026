"use client";

import type { TranscriptChunk } from "@copilot/shared";

interface TranscriptPanelProps {
  chunks: TranscriptChunk[];
}

export function TranscriptPanel({ chunks }: TranscriptPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="shrink-0 border-b border-zinc-200 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Transcript
      </h2>
      <div className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-4">
          {chunks.map((chunk) => (
            <li key={chunk.id} className="group">
              <div className="flex items-baseline gap-2">
                <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                  {formatTime(chunk.timestamp)}
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {chunk.speaker}
                </span>
              </div>
              <p className="mt-0.5 pl-[3.25rem] text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {chunk.text}
              </p>
            </li>
          ))}
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
