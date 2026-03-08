import {
  demoExtractionByChunkId,
  GraphPatchEvent,
  SessionState,
  TranscriptChunk,
} from "@copilot/shared";

import type { VertexConfig } from "./config.js";

export interface ExtractionProvider {
  extract(chunk: TranscriptChunk, state: SessionState): Promise<GraphPatchEvent>;
}

export class DemoExtractionProvider implements ExtractionProvider {
  async extract(chunk: TranscriptChunk, _state: SessionState) {
    return demoExtractionByChunkId[chunk.id] ?? {};
  }
}

export interface ExtractionProviderMetadata {
  mode: "demo";
  vertex: VertexConfig;
}

export function createExtractionProvider(vertex: VertexConfig) {
  return {
    provider: new DemoExtractionProvider(),
    metadata: {
      mode: "demo",
      vertex,
    } satisfies ExtractionProviderMetadata,
  };
}
