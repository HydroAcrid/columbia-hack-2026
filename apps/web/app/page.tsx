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
    <div className="flex h-full flex-col bg-[var(--surface)]">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-panel)] px-8 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            Launch Copilot
          </h1>
          <span className="text-[13px] text-[var(--text-tertiary)]">/</span>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">
            Project Aurora — Launch Planning
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="grid flex-1 grid-cols-[300px_1fr_320px] overflow-hidden">
        {/* Left: Transcript */}
        <div className="border-r border-[var(--border)] bg-[var(--surface-panel)] overflow-hidden">
          <TranscriptPanel chunks={mockTranscript} />
        </div>

        {/* Center: Graph */}
        <div className="overflow-hidden bg-[var(--surface)]">
          <GraphPanel nodes={mockNodes} edges={mockEdges} />
        </div>

        {/* Right: Insights */}
        <div className="border-l border-[var(--border)] bg-[var(--surface-panel)] overflow-hidden">
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
