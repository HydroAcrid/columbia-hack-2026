"use client";

type Mode = "replay" | "live";

interface LiveModeBarProps {
  mode: Mode;
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  onModeChange: (mode: Mode) => void;
  onMicToggle: () => void;
}

export function LiveModeBar({
  mode,
  isRecording,
  isSupported,
  error,
  onModeChange,
  onMicToggle,
}: LiveModeBarProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* Row 1: mode toggle */}
      <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 self-start dark:border-zinc-700 dark:bg-zinc-800">
        <button
          onClick={() => onModeChange("replay")}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "replay"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          ↺ Replay
        </button>
        <button
          onClick={() => onModeChange("live")}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === "live"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          ◉ Live
        </button>
      </div>

      {/* Row 2: live controls (only in live mode) */}
      {mode === "live" && (
        <div className="flex items-center gap-2 flex-wrap">

          {isSupported ? (
            <button
              onClick={onMicToggle}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isRecording
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              }`}
            >
              {isRecording ? "⏹ Stop" : "🎙 Start recording"}
            </button>
          ) : (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ Use Chrome or Edge
            </span>
          )}

          {isRecording && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Recording
            </span>
          )}

          {error && (
            <span className="w-full truncate text-xs text-red-500" title={error}>
              ⚠ {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
