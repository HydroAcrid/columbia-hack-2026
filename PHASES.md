# Build Phases — Live Launch Meeting Copilot

This file is now a current-state roadmap rather than a historical pre-build plan.

## Architecture lock

- Deepgram is the live STT path because multi-speaker detection is required.
- Gemini is used for structured extraction on the agent.
- Gemini TTS / interruption is still planned.
- Gemini Live STT is no longer the target architecture.

## Done

### Core session loop

- Replay ingestion, session creation, SSE streaming, and reconnect are implemented.
- The agent supports `POST /sessions`, `POST /sessions/:id/transcript-chunks`, `GET /sessions/:id/events`, and `GET /sessions/:id/state`.
- Transcript, graph patches, decisions, actions, and issues flow end-to-end.

### Frontend shell

- The three-panel judge-facing UI is implemented.
- Replay mode drives the same backend session pipeline as live mode.
- Browser storage persists session and last-event IDs for reconnect.

### Extraction and persistence

- Demo transcript chunks and mock extractions are shared in `packages/shared`.
- Graph merge/dedupe is implemented in `packages/graph`.
- Firestore-backed session persistence is implemented for deployed mode.
- Gemini extraction is active when `GEMINI_API_KEY` is configured.

### Local live path

- Browser mic capture exists.
- Deepgram STT proxy exists locally.
- Live chunks post to the same session pipeline as replay.

## Deployed and validated

- Agent and web deploy through Cloud Run.
- Cloud Build configs exist for both services.
- Agent deploy uses Secret Manager secrets `gemini-api-key` and `deepgram-api-key`.
- Web build resolves the active project’s agent URL dynamically.
- Local Gemini extraction has been validated against the real agent pipeline.

## Implemented but not productionized

### Deepgram live mode

- The deployed frontend still depends on `ws://localhost:4002` for STT transport.
- Result: local live mode can work, but deployed live mode is not production-ready.

### Web URL plumbing

- `apps/web/lib/agent-client.ts` is the intended shared helper.
- Some live-mode code still keeps duplicated fallback logic outside that helper.

### Replay limitations

- Demo extraction still keys off canonical chunk IDs like `t1`, `t2`, etc.
- Arbitrary test chunks can store transcript without generating demo graph updates.

## Still open

### 1. Productionize deployed live STT transport

- Remove the browser dependency on `ws://localhost:4002`.
- Keep Deepgram as the STT provider.
- Preserve the existing `TranscriptChunk` contract and downstream session API.

### 2. Add Gemini TTS / interruption

- Trigger spoken interruption from high-confidence extracted blockers or ownership gaps.
- Emit `interruptMessage` from the agent.
- Add frontend playback and UI handling.

### 3. Centralize web agent URL plumbing

- Make replay/live/local/deployed all use one source of truth.
- Remove the remaining duplicated `localhost:4000` fallbacks.

### 4. Demo runbook and browser smoke tests

- Add the fallback checklist and demo recovery runbook.
- Validate replay on deployed web.
- Validate live-mode behavior and fallback expectations in a real browser.

### 5. Tracker cleanup

- Re-scope issue `#8` to Gemini TTS / interruption.
- Keep issue `#10` as the demo runbook / fallback checklist.
- Treat issue `#6` as superseded by the Deepgram STT decision.
- Treat issue `#7` as the shared live transcript pipeline, not Gemini Live STT.
