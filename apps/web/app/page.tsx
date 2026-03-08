"use client";

import { TranscriptPanel } from "@/components/TranscriptPanel";
import { GraphPanel } from "@/components/GraphPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import {
  mockTranscript,
  mockNodes,
  mockEdges,
  mockDecisions,
  mockActions,
  mockIssues,
} from "@/lib/mock-data";

export default function Home() {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Launch Copilot
          </h1>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          Project Aurora — Launch Planning
        </span>
      </header>

      {/* Three-panel layout */}
      <div className="grid flex-1 grid-cols-[300px_1fr_320px] overflow-hidden">
        {/* Left: Transcript */}
        <div className="border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <TranscriptPanel chunks={mockTranscript} />
        </div>

        {/* Center: Graph */}
        <div className="overflow-hidden">
          <GraphPanel nodes={mockNodes} edges={mockEdges} />
        </div>

        {/* Right: Insights */}
        <div className="border-l border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <InsightsPanel
            decisions={mockDecisions}
            actions={mockActions}
            issues={mockIssues}
          />
        </div>
      </div>
    </div>
  );
}
