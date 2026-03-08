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
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)]">
          Insights
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8">
        {/* Decisions */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-secondary)]">
              Decisions
            </h3>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-600">
              {decisions.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {decisions.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-panel)] p-3.5 transition-shadow hover:shadow-md"
                style={{ borderLeftWidth: 3, borderLeftColor: "#60a5fa" }}
              >
                <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
                  {d.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Action items */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-secondary)]">
              Action Items
            </h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-600">
              {actions.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {actions.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-panel)] p-3.5 transition-shadow hover:shadow-md"
                style={{ borderLeftWidth: 3, borderLeftColor: "#34d399" }}
              >
                <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
                  {a.text}
                </p>
                {a.owner && (
                  <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                    {a.owner}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Issues / Blockers */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-secondary)]">
              Issues
            </h3>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-600">
              {issues.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-panel)] p-3.5 transition-shadow hover:shadow-md"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: issue.severity === "blocker" ? "#f87171" : "#fbbf24",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
                    {issue.text}
                  </p>
                  <SeverityBadge severity={issue.severity} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    blocker: { bg: "#fef2f2", text: "#dc2626" },
    warning: { bg: "#fffbeb", text: "#d97706" },
    info: { bg: "#f0f9ff", text: "#0284c7" },
  };
  const c = config[severity] ?? config.info;

  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.text }}
    >
      {severity}
    </span>
  );
}
