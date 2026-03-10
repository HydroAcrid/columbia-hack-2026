import type { TranscriptChunk, TranscriptWord } from "@copilot/shared";

const MERGE_GAP_SECONDS = 0.7;
const HARD_GAP_SECONDS = 1.0;
const UNKNOWN_SPEAKER_ID = "Speaker unknown";

type LoggerApi = Pick<Console, "log">;

export type SegmentBreakReason =
  | "speaker-change"
  | "soft-gap"
  | "hard-gap"
  | "terminal-punctuation"
  | "vad-end"
  | "utterance-end"
  | "close"
  | "error";

export interface DeepgramTranscriptWord {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  speaker?: number | string;
  confidence?: number;
}

export interface DeepgramTranscriptEvent {
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      words?: DeepgramTranscriptWord[];
    }>;
  };
  is_final?: boolean;
  speech_final?: boolean;
}

export type LiveTranscriptChunk = Omit<TranscriptChunk, "id">;

interface SegmenterOptions {
  debug?: boolean;
  logger?: LoggerApi;
}

interface PendingSegment {
  speaker: string;
  text: string;
  timestamp: number;
  start: number;
  end: number;
  words: TranscriptWord[];
}

const DEFAULT_LOGGER: LoggerApi = {
  log: (...args) => console.log(...args),
};

export class LiveTranscriptSegmenter {
  private pendingSegment: PendingSegment | null = null;
  private readonly debug: boolean;
  private readonly logger: LoggerApi;
  private transcriptEventCount = 0;

  constructor(options: SegmenterOptions = {}) {
    this.debug = options.debug ?? false;
    this.logger = options.logger ?? DEFAULT_LOGGER;
  }

  handleTranscriptEvent(data: DeepgramTranscriptEvent) {
    this.transcriptEventCount += 1;

    const alternative = data.channel?.alternatives?.[0];
    const words = normalizeWords(alternative?.words ?? []);
    const speakerIds = [...new Set(words.map((word) => word.speakerId).filter(Boolean))];

    this.logDebug("raw-transcript-event", {
      transcriptEventCount: this.transcriptEventCount,
      isFinal: Boolean(data.is_final),
      speechFinal: Boolean(data.speech_final),
      wordCount: words.length,
      speakerCount: speakerIds.length,
    });

    if (!data.is_final || words.length === 0) {
      return [];
    }

    const spans = splitWordsIntoSpeakerSpans(words);
    if (speakerIds.length > 1 || spans.length > 1) {
      this.logDebug("multi-speaker-span-split", {
        speakerIds,
        spans: spans.length,
      });
    }

    const emitted: LiveTranscriptChunk[] = [];
    for (const span of spans) {
      emitted.push(...this.absorbSpan(span));
    }

    if (data.speech_final) {
      emitted.push(...this.flushPending("vad-end"));
    }

    return emitted;
  }

  handleUtteranceEnd() {
    return this.flushPending("utterance-end");
  }

  flushPending(reason: SegmentBreakReason) {
    if (!this.pendingSegment) {
      return [];
    }

    const chunk = toChunk(this.pendingSegment);
    this.logDebug("segment-flush", {
      reason,
      speaker: chunk.speaker,
      start: chunk.start,
      end: chunk.end,
      wordCount: chunk.words?.length ?? 0,
      text: chunk.text,
    });
    this.pendingSegment = null;
    return [chunk];
  }

  private absorbSpan(span: PendingSegment) {
    if (!this.pendingSegment) {
      this.pendingSegment = span;
      return [];
    }

    if (this.pendingSegment.speaker !== span.speaker) {
      const emitted = this.flushPending("speaker-change");
      this.pendingSegment = span;
      return emitted;
    }

    const gapSeconds = span.start - this.pendingSegment.end;
    const pendingEndsSentence = endsWithTerminalPunctuation(this.pendingSegment.text);

    if (gapSeconds <= 0 || (gapSeconds < MERGE_GAP_SECONDS && !pendingEndsSentence)) {
      this.pendingSegment = mergeSegments(this.pendingSegment, span);
      return [];
    }

    const reason = pendingEndsSentence
      ? "terminal-punctuation"
      : gapSeconds >= HARD_GAP_SECONDS
        ? "hard-gap"
        : "soft-gap";
    const emitted = this.flushPending(reason);
    this.pendingSegment = span;
    return emitted;
  }

  private logDebug(event: string, fields: Record<string, unknown>) {
    if (!this.debug) {
      return;
    }

    this.logger.log(`[STT] ${event} ${JSON.stringify(fields)}`);
  }
}

function normalizeWords(words: DeepgramTranscriptWord[]) {
  const normalized: TranscriptWord[] = [];

  for (const word of words) {
    const text = normalizeWordText(word.punctuated_word ?? word.word ?? "");
    const start = typeof word.start === "number" ? word.start : null;
    const end = typeof word.end === "number" ? word.end : start;
    if (!text || start === null || end === null) {
      continue;
    }

    normalized.push({
      text,
      start,
      end,
      speakerId: normalizeSpeakerId(word.speaker),
      confidence: typeof word.confidence === "number" ? word.confidence : undefined,
    });
  }

  return normalized;
}

function splitWordsIntoSpeakerSpans(words: TranscriptWord[]) {
  const spans: PendingSegment[] = [];
  let currentWords: TranscriptWord[] = [];
  let currentSpeaker = words[0]?.speakerId ?? UNKNOWN_SPEAKER_ID;

  for (const originalWord of words) {
    const word: TranscriptWord = {
      ...originalWord,
      speakerId: originalWord.speakerId ?? currentSpeaker,
    };

    if (!currentWords.length) {
      currentWords = [word];
      currentSpeaker = word.speakerId ?? UNKNOWN_SPEAKER_ID;
      continue;
    }

    const previousWord = currentWords[currentWords.length - 1];
    const nextSpeaker = word.speakerId ?? currentSpeaker;
    const gapSeconds = word.start - previousWord.end;

    if (
      nextSpeaker !== currentSpeaker ||
      gapSeconds >= MERGE_GAP_SECONDS ||
      endsWithTerminalPunctuation(previousWord.text)
    ) {
      spans.push(toSegment(currentSpeaker, currentWords));
      currentWords = [word];
      currentSpeaker = nextSpeaker;
      continue;
    }

    currentWords.push(word);
  }

  if (currentWords.length) {
    spans.push(toSegment(currentSpeaker, currentWords));
  }

  return spans;
}

function toSegment(speaker: string, words: TranscriptWord[]): PendingSegment {
  const mergedWords = mergeTranscriptWords([], words);
  const start = mergedWords[0]?.start ?? 0;
  const end = mergedWords[mergedWords.length - 1]?.end ?? start;

  return {
    speaker,
    words: mergedWords,
    start,
    end,
    timestamp: start,
    text: formatWords(mergedWords),
  };
}

function mergeSegments(existing: PendingSegment, incoming: PendingSegment): PendingSegment {
  const words = mergeTranscriptWords(existing.words, incoming.words);

  return {
    speaker: existing.speaker,
    words,
    start: Math.min(existing.start, incoming.start),
    end: Math.max(existing.end, incoming.end),
    timestamp: Math.min(existing.timestamp, incoming.timestamp),
    text: formatWords(words),
  };
}

function mergeTranscriptWords(existingWords: TranscriptWord[], incomingWords: TranscriptWord[]) {
  if (!existingWords.length) {
    return [...incomingWords];
  }

  if (!incomingWords.length) {
    return [...existingWords];
  }

  const maxOverlap = Math.min(existingWords.length, incomingWords.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const existingSuffix = existingWords.slice(-overlap).map(wordKey);
    const incomingPrefix = incomingWords.slice(0, overlap).map(wordKey);
    if (existingSuffix.every((value, index) => value === incomingPrefix[index])) {
      return [...existingWords, ...incomingWords.slice(overlap)];
    }
  }

  const merged = [...existingWords];
  const seen = new Set(existingWords.map(wordKey));
  for (const word of incomingWords) {
    const key = wordKey(word);
    if (seen.has(key)) {
      continue;
    }

    merged.push(word);
    seen.add(key);
  }

  return merged.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    if (left.end !== right.end) {
      return left.end - right.end;
    }

    return (left.speakerId ?? "").localeCompare(right.speakerId ?? "");
  });
}

function toChunk(segment: PendingSegment): LiveTranscriptChunk {
  return {
    speaker: segment.speaker,
    text: segment.text,
    timestamp: segment.timestamp,
    start: segment.start,
    end: segment.end,
    words: [...segment.words],
  };
}

function normalizeSpeakerId(rawSpeakerId: number | string | undefined) {
  if (rawSpeakerId === undefined || rawSpeakerId === null || rawSpeakerId === "") {
    return undefined;
  }

  return `Speaker ${rawSpeakerId}`;
}

function normalizeWordText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function formatWords(words: TranscriptWord[]) {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function endsWithTerminalPunctuation(text: string) {
  return /[.!?]["')\]]*$/.test(text.trim());
}

function wordKey(word: TranscriptWord) {
  return [
    word.speakerId ?? "",
    word.start.toFixed(3),
    word.end.toFixed(3),
    word.text.toLowerCase(),
  ].join("|");
}
