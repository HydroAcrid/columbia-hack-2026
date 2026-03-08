"use client";

import type { DecisionItem, ActionItem, IssueItem } from "@copilot/shared";

interface InsightsPanelProps {
  decisions: DecisionItem[];
  actions: ActionItem[];
  issues: IssueItem[];
}

export function InsightsPanel({ decisions, actions, issues }: InsightsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="shrink-0 border-b border-zinc-200 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Insights
      </h2>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Decisions */}
        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            <span>◆</span> Decisions
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {decisions.length}
            </span>
          </h3>
          <ul className="mt-2 space-y-2">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
              >
                {d.text}
              </li>
            ))}
          </ul>
        </section>

        {/* Action items */}
        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span>✓</span> Action Items
            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              {actions.length}
            </span>
          </h3>
          <ul className="mt-2 space-y-2">
            {actions.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950"
              >
                <p className="text-emerald-900 dark:text-emerald-200">{a.text}</p>
                {a.owner && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                    Owner: {a.owner}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Issues / Blockers */}
        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            <span>⚠</span> Issues
            <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900 dark:text-red-300">
              {issues.length}
            </span>
          </h3>
          <ul className="mt-2 space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-md border px-3 py-2 text-sm"
                style={severityStyle(issue.severity)}
              >
                <p>{issue.text}</p>
                <p className="mt-1 text-xs font-medium uppercase opacity-70">
                  {issue.severity}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function severityStyle(severity: string): React.CSSProperties {
  switch (severity) {
    case "blocker":
      return {
        borderColor: "#fca5a5",
        backgroundColor: "#fef2f2",
        color: "#991b1b",
      };
    case "warning":
      return {
        borderColor: "#fcd34d",
        backgroundColor: "#fffbeb",
        color: "#92400e",
      };
    default:
      return {
        borderColor: "#d1d5db",
        backgroundColor: "#f9fafb",
        color: "#374151",
      };
  }
}
