import {
  demoExtractionByChunkId,
  GraphPatchEvent,
  SessionState,
  TranscriptChunk,
} from "@copilot/shared";

import type { VertexConfig } from "./config.js";
import { GeminiExtractionProvider } from "./gemini-extraction-provider.js";

export interface ExtractionProvider {
  extract(chunk: TranscriptChunk, state: SessionState): Promise<GraphPatchEvent>;
}

export class DemoExtractionProvider implements ExtractionProvider {
  async extract(chunk: TranscriptChunk, _state: SessionState) {
    return demoExtractionByChunkId[chunk.id] ?? {};
  }
}

/**
 * HybridExtractionProvider
 *
 * Demo chunk IDs (t1, t2, ...) → instant lookup from hardcoded demo data.
 * Live chunk IDs (live-*) → Gemini API extraction.
 */
class HybridExtractionProvider implements ExtractionProvider {
  private gemini: GeminiExtractionProvider;

  constructor(apiKey: string) {
    this.gemini = new GeminiExtractionProvider(apiKey);
  }

  async extract(chunk: TranscriptChunk, state: SessionState): Promise<GraphPatchEvent> {
    // If it's a known demo chunk, use the instant lookup
    const demoResult = demoExtractionByChunkId[chunk.id];
    if (demoResult) {
      return demoResult;
    }

    // Otherwise, use Gemini for real extraction
    return this.gemini.extract(chunk, state);
  }
}

export interface ExtractionProviderMetadata {
  mode: "demo" | "hybrid";
  vertex: VertexConfig;
}

export function createExtractionProvider(vertex: VertexConfig) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (geminiApiKey) {
    console.log("[Extraction] Using Hybrid provider (demo lookup + Gemini for live)");
    return {
      provider: new HybridExtractionProvider(geminiApiKey),
      metadata: {
        mode: "hybrid",
        vertex,
      } satisfies ExtractionProviderMetadata,
    };
  }

  console.log("[Extraction] No GEMINI_API_KEY found, using demo-only extraction");
  return {
    provider: new DemoExtractionProvider(),
    metadata: {
      mode: "demo",
      vertex,
    } satisfies ExtractionProviderMetadata,
  };
}
