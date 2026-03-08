import type { TranscriptChunk } from "@copilot/shared";
import type { TranscriptSource } from "./transcriptSource";

// ---------------------------------------------------------------------------
// Web Speech API ambient types (not guaranteed in all TS lib.dom versions)
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

// ---------------------------------------------------------------------------
// WebSpeechAdapter
// ---------------------------------------------------------------------------

/**
 * Implements TranscriptSource using the browser's SpeechRecognition API.
 *
 * Normalization rules (same contract expected from Nelly's GeminiLiveAdapter):
 *   id        — `live-${sessionId}-${seq padded to 4 digits}`
 *   speaker   — configurable label, default "Speaker 1"
 *   text      — finalized text only, never raw partials
 *   timestamp — seconds elapsed since start(), integer
 *
 * Chunking:
 *   Accumulates final results until a sentence boundary (. ? !) is detected
 *   OR 8 seconds of speech have been accumulated, then emits one chunk.
 *   A flush also happens on recognition `onend` to capture trailing speech.
 */
export class WebSpeechAdapter implements TranscriptSource {
  private recognition: SpeechRecognition | null = null;
  private seq = 0;
  private startedAt = 0;
  private active = false; // true between start() and stop()

  // Internal buffer — never exposed outside the adapter
  private buffer = "";
  private bufferStartTime = 0;
  private readonly MAX_BUFFER_SECS = 8;

  constructor(
    private readonly sessionId: string,
    public speaker = "Speaker 1"
  ) {}

  private getClass(): (new () => SpeechRecognition) | null {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  async start(onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    const Cls = this.getClass();
    if (!Cls) throw new Error("SpeechRecognition is not supported. Use Chrome or Edge.");

    this.seq = 0;
    this.buffer = "";
    this.startedAt = Date.now();
    this.bufferStartTime = Date.now();
    this.active = true;

    const rec = new Cls();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    this.recognition = rec;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result.isFinal) continue; // ignore noisy partials

        const text = result[0].transcript.trim();
        if (!text) continue;

        this.buffer = this.buffer ? `${this.buffer} ${text}` : text;

        const elapsedSecs = (Date.now() - this.bufferStartTime) / 1000;
        const isSentenceEnd = /[.?!]\s*$/.test(text);

        if (isSentenceEnd || elapsedSecs >= this.MAX_BUFFER_SECS) {
          this.flush(onChunk);
        }
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      // Benign / recoverable errors — do not surface to the user
      if (ev.error === "no-speech" || ev.error === "network") return;
      console.error("[WebSpeechAdapter] error:", ev.error, ev.message);
    };

    rec.onend = () => {
      this.flush(onChunk); // capture any trailing buffered text
      // If stop() hasn't been called, Chrome ended recognition naturally
      // (timeout or network blip) — restart to keep continuous capture going.
      if (this.active) {
        setTimeout(() => {
          if (this.active && this.recognition) {
            try { this.recognition.start(); } catch { /* already started */ }
          }
        }, 200);
      }
    };

    rec.start();
  }

  async stop(): Promise<void> {
    this.active = false;
    this.recognition?.stop();
    this.recognition = null;
  }

  private flush(onChunk: (chunk: TranscriptChunk) => void): void {
    const text = this.buffer.trim();
    if (!text) return;

    const timestamp = Math.round((Date.now() - this.startedAt) / 1000);
    const id = `live-${this.sessionId}-${String(this.seq).padStart(4, "0")}`;
    this.seq++;

    // Emit the normalized TranscriptChunk — no internal fields included
    onChunk({ id, speaker: this.speaker, text, timestamp });

    this.buffer = "";
    this.bufferStartTime = Date.now();
  }

  /** Returns true if the current browser supports SpeechRecognition */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }
}
