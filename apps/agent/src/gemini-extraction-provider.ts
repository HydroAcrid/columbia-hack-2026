import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GraphPatchEvent, SessionState, TranscriptChunk } from "@copilot/shared";
import type { ExtractionProvider } from "./extraction-provider.js";
import {
  buildGraphExtractionContext,
  normalizeGraphPatch,
} from "./graph-engine.js";

/**
 * GeminiExtractionProvider
 *
 * Batches transcript chunks over a time window, then sends a single
 * combined extraction request to Gemini. This prevents 429 rate limits
 * from Deepgram's rapid-fire small fragments.
 *
 * Uses Gemini's JSON mode to get structured output.
 */

const SYSTEM_PROMPT = `You are an AI assistant that analyzes live meeting transcript chunks.
Given one or more chunks of meeting dialogue along with existing context,
extract structured information for a knowledge graph.

You MUST respond with valid JSON matching this exact schema:
{
  "addNodes": [{ "id": "string", "label": "string", "type": "person|team|system|milestone" }],
  "addEdges": [{ "id": "string", "source": "string", "target": "string", "type": "owns|depends_on|blocks|relates_to", "label": "string" }],
  "addDecisions": [{ "id": "string", "text": "string", "timestamp": number }],
  "addActions": [{ "id": "string", "text": "string", "owner": "string", "timestamp": number }],
  "addIssues": [{ "id": "string", "text": "string", "severity": "blocker|warning|info", "timestamp": number }],
  "highlightNodeIds": ["string"]
}

IMPORTANT RULES:
- Only extract information that is EXPLICITLY stated or strongly implied.
- If the text is filler, small talk, or off-topic, return empty arrays for everything.
- Reuse canonical entity IDs and labels from the provided entity inventory whenever relevant.
- If a spoken variant or ASR misspelling maps to a canonical entity, use the canonical label and canonical ID.
- Do NOT create near-duplicate nodes for the same concept with slightly different spelling or pronunciation.
- Keep labels concise (2-5 words).
- Use lowercase-with-hyphens for all IDs (e.g. "priya", "api-gateway", "e-priya-launch").
- For edge IDs, use the format "e-<source>-<target>".
- For decision/action/issue IDs, use the format "d-<short-key>", "a-<short-key>", "i-<short-key>".
- The timestamp should use the earliest chunk's timestamp.
- highlightNodeIds should list IDs of nodes most relevant to these chunks.
- Prefer no output over noisy output.
- Do NOT create nodes for generic nouns like backend, database, system, flow, or team unless they are explicitly scoped.
- Avoid weak "relates_to" edges unless they add concrete structure.
- Keep the graph clean and selective: blockers, dependencies, ownership, milestones, and concrete actions matter most.`;

// How long to wait for more chunks before sending a batch to Gemini
const BATCH_WINDOW_MS = 3000;

export class GeminiExtractionProvider implements ExtractionProvider {
  private model;

  // Batching state
  private pendingChunks: TranscriptChunk[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchResolvers: Array<(patch: GraphPatchEvent) => void> = [];
  private latestState: SessionState | null = null;

  constructor(apiKey: string, model: string) {
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
    // Add this chunk to the pending batch
    this.pendingChunks.push(chunk);
    this.latestState = state;

    return new Promise<GraphPatchEvent>((resolve) => {
      this.batchResolvers.push(resolve);

      // Reset the timer — we wait BATCH_WINDOW_MS from the LAST chunk
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, BATCH_WINDOW_MS);
    });
  }

  private async flushBatch() {
    // Grab the current batch
    const chunks = this.pendingChunks;
    const resolvers = this.batchResolvers;
    const state = this.latestState;

    // Clear immediately so new chunks start a new batch
    this.pendingChunks = [];
    this.batchResolvers = [];
    this.batchTimer = null;

    if (chunks.length === 0 || !state) {
      for (const r of resolvers) r({});
      return;
    }

    // Combine the text from all batched chunks
    const combinedText = chunks.map((c) => `${c.speaker}: ${c.text}`).join("\n");
    const earliestTimestamp = chunks[0].timestamp;

    const context = buildGraphExtractionContext(state, chunks);

    const prompt = `## New transcript text (${chunks.length} chunk(s))
${combinedText}
Earliest timestamp: ${earliestTimestamp}

${context}

Extract any relevant graph information from the new transcript text above.`;

    try {
      console.log(`[GeminiExtraction] Extracting batch of ${chunks.length} chunks: "${combinedText.substring(0, 80)}..."`);
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      const patch = normalizeGraphPatch(JSON.parse(text) as GraphPatchEvent, state);

      const hasContent =
        (patch.addNodes?.length ?? 0) +
        (patch.addEdges?.length ?? 0) +
        (patch.addDecisions?.length ?? 0) +
        (patch.addActions?.length ?? 0) +
        (patch.addIssues?.length ?? 0);

      if (hasContent > 0) {
        console.log(
          `[GeminiExtraction] ✅ Extracted: ${patch.addNodes?.length ?? 0} nodes, ${patch.addEdges?.length ?? 0} edges, ${patch.addDecisions?.length ?? 0} decisions, ${patch.addActions?.length ?? 0} actions, ${patch.addIssues?.length ?? 0} issues`,
        );
      } else {
        console.log(`[GeminiExtraction] (no extractable content in batch)`);
      }

      // The first resolver gets the real patch, rest get empty
      // (the backend already applies the patch to session state from the first call)
      for (let i = 0; i < resolvers.length; i++) {
        resolvers[i](i === 0 ? patch : {});
      }
    } catch (err) {
      console.error("[GeminiExtraction] Failed:", err);
      for (const r of resolvers) r({});
    }
  }
}
