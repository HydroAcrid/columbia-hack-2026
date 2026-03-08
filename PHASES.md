# Build Phases — Live Launch Meeting Copilot

## Phase 1: Revise plan.md and demo script ✅

- Rewrote product framing to "Live Launch Meeting Copilot"
- Defined launch-planning demo scenario (Priya/PM, Kevin/Eng, Sara/Design, Marcus/Ops)
- Locked stack: pnpm monorepo, Next.js, Node+TS agent, Zod schemas, Firestore later
- Defined MVP priority order and fallback-first reliability requirement

## Phase 2: Scaffold monorepo and shared schemas ✅

- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- `packages/shared`: Zod schemas for `TranscriptChunk`, `GraphNode`, `GraphEdge`, `DecisionItem`, `ActionItem`, `IssueItem`, `GraphPatchEvent`, `SessionState`
- `packages/graph`: `applyPatch()` and `dedupeNodes()` with shared types

## Phase 3: Web shell with three-panel layout ✅

- Next.js app in `apps/web` with Tailwind and React Flow
- Three panels: `TranscriptPanel`, `GraphPanel`, `InsightsPanel`
- Mock data wired in for visual validation
- Agent stub in `apps/agent` with `/health` endpoint (Hono)

---

## Phase 4: Agent service — replay ingestion + SSE streaming

Goal: the agent accepts scripted transcript chunks via REST, runs them through an extraction step (mocked first, then LLM), and streams `GraphPatchEvent`s to the frontend over SSE.

### 4.1 Move demo script data to `packages/shared`

- Move the launch-planning transcript chunks from `apps/web/lib/mock-data.ts` into `packages/shared/src/demo-script.ts`
- Export as `demoTranscriptChunks` with paired `demoExtractions` (mocked `GraphPatchEvent` per chunk)
- Both agent and web can import from `@copilot/shared`

### 4.2 Agent API routes

Add to `apps/agent/src/index.ts`:

- `POST /sessions` — create a new session (in-memory), returns `{ id }`
- `POST /sessions/:id/transcript-chunks` — accepts a `TranscriptChunk`, triggers extraction, stores result
- `GET /sessions/:id/events` — SSE endpoint, streams `GraphPatchEvent`s as they are produced
- `GET /sessions/:id/state` — returns full current `SessionState` (for SSE reconnect / initial load)

### 4.3 In-memory session store

- `Map<string, SessionState>` in the agent process
- Each ingested chunk appends to `transcript`, runs extraction, merges graph, emits SSE event

### 4.4 Mocked extraction first

- For each `TranscriptChunk`, look up a paired `GraphPatchEvent` from `demoExtractions`
- No LLM call yet — validates the full loop end-to-end

### 4.5 SSE streaming

- Use Hono's streaming response for `GET /sessions/:id/events`
- Each event is `data: JSON.stringify(GraphPatchEvent)\n\n`
- Client connects on page load, applies patches incrementally

### 4.6 Wire frontend to SSE

- Replace direct mock import in `apps/web/app/page.tsx` with:
  - On mount: `POST /sessions` to get a session id
  - Connect to `GET /sessions/:id/events` via `EventSource`
  - Apply each `GraphPatchEvent` to local state using `applyPatch()` from `@copilot/graph`
  - Feed state into the three panel components
- Add a "Start Replay" button that `POST`s each demo chunk with a delay

---

## Phase 5: Graph merge/dedupe and patch rendering

Goal: real extraction produces clean, deduplicated graph updates.

### 5.1 Swap mocked extraction for LLM extraction

- Add Gemini API call in the agent's extraction step
- Prompt: given transcript chunk + current graph state, return structured `GraphPatchEvent` JSON
- Validate output against Zod schema before merging

### 5.2 Harden `applyPatch` in `packages/graph`

- Fuzzy node deduplication (normalise labels, match by alias)
- Edge deduplication (same source+target+type = update, not duplicate)
- Conflict resolution: if two chunks disagree on an edge type, emit an `IssueItem`

### 5.3 Extraction rules enforced in prompt + validation

- Never invent owners or deadlines not mentioned in transcript
- Prefer reusing existing node IDs
- Only emit strong relationships
- If uncertain, emit an issue instead of a fact

---

## Phase 6: Live transcript mode

Goal: browser microphone input feeds the same pipeline as replay mode.

### 6.1 Browser audio capture

- `navigator.mediaDevices.getUserMedia` in the frontend
- Stream audio to a speech-to-text service (Gemini Live API or Web Speech API as fallback)

### 6.2 Live transcript chunks

- As STT produces text, buffer into `TranscriptChunk` objects (every ~5-10 seconds)
- `POST` each chunk to `POST /sessions/:id/transcript-chunks` — same endpoint as replay

### 6.3 Mode toggle in UI

- Switch between "Replay Demo" and "Live" modes
- Both use the same SSE consumer and patch pipeline
- Live mode can be disabled instantly and replay launched for demo recovery

---

## Phase 7: Session persistence

Goal: transcript, graph, and event history survive page refresh.

### 7.1 Firestore integration

- Store `SessionState` in Firestore, keyed by session ID
- Write after each extraction cycle (debounced)
- On `GET /sessions/:id/state`, read from Firestore if not in memory

### 7.2 SSE reconnect

- Client sends `Last-Event-ID` header on reconnect
- Agent replays missed events or sends full state snapshot

---

## Phase 8: Voice interruption (optional polish)

Goal: one AI-triggered spoken interruption when a blocker or ownership gap is detected.

### 8.1 Trigger logic

- After extraction, check if the `GraphPatchEvent` contains:
  - an `IssueItem` with severity `blocker`
  - an `ActionItem` with no owner
  - a contradiction in node relationships
- If triggered, add `interruptMessage` to the SSE event

### 8.2 Frontend interrupt handling

- When `interruptMessage` is present in a patch event:
  - Highlight the related `highlightNodeIds` on the graph
  - Show a toast/banner with the interrupt message
  - Optionally play TTS via browser `SpeechSynthesis` API

### 8.3 Constraints

- Fire at most once per session in the scripted demo
- Keep the message short (one sentence)
- Only trigger on high-confidence events

---

## Current status

| Phase | Status |
|-------|--------|
| 1. Plan + demo script | Done |
| 2. Monorepo + schemas | Done |
| 3. Web shell + panels | Done |
| **4. Agent + replay + SSE** | **Next** |
| 5. LLM extraction + dedupe | Upcoming |
| 6. Live transcript mode | Upcoming |
| 7. Session persistence | Upcoming |
| 8. Voice interruption | Upcoming (optional) |
