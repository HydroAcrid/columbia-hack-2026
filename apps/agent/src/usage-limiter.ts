import type { AgentConfig } from "./config.js";

export type VisitorBudgetKind = "sessions" | "transcriptChunks" | "tts";

type VisitorBudgetCounters = Record<VisitorBudgetKind, number>;

type VisitorBudgetWindow = {
  windowStartedAt: number;
  lastSeenAt: number;
  counters: VisitorBudgetCounters;
};

type VisitorBudgetDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

export class VisitorBudgetLimiter {
  private readonly windows = new Map<string, VisitorBudgetWindow>();
  private readonly config: AgentConfig["visitorBudget"];
  private readonly bypassIds: Set<string>;

  constructor(config: AgentConfig["visitorBudget"]) {
    this.config = config;
    this.bypassIds = new Set(
      config.bypassIds.flatMap((entry) => normalizeBypassEntry(entry)),
    );
  }

  consume(visitorKey: string | null, kind: VisitorBudgetKind): VisitorBudgetDecision {
    if (!this.config.enabled || !visitorKey || this.bypassIds.has(visitorKey)) {
      return {
        allowed: true,
        remaining: Number.POSITIVE_INFINITY,
        resetAt: Date.now() + this.config.windowMs,
        limit: Number.POSITIVE_INFINITY,
      };
    }

    const now = Date.now();
    this.prune(now);

    const window = this.getWindow(visitorKey, now);
    const limit = this.getLimit(kind);
    const nextCount = window.counters[kind] + 1;
    const remaining = Math.max(0, limit - nextCount);

    if (nextCount > limit) {
      window.lastSeenAt = now;
      return {
        allowed: false,
        remaining: 0,
        resetAt: window.windowStartedAt + this.config.windowMs,
        limit,
      };
    }

    window.counters[kind] = nextCount;
    window.lastSeenAt = now;
    return {
      allowed: true,
      remaining,
      resetAt: window.windowStartedAt + this.config.windowMs,
      limit,
    };
  }

  private getWindow(visitorKey: string, now: number) {
    const existing = this.windows.get(visitorKey);
    if (existing && now - existing.windowStartedAt < this.config.windowMs) {
      return existing;
    }

    const fresh: VisitorBudgetWindow = {
      windowStartedAt: now,
      lastSeenAt: now,
      counters: {
        sessions: 0,
        transcriptChunks: 0,
        tts: 0,
      },
    };
    this.windows.set(visitorKey, fresh);
    return fresh;
  }

  private getLimit(kind: VisitorBudgetKind) {
    if (kind === "sessions") {
      return this.config.maxSessionsPerWindow;
    }

    if (kind === "transcriptChunks") {
      return this.config.maxTranscriptChunksPerWindow;
    }

    return this.config.maxTtsRequestsPerWindow;
  }

  private prune(now: number) {
    for (const [visitorKey, window] of this.windows.entries()) {
      if (now - window.lastSeenAt >= this.config.windowMs) {
        this.windows.delete(visitorKey);
      }
    }
  }
}

export function getVisitorBudgetKey(headers: Headers) {
  const visitorId = normalizeToken(headers.get("x-nota-visitor-id"));
  if (visitorId) {
    return `visitor:${visitorId}`;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  const ip = normalizeToken(firstIp);
  return ip ? `ip:${ip}` : null;
}

export function buildVisitorBudgetExceededResponse(options: {
  kind: VisitorBudgetKind;
  decision: VisitorBudgetDecision;
}) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((options.decision.resetAt - Date.now()) / 1000),
  );

  return {
    status: 429 as const,
    headers: {
      "Retry-After": String(retryAfterSeconds),
    },
    body: {
      error: buildBudgetErrorMessage(options.kind),
      kind: options.kind,
      limit: options.decision.limit,
      retryAfterSeconds,
    },
  };
}

function buildBudgetErrorMessage(kind: VisitorBudgetKind) {
  if (kind === "sessions") {
    return "This demo has reached its per-visitor session limit. Please try again later.";
  }

  if (kind === "transcriptChunks") {
    return "This demo has reached its per-visitor live usage limit. Please try again later.";
  }

  return "This demo has reached its per-visitor Cricket voice limit. Please try again later.";
}

function normalizeToken(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128) || null;
}

function normalizeBypassEntry(value: string) {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return [];
  }

  if (normalized.includes(":")) {
    return [normalized];
  }

  return [`visitor:${normalized}`];
}
