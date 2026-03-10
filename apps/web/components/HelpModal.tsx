"use client";

import { useEffect } from "react";

interface HelpModalProps {
  isOpen: boolean;
  isLiveMode: boolean;
  isRecording: boolean;
  onClose: () => void;
  onSwitchToLive: () => void;
  onStartRecording: () => void;
}

const FEATURE_PILLS = [
  "Live transcript",
  "Speaker graph",
  "Voice Q&A",
];

const QUICK_STEPS = [
  {
    number: "01",
    title: "Switch to Live",
    body: "Use the toggle on the left panel so Nota listens to the real conversation instead of replay mode.",
  },
  {
    number: "02",
    title: "Turn on the mic",
    body: "Press the mic button and start talking normally. The transcript and graph should begin updating right away.",
  },
  {
    number: "03",
    title: "Say “Hey Cricket”",
    body: "Say “Hey Cricket” or “Cricket” before your question so the assistant knows you want an answer.",
  },
];

const EXAMPLES = [
  "Hey Cricket, what are we missing before launch?",
  "Cricket, who owns the database work?",
  "Hey Cricket, what is blocking us right now?",
];

export function HelpModal({
  isOpen,
  isLiveMode,
  isRecording,
  onClose,
  onSwitchToLive,
  onStartRecording,
}: HelpModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const cricketState = !isLiveMode
    ? {
        label: "Next: Switch to Live",
        tone: "border border-amber-300/35 bg-amber-500/10 text-amber-800",
        note: "Cricket answers once Live Mode is on and the mic is recording.",
      }
    : !isRecording
      ? {
          label: "Next: Start Recording",
          tone: "border border-sky-300/35 bg-sky-500/10 text-sky-800",
          note: "You are in Live Mode. Start recording so Cricket can hear the room and answer back.",
        }
      : {
          label: "Cricket Ready",
          tone: "border border-emerald-300/35 bg-emerald-500/10 text-emerald-700",
          note: "Live Mode and recording are both active, so spoken Cricket questions should work.",
        };
  const primaryAction = !isLiveMode
    ? { label: "Switch to Live Mode", onClick: onSwitchToLive }
    : !isRecording
      ? { label: "Start Recording", onClick: onStartRecording }
      : null;

  return (
    <div className="animate-overlay-appear fixed inset-0 z-50 bg-[rgba(10,15,27,0.50)] backdrop-blur-[12px]">
      <div
        className="flex min-h-full items-center justify-center px-4 py-4 sm:px-6 sm:py-6 lg:px-8"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          className="relative flex w-full max-w-[920px] max-h-[88vh] flex-col overflow-hidden rounded-[28px] border border-white/28 bg-[linear-gradient(160deg,_rgba(251,253,255,0.98)_0%,_rgba(245,248,252,0.97)_52%,_rgba(239,244,249,0.96)_100%)] shadow-[0_32px_100px_rgba(15,23,42,0.40)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.14),_transparent_30%),radial-gradient(circle_at_78%_14%,_rgba(255,255,255,0.88),_transparent_20%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.05),_transparent_34%)]" />

          <header className="relative z-10 flex items-start justify-between gap-4 border-b border-black/7 bg-white/58 px-5 py-4 backdrop-blur-xl sm:px-7">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/90 bg-white/72 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                First-Time Guide
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.20em] text-[var(--text-tertiary)]">
                Launch Test Flow
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/76 text-[var(--text-secondary)] shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition duration-200 hover:scale-[1.02] hover:bg-white"
              aria-label="Close help"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <section className="px-5 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
                <div className="animate-fade-up max-w-[510px]">
                  <h2
                    id="help-modal-title"
                    className="max-w-[9ch] text-[34px] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 sm:text-[42px]"
                  >
                    Try Nota live in under a minute.
                  </h2>

                  <p className="mt-6 max-w-[470px] text-[15px] leading-8 text-[var(--text-secondary)]">
                    Nota listens to the conversation, maps people and work in the graph, and lets Cricket answer spoken questions while the meeting is happening.
                  </p>
                </div>

                <div
                  className="animate-fade-up mt-7 flex flex-wrap gap-2.5"
                  style={{ animationDelay: "60ms" }}
                >
                  {FEATURE_PILLS.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/80 bg-white/58 px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] shadow-[0_4px_12px_rgba(15,23,42,0.035)]"
                    >
                      {pill}
                    </span>
                  ))}
                </div>

                <div
                  className="animate-fade-up mt-10 rounded-[28px] border border-white/75 bg-[linear-gradient(180deg,_rgba(241,246,251,0.86),_rgba(248,250,252,0.74))] px-5 py-6 shadow-[0_20px_34px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:px-6 sm:py-7"
                  style={{ animationDelay: "110ms" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-sky-800/78">
                        Best First Test
                      </div>
                      <div className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.035em] text-slate-950">
                        Ask Cricket something useful out loud.
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${cricketState.tone}`}
                    >
                      {cricketState.label}
                    </span>
                  </div>

                  <div className="mt-8 border-t border-slate-900/8 pt-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Demo Interaction
                    </div>

                    <blockquote className="mt-4 max-w-[19ch] border-l border-slate-300/80 pl-4 text-[22px] leading-[1.5] tracking-[-0.03em] text-slate-950 sm:text-[24px]">
                      “Hey Cricket, what are we missing before launch?”
                    </blockquote>

                    <div className="animate-guide-response mt-6 flex max-w-[370px] items-start gap-3 rounded-[20px] border border-sky-200/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.82),_rgba(232,244,255,0.88))] px-4 py-3.5 shadow-[0_16px_28px_rgba(125,211,252,0.10)]">
                      <div className="relative mt-0.5 h-8 w-8 shrink-0">
                        <span className="absolute inset-0 rounded-full border border-sky-300/40 bg-sky-300/18 animate-pulse-subtle" />
                        <span className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_35%_30%,_rgba(255,255,255,0.96),_rgba(125,211,252,0.9)_45%,_rgba(14,165,233,0.88)_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_8px_18px_rgba(56,189,248,0.16)]" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] font-semibold tracking-[-0.01em] text-slate-900">
                            Cricket
                          </div>
                          <div className="h-1 w-1 rounded-full bg-sky-400/80" />
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            voice reply
                          </div>
                        </div>
                        <div className="mt-1.5 text-[13px] leading-6 text-slate-700">
                          You still need a clear owner and final success criteria before launch.
                        </div>
                      </div>
                    </div>

                    <p className="mt-6 max-w-[470px] text-[13px] leading-7 text-[var(--text-secondary)]">
                      {cricketState.note}
                    </p>

                    <p className="mt-3 max-w-[470px] text-[13px] leading-7 text-[var(--text-secondary)]">
                      You do not need perfect phrasing. Just say <span className="font-semibold text-slate-950">Cricket</span> before the question and the app should answer back.
                    </p>
                  </div>
                </div>
              </section>

              <aside className="border-t border-black/7 bg-[linear-gradient(180deg,_rgba(255,255,255,0.38),_rgba(232,238,244,0.42))] px-5 py-7 sm:px-7 sm:py-8 lg:border-t-0 lg:border-l lg:px-8 lg:py-10">
                <div className="animate-fade-up" style={{ animationDelay: "40ms" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-[var(--text-tertiary)]">
                    What To Do
                  </div>

                  <ol className="mt-6 divide-y divide-black/8 border-t border-black/8">
                    {QUICK_STEPS.map((step, index) => (
                      <li
                        key={step.number}
                        className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 rounded-[18px] py-5 transition duration-200 first:pt-6 hover:bg-white/34"
                        style={{ animationDelay: `${90 + index * 50}ms` }}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/80 bg-white/72 text-[11px] font-semibold tracking-[0.16em] text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
                          {step.number}
                        </div>

                        <div className="min-w-0 pt-1">
                          <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-slate-950">
                            {step.title}
                          </h3>
                          <p className="mt-2 max-w-[34ch] text-[13px] leading-7 text-[var(--text-secondary)]">
                            {step.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="animate-fade-up mt-8" style={{ animationDelay: "220ms" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.20em] text-[var(--text-tertiary)]">
                      Example Prompts
                    </div>
                    <div className="text-[11px] font-medium text-sky-700">
                      Speak these out loud
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3">
                    {EXAMPLES.map((example) => (
                      <div
                        key={example}
                        className="rounded-[16px] border border-white/78 bg-white/62 px-4 py-3 text-[13px] leading-6 text-slate-800 transition duration-200 hover:translate-x-[2px] hover:border-sky-200/80 hover:bg-white/82 hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                      >
                        {example}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </main>

          <footer className="relative z-10 border-t border-black/7 bg-white/62 px-5 py-5 backdrop-blur-xl sm:px-7 sm:py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="max-w-[460px] text-[12px] leading-6 text-[var(--text-tertiary)]">
                Forgot later? Tap the <span className="font-semibold text-[var(--text-secondary)]">?</span> button in the corner to reopen this guide.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                {primaryAction ? (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    className="inline-flex items-center rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] transition duration-200 hover:translate-y-[-1px] hover:shadow-[0_16px_32px_rgba(15,23,42,0.18)]"
                  >
                    {primaryAction.label}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center rounded-full border border-black/7 bg-white/72 px-4 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition duration-200 hover:border-black/10 hover:bg-white/90 hover:text-[var(--text-primary)]"
                >
                  Got it
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
