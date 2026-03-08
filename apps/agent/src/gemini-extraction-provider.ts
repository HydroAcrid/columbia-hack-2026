import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GraphPatchEvent, SessionState, TranscriptChunk } from "@copilot/shared";
import type { LiveExtractionConfig } from "./config.js";
import type { ExtractionProvider } from "./extraction-provider.js";
import {
  buildLiveExtractionContext,
  normalizeGraphPatch,
} from "./graph-engine.js";

const SYSTEM_PROMPT = `You analyze live meeting transcript batches and extract only the most useful structured updates.

Return valid JSON with this schema:
{
  "addNodes": [{ "id": "string", "label": "string", "type": "person|team|system|milestone" }],
  "addEdges": [{ "id": "string", "source": "string", "target": "string", "type": "owns|depends_on|blocks|relates_to", "label": "string" }],
  "addDecisions": [{ "id": "string", "text": "string", "timestamp": number }],
  "addActions": [{ "id": "string", "text": "string", "owner": "string", "timestamp": number }],
  "addIssues": [{ "id": "string", "text": "string", "severity": "blocker|warning|info", "timestamp": number }],
  "highlightNodeIds": ["string"],
  "interruptMessage": "string or null"
}

Rules:
- Prefer no output over noisy output.
- Reuse provided canonical IDs and labels whenever possible.
- Skip filler, small talk, generic nouns, and weak structure.
- Prioritize blockers, dependencies, owners, milestones, explicit decisions, and concrete actions.
- Use lowercase-with-hyphens IDs.
- Use the earliest chunk timestamp for extracted items.

INTERRUPT RULES (for interruptMessage):
- You are an AI meeting assistant named Cricket.
- Set interruptMessage ONLY when BOTH conditions are true:
  1. Someone says "Cricket" (the wake word is detected — confirmed by the system).
  2. They ask a question or request information (e.g. "Cricket, any blockers?", "Cricket, who owns the API?", "Hey Cricket, what are we missing?").
- When both conditions are met, respond concisely (1-2 sentences) using the full meeting context — transcript history, tracked issues/blockers, ownership gaps, and the knowledge graph.
- Keep interruptMessage conversational and direct, as if speaking aloud in the meeting.
- If cricketDetected is false in the prompt, ALWAYS set interruptMessage to null — no exceptions.
- You may respond multiple times in a session.`;

const FILLER_WORDS = new Set([
  "a",
  "ah",
  "alright",
  "cool",
  "gotcha",
  "hmm",
  "hm",
  "i",
  "if",
  "just",
  "like",
  "mm",
  "mhm",
  "oh",
  "ok",
  "okay",
  "right",
  "so",
  "sure",
  "the",
  "uh",
  "uhh",
  "um",
  "umm",
  "well",
  "yeah",
  "yep",
]);

interface GenerateContentResult {
  response: {
    text(): string;
  };
}

interface GenerativeModelClient {
  generateContent(prompt: string): Promise<GenerateContentResult>;
}

interface TimerApi {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  now: () => number;
}

interface LoggerApi {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface GeminiExtractionProviderOptions {
  modelClient?: GenerativeModelClient;
  timers?: Partial<TimerApi>;
  logger?: Partial<LoggerApi>;
}

const DEFAULT_TIMERS: TimerApi = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  now: () => Date.now(),
};

const DEFAULT_LOGGER: LoggerApi = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

type FlushReason = "idle" | "max";

export class GeminiExtractionProvider implements ExtractionProvider {
  private model: GenerativeModelClient;
  private readonly liveConfig: LiveExtractionConfig;
  private readonly timers: TimerApi;
  private readonly logger: LoggerApi;
  private pendingChunks: TranscriptChunk[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private batchResolvers: Array<(patch: GraphPatchEvent) => void> = [];
  private latestState: SessionState | null = null;
  private batchStartedAt = 0;

  constructor(
    apiKey: string,
    model: string,
    liveConfig: LiveExtractionConfig,
    options: GeminiExtractionProviderOptions = {},
  ) {
    this.liveConfig = liveConfig;
    this.timers = {
      setTimeout: options.timers?.setTimeout ?? DEFAULT_TIMERS.setTimeout,
      clearTimeout: options.timers?.clearTimeout ?? DEFAULT_TIMERS.clearTimeout,
      now: options.timers?.now ?? DEFAULT_TIMERS.now,
    };
    this.logger = {
      log: options.logger?.log ?? DEFAULT_LOGGER.log,
      warn: options.logger?.warn ?? DEFAULT_LOGGER.warn,
      error: options.logger?.error ?? DEFAULT_LOGGER.error,
    };

    if (options.modelClient) {
      this.model = options.modelClient;
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });
  }

  async extract(chunk: TranscriptChunk, state: SessionState): Promise<GraphPatchEvent> {
    const isNewBatch = this.pendingChunks.length === 0;
    this.pendingChunks.push(chunk);
    this.latestState = state;

    if (isNewBatch) {
      this.batchStartedAt = this.timers.now();
      this.startMaxTimer();
      this.logEvent("batch-start", {
        chunkId: chunk.id,
        speaker: chunk.speaker,
      });
    } else {
      this.logEvent("batch-merge", {
        chunkId: chunk.id,
        pendingChunks: this.pendingChunks.length,
      });
    }

    this.resetIdleTimer();

    return new Promise<GraphPatchEvent>((resolve) => {
      this.batchResolvers.push(resolve);
    });
  }

  private startMaxTimer() {
    if (this.maxTimer) {
      this.timers.clearTimeout(this.maxTimer);
    }

    this.maxTimer = this.timers.setTimeout(() => {
      void this.handleFlushTrigger("max");
    }, this.liveConfig.batchMaxMs);
  }

  private resetIdleTimer(delay = this.liveConfig.batchIdleMs) {
    if (this.idleTimer) {
      this.timers.clearTimeout(this.idleTimer);
    }

    this.idleTimer = this.timers.setTimeout(() => {
      void this.handleFlushTrigger("idle");
    }, delay);
  }

  private async handleFlushTrigger(reason: FlushReason) {
    if (!this.pendingChunks.length) {
      return;
    }

    const waitMs = this.timers.now() - this.batchStartedAt;
    const meaningfulWordCount = countMeaningfulWords(this.pendingChunks);
    const meaningful = meaningfulWordCount >= this.liveConfig.minMeaningfulWords;

    if (reason === "idle" && !meaningful && waitMs < this.liveConfig.batchMaxMs) {
      const remainingMs = Math.max(1, this.liveConfig.batchMaxMs - waitMs);
      this.logEvent("batch-hold", {
        reason,
        waitMs,
        pendingChunks: this.pendingChunks.length,
        meaningfulWordCount,
      });
      this.resetIdleTimer(Math.min(this.liveConfig.batchIdleMs, remainingMs));
      return;
    }

    await this.flushBatch(reason, waitMs, meaningfulWordCount);
  }

  private async flushBatch(reason: FlushReason, waitMs: number, meaningfulWordCount: number) {
    const chunks = this.pendingChunks;
    const resolvers = this.batchResolvers;
    const state = this.latestState;
    const batchStartedAt = this.batchStartedAt;

    this.pendingChunks = [];
    this.batchResolvers = [];
    this.latestState = null;
    this.batchStartedAt = 0;

    if (this.idleTimer) {
      this.timers.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.maxTimer) {
      this.timers.clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }

    if (chunks.length === 0 || !state) {
      for (const resolve of resolvers) {
        resolve({});
      }
      return;
    }

    if (meaningfulWordCount < this.liveConfig.minMeaningfulWords) {
      this.logEvent("batch-skip-filler", {
        reason,
        waitMs,
        meaningfulWordCount,
        chunks: chunks.length,
      });
      for (const resolve of resolvers) {
        resolve({});
      }
      return;
    }

    const combinedText = chunks.map((chunk) => `${chunk.speaker}: ${chunk.text}`).join("\n");
    const earliestTimestamp = chunks[0].timestamp;

    // Deterministic Cricket detection — only tell Gemini to respond
    // if "cricket" appears in the new transcript text
    const cricketDetected = /\bcricket\b/i.test(combinedText);

    if (cricketDetected) {
      this.logger.log(`[GeminiExtraction] 🦗 Cricket wake word detected in: "${combinedText.substring(0, 80)}"`);
    }

    // Accumulated issues for Cricket's context
    const existingIssues = state.issues.length > 0
      ? state.issues.map((i) => `[${i.severity}] ${i.text}`).join("\n")
      : "(none)";

    const context = buildLiveExtractionContext(state, chunks, {
      transcriptLines: this.liveConfig.contextTranscriptLines,
      nodeLimit: this.liveConfig.contextNodeLimit,
      edgeLimit: this.liveConfig.contextEdgeLimit,
    });

    const prompt = `## Live transcript batch (${chunks.length} chunk(s))
${combinedText}
Earliest timestamp: ${earliestTimestamp}

${context}

## Existing tracked issues/blockers (for Cricket context)
${existingIssues}

## cricketDetected: ${cricketDetected}

Extract any relevant graph information from the live transcript batch above.${cricketDetected ? "\nCricket was called — generate an interruptMessage responding to the user's question using meeting context." : "\nDo NOT set interruptMessage."}`;

    this.logEvent("batch-flush", {
      reason,
      waitMs,
      chunks: chunks.length,
      meaningfulWordCount,
      cricketDetected,
    });

    try {
      const modelStartedAt = this.timers.now();
      const result = await this.model.generateContent(prompt);
      const modelMs = this.timers.now() - modelStartedAt;
      const rawText = result.response.text();

      let parsedPatch: GraphPatchEvent;
      try {
        parsedPatch = JSON.parse(rawText) as GraphPatchEvent;
      } catch (error) {
        this.logger.error("[GeminiExtraction] Invalid JSON response", error);
        for (const resolve of resolvers) {
          resolve({});
        }
        return;
      }

      const normalizeStartedAt = this.timers.now();
      const patch = normalizeGraphPatch(parsedPatch, state);
      const normalizeMs = this.timers.now() - normalizeStartedAt;
      const totalMs = this.timers.now() - batchStartedAt;

      if (patch.interruptMessage) {
        this.logger.log(`[GeminiExtraction] 🦗 Cricket says: "${patch.interruptMessage}"`);
      }

      this.logEvent("batch-complete", {
        reason,
        waitMs,
        modelMs,
        normalizeMs,
        totalMs,
        chunks: chunks.length,
        addNodes: patch.addNodes?.length ?? 0,
        addEdges: patch.addEdges?.length ?? 0,
        addDecisions: patch.addDecisions?.length ?? 0,
        addActions: patch.addActions?.length ?? 0,
        addIssues: patch.addIssues?.length ?? 0,
        interruptMessage: patch.interruptMessage ?? null,
      });

      for (let index = 0; index < resolvers.length; index += 1) {
        resolvers[index](index === 0 ? patch : {});
      }
    } catch (error) {
      this.logEvent("batch-failed", {
        reason,
        waitMs,
        meaningfulWordCount,
        totalMs: this.timers.now() - batchStartedAt,
      });
      this.logger.error("[GeminiExtraction] Failed", error);
      for (const resolve of resolvers) {
        resolve({});
      }
    }
  }

  private logEvent(event: string, fields: Record<string, unknown>) {
    this.logger.log(`[GeminiExtraction] ${event} ${JSON.stringify(fields)}`);
  }
}

function countMeaningfulWords(chunks: TranscriptChunk[]) {
  return chunks.reduce((count, chunk) => count + tokenizeMeaningfulWords(chunk.text).length, 0);
}

function tokenizeMeaningfulWords(text: string) {
  const tokens = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return tokens.filter((token) => token.length > 1 && !FILLER_WORDS.has(token));
}
