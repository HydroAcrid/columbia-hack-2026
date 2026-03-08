import type { TranscriptChunk } from "@copilot/shared";

/**
 * TranscriptSource — the shared interface any STT backend must implement.
 *
 * Current implementation direction:
 *   - DeepgramSTTAdapter    (speaker-aware live STT path)
 *
 * Historical note:
 *   - Gemini Live STT was explored, but it is no longer the target because
 *     the product needs multi-speaker detection in conversation.
 *   - Gemini is still used for agent-side extraction and planned TTS /
 *     interruption work.
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
