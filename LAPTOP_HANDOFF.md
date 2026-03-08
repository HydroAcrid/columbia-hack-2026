# Laptop Handoff

Last updated: 2026-03-08

## Current repo state

- Branch: `main`
- Working tree: clean at handoff time
- Product framing: `Live Launch Meeting Copilot`
- Monorepo layout:
  - `apps/web` — Next.js frontend
  - `apps/agent` — Hono/Node agent service
  - `packages/shared` — shared Zod schemas + demo script
  - `packages/graph` — graph patch merge/dedupe

## What is done

### Core app loop

- Replay pipeline is in place end-to-end.
- Agent supports:
  - `POST /sessions`
  - `POST /sessions/:id/transcript-chunks`
  - `GET /sessions/:id/events`
  - `GET /sessions/:id/state`
- SSE session replay and reconnect are implemented.
- Session persistence is implemented behind a store abstraction:
  - memory store for local/dev
  - Firestore store for deployed mode
- Graph merge/dedupe is implemented in `packages/graph`.
- Shared demo transcript and mock extractions live in `packages/shared/src/demo-script.ts`.

### Frontend

- Judge-facing UI is in place and polished.
- Web app is wired to the agent instead of local-only mock state.
- Replay mode drives the same backend/session pipeline as live mode.
- Local session id and last event id are persisted in browser storage for reconnect.
- A live mode UI exists with mic controls and transcript chunk posting.

### Live mode work already merged

- A live transcript abstraction exists in `apps/web/lib/transcriptSource.ts`.
- Deepgram/browser mic capture path is merged:
  - `apps/web/lib/deepgramSTTAdapter.ts`
  - `apps/web/lib/useLiveTranscript.ts`
  - `apps/web/components/LiveModeBar.tsx`
- Agent extraction is now hybrid:
  - demo chunks (`t1`, `t2`, etc.) use shared mock extraction
  - non-demo/live chunks can go through Gemini extraction when `GEMINI_API_KEY` is set

### Google Cloud / deployment

- Agent is deployed to Cloud Run.
- Web is deployed to Cloud Run.
- Firestore is provisioned and used for session persistence in deployed mode.
- Cloud Build configs exist for both services.
- Dockerfiles exist for both services.
- Firestore rules/indexes and env examples are checked in.
- Continuous deploy to Cloud Run is set up from GitHub pushes to `main`.

## Live deployed URLs

- Web: `https://launch-copilot-web-qblbvltlrq-uc.a.run.app`
- Agent: `https://launch-copilot-agent-353476176382.us-central1.run.app`
- Agent health: `https://launch-copilot-agent-353476176382.us-central1.run.app/health`

## Continuous deploy

Cloud Build triggers are active and deploy on pushes to `main`:

- `deploy-web-main`
- `deploy-agent-main`

Verify them with:

```bash
gcloud builds triggers list --region=us-central1
```

Trigger setup script:

```bash
./scripts/setup-cloudbuild-triggers.sh
```

Important implementation detail:

- the repo uses a 2nd-gen Cloud Build GitHub connection: `hydroacrid-github`
- trigger creation had to use `gcloud alpha builds triggers create repository`
- trigger creation also required an explicit service account:
  `projects/gcloud-hackathon-edoscin8fh6pt/serviceAccounts/353476176382-compute@developer.gserviceaccount.com`

If the triggers ever need to be recreated, rerun the script above.

## Important recent git history

Recent commits on `main`:

- `23a381d` Add browser mic capture with STT and Gemini extraction
- `98009b9` Add Deepgram live mode STT
- `a77485d` Add initial configuration and Docker setup for agent and web applications
- `3b8e706` Refactor graph state management and enhance patch application logic
- `d56c226` Enhance session event handling and local storage management
- `7d523a4` Refactor global styles and enhance UI components
- `e699bc1` Merge upstream SSE session architecture with Live Mic adapter
- `478d44e` Add session management in web app
- `876145c` Add session management and transcript handling to agent service
- `8d2eb63` Move demo script into shared package

This means `PHASES.md` is no longer a full description of the current state. It still reflects an earlier checkpoint where Phase 4+ looked pending.

## Known issues / risks

### 1. `PHASES.md` is stale

- The file still says agent replay/SSE, live transcript mode, and persistence are upcoming.
- Actual repo state has those partially or fully implemented.

### 2. Localhost fallback bug still exists in live-mode code

The deployed web bundle was built with the correct Cloud Run agent URL, but local dev still has stale fallback paths in:

- `apps/web/app/page.tsx`
- `apps/web/lib/useLiveTranscript.ts`

Both still default to `http://localhost:4000` when `NEXT_PUBLIC_AGENT_URL` is missing.

Impact:

- local replay/live can fail with `ERR_CONNECTION_REFUSED`
- local browser may show `http://localhost:4000/sessions`

Recommended cleanup:

- remove duplicated `AGENT_URL` constants
- centralize on `apps/web/lib/agent-client.ts`
- use one shared helper for all session POST/SSE URLs

### 3. Replay extraction is still keyed to canonical demo chunk ids

- Mock replay extraction only triggers if chunk ids match the shared script ids like `t1`, `t2`, etc.
- Arbitrary test chunk ids will store transcript but produce no graph updates in demo mode.

### 4. Live mode is partially real, but still not fully productized

- Deepgram-based live transcription path exists.
- Gemini extraction path exists on the agent for live chunks when configured.
- Nelly's original Gemini Live adapter goal is not fully landed as a dedicated frontend `GeminiLiveAdapter`.
- Browser/live behavior still needs real browser validation, not just build/runtime checks.

### 5. Optional interruption path is still unfinished

- No fully finished one-shot voice interruption UX yet.
- This remains polish, not core loop.

### 6. Local dev and deployed web are not using one URL helper yet

- deployed builds are correct and point to the Cloud Run agent
- local code still has duplicated fallback logic outside `agent-client.ts`
- if replay starts calling `localhost:4000`, local dev is using stale or duplicated config, not the deployed bundle

## What still needs to be completed

### Highest priority cleanup

1. Update `PHASES.md` so it matches reality.
2. Fix the duplicated local agent URL fallback in:
   - `apps/web/app/page.tsx`
   - `apps/web/lib/useLiveTranscript.ts`
3. Do a real browser smoke test:
   - replay mode on local dev
   - replay mode on deployed web
   - live mode with mic permission
4. Confirm the current live stack decision:
   - keep Deepgram STT for hackathon
   - or replace with Gemini Live adapter behind the same `TranscriptSource` interface

### Nelly lane

1. Implement or finish a `GeminiLiveAdapter` that conforms to `TranscriptSource`.
2. Keep emitted payloads compatible with `TranscriptChunk`.
3. Swap the current live adapter without changing the downstream session API.
4. If needed, add one-shot TTS/interruption behavior after live transcription is stable.

### Kevin/platform lane

1. Clean the web agent URL plumbing so replay/live/local/deployed use one source of truth.
2. Refresh the handoff docs and phases doc.
3. Add a proper demo runbook:
   - replay fallback path
   - live mode fallback path
   - deployment URLs
   - env vars required
4. Decide whether to keep Firebase App Hosting artifacts in repo or remove them now that Cloud Run is the actual web deploy target.

## Key files to know

### Frontend

- `apps/web/app/page.tsx`
- `apps/web/components/GraphPanel.tsx`
- `apps/web/components/TranscriptPanel.tsx`
- `apps/web/components/InsightsPanel.tsx`
- `apps/web/components/LiveModeBar.tsx`
- `apps/web/lib/agent-client.ts`
- `apps/web/lib/useLiveTranscript.ts`
- `apps/web/lib/transcriptSource.ts`
- `apps/web/lib/deepgramSTTAdapter.ts`

### Agent

- `apps/agent/src/index.ts`
- `apps/agent/src/session-store.ts`
- `apps/agent/src/config.ts`
- `apps/agent/src/extraction-provider.ts`
- `apps/agent/src/gemini-extraction-provider.ts`

### Shared / graph

- `packages/shared/src/schemas.ts`
- `packages/shared/src/demo-script.ts`
- `packages/graph/src/index.ts`

### Deployment

- `apps/web/Dockerfile`
- `apps/agent/Dockerfile`
- `cloudbuild.web.yaml`
- `cloudbuild.agent.yaml`
- `docs/google-cloud.md`

## Basic smoke-test commands

### Local

```bash
pnpm install
pnpm build
pnpm --filter @copilot/agent dev
pnpm --filter @copilot/web dev
```

### Agent health

```bash
curl -sS https://launch-copilot-agent-353476176382.us-central1.run.app/health
```

### Create a session

```bash
curl -sS -X POST https://launch-copilot-agent-353476176382.us-central1.run.app/sessions
```

### Deploy web

```bash
gcloud builds submit \
  --config cloudbuild.web.yaml \
  --substitutions _SERVICE_NAME=launch-copilot-web,_REGION=us-central1,_AR_REPOSITORY=launch-copilot,_IMAGE_TAG=latest,_NEXT_PUBLIC_AGENT_URL=https://launch-copilot-agent-353476176382.us-central1.run.app \
  .
```

### Deploy agent

```bash
gcloud builds submit \
  --config cloudbuild.agent.yaml \
  --substitutions _SERVICE_NAME=launch-copilot-agent,_REGION=us-central1,_AR_REPOSITORY=launch-copilot \
  .
```

### List continuous deploy triggers

```bash
gcloud builds triggers list --region=us-central1
```

## Recommended first move after opening the laptop again

1. Read this file.
2. Open `apps/web/app/page.tsx` and `apps/web/lib/useLiveTranscript.ts`.
3. Remove the stray `localhost:4000` fallback duplication.
4. Update `PHASES.md`.
5. Run an actual browser replay test before touching more product features.
6. If deploy behavior looks off, inspect the Cloud Build triggers before debugging Cloud Run itself.
