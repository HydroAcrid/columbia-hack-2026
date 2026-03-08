"use client";

import type { ActionItem, DecisionItem, IssueItem } from "@copilot/shared";

interface InsightsPanelProps {
  decisions: DecisionItem[];
  actions: ActionItem[];
  issues: IssueItem[];
}

/* ──────────────────────────────────────────
   InsightsPanel
   ────────────────────────────────────────── */

export function InsightsPanel({ decisions, actions, issues }: InsightsPanelProps) {
  const totalSignals = decisions.length + actions.length + issues.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <h2 className="text-[12px] font-semibold tracking-wide uppercase text-[var(--text-tertiary)]">
          Operator Brief
        </h2>
        {totalSignals > 0 ? (
          <span className="rounded-md bg-[var(--accent-violet-muted)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-violet-600">
            {totalSignals}
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {totalSignals === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-inset)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M13 2H3C2.45 2 2 2.45 2 3v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm-1 10H4V4h8v8zM5 9h6v1.5H5V9zm0-2.5h6V8H5V6.5zm0-2.5h6V5.5H5V4z"
                    fill="var(--text-muted)"
                  />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                No signals yet
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
                Decisions, actions, and issues will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {decisions.length > 0 ? (
              <SignalSection
                label="Decisions"
                count={decisions.length}
                accentDot="bg-blue-500"
              >
                {decisions.map((d, i) => (
                  <SignalCard
                    key={d.id}
                    index={i}
                    accent="border-l-blue-400"
                  >
                    <p className="text-[13px] leading-[1.6] text-[var(--text-primary)]">
                      {d.text}
                    </p>
                  </SignalCard>
                ))}
              </SignalSection>
            ) : null}

            {actions.length > 0 ? (
              <SignalSection
                label="Actions"
                count={actions.length}
                accentDot="bg-emerald-500"
              >
                {actions.map((a, i) => (
                  <SignalCard
                    key={a.id}
                    index={i}
                    accent="border-l-emerald-400"
                  >
                    <p className="text-[13px] leading-[1.6] text-[var(--text-primary)]">
                      {a.text}
                    </p>
                    {a.owner ? (
                      <div className="mt-1.5 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[var(--text-tertiary)]">
                          <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
                          <path d="M1.5 9C1.5 7.07 3.07 5.5 5 5.5s3.5 1.57 3.5 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                        </svg>
                        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                          {a.owner}
                        </span>
                      </div>
                    ) : null}
                  </SignalCard>
                ))}
              </SignalSection>
            ) : null}

            {issues.length > 0 ? (
              <SignalSection
                label="Issues"
                count={issues.length}
                accentDot="bg-red-500"
              >
                {issues.map((issue, i) => (
                  <SignalCard
                    key={issue.id}
                    index={i}
                    accent={
                      issue.severity === "blocker"
                        ? "border-l-red-400"
                        : "border-l-amber-400"
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] leading-[1.6] text-[var(--text-primary)]">
                        {issue.text}
                      </p>
                      <SeverityLabel severity={issue.severity} />
                    </div>
                  </SignalCard>
                ))}
              </SignalSection>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────── */

function SignalSection({
  label,
  count,
  accentDot,
  children,
}: {
  label: string;
  count: number;
  accentDot: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={`h-[6px] w-[6px] rounded-full ${accentDot}`} />
        <h3 className="text-[11px] font-semibold tracking-wide uppercase text-[var(--text-tertiary)]">
          {label}
        </h3>
        <span className="text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
          {count}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function SignalCard({
  children,
  accent,
  index,
}: {
  children: React.ReactNode;
  accent: string;
  index: number;
}) {
  return (
    <div
      className={`animate-fade-up rounded-lg border border-[var(--border-subtle)] border-l-2 ${accent} bg-white/60 px-3 py-2.5 transition-colors duration-150 hover:bg-white/80`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {children}
    </div>
  );
}

function SeverityLabel({ severity }: { severity: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    blocker: { bg: "var(--accent-red-muted)", text: "#dc2626" },
    warning: { bg: "var(--accent-amber-muted)", text: "#b45309" },
    info: { bg: "var(--accent-blue-muted)", text: "#2563eb" },
  };
  const s = styles[severity] ?? styles.info;

  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text }}
    >
      {severity}
    </span>
  );
}
