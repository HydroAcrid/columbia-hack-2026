import type { TranscriptChunk } from "@copilot/shared";

/**
 * TranscriptSource — the shared interface any STT backend must implement.
 *
 * Implementations:
 *   - WebSpeechAdapter      (Web Speech API, Chrome/Edge)
 *   - GeminiLiveAdapter     (Nelly's Gemini Live adapter — drop-in replacement)
 *
 * Contract:
 *   - start() resolves once capture is active
 *   - stop()  resolves once capture has fully stopped
 *   - onChunk is called with finalized, stable text only — never raw partials
 *   - Every chunk must satisfy { id, speaker, text, timestamp }
 *   - All adapter-internal fields (confidence, isFinal, raw events) stay private
 */
export interface TranscriptSource {
  start(onChunk: (chunk: TranscriptChunk) => void): Promise<void>;
  stop(): Promise<void>;
}
