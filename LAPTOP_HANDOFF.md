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
- Product decision: Deepgram stays as the live STT path because speaker separation is required.
- Gemini is still in the stack for structured extraction and planned TTS / interruption behavior.
- Gemini Live STT is no longer the target implementation.

### Google Cloud / deployment

- Agent is deployed to Cloud Run.
- Web is deployed to Cloud Run.
- Firestore is provisioned and used for session persistence in deployed mode.
- Cloud Build configs exist for both services.
- Dockerfiles exist for both services.
- Firestore rules/indexes and env examples are checked in.
- Continuous deploy to Cloud Run is set up from GitHub pushes to `main`.
- Active target project is now `hackathon-test-key`.

## Live deployed URLs

The old `gcloud-hackathon-edoscin8fh6pt` URLs are stale. Read the current URLs from Cloud Run in `hackathon-test-key`:

```bash
gcloud run services list --project=hackathon-test-key --region=us-central1
```

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
- trigger creation also requires the active project's compute service account

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

### 1. Deepgram STT is the chosen live path, but deployed live STT is not finished

- Deepgram is the correct STT choice because the product needs multi-speaker detection.
- The browser adapter still points to `ws://localhost:4002`.
- Result: local live mode can work, but deployed live mode is still not production-ready.

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

### 4. Gemini extraction is real, but Gemini TTS / interruption is still open

- Gemini extraction path exists on the agent for live chunks when configured.
- The remaining Gemini work is TTS / interruption, not Gemini Live STT.
- No one-shot spoken interruption UX is finished yet.

### 5. Local dev and deployed web are not using one URL helper yet

- deployed builds are correct and point to the Cloud Run agent
- local code still has duplicated fallback logic outside `agent-client.ts`
- if replay starts calling `localhost:4000`, local dev is using stale or duplicated config, not the deployed bundle

### 6. GitHub issue tracker does not match the current architecture

- Open issues [#8](https://github.com/HydroAcrid/columbia-hack-2026/issues/8) and [#10](https://github.com/HydroAcrid/columbia-hack-2026/issues/10) still matter.
- Closed issue [#6](https://github.com/HydroAcrid/columbia-hack-2026/issues/6) assumed Gemini Live STT and should be treated as superseded.
- Closed issue [#7](https://github.com/HydroAcrid/columbia-hack-2026/issues/7) maps to the shared live transcript pipeline, but the actual live adapter in use is Deepgram.
- Missing issues still need to be created for deployed Deepgram STT transport, unified URL plumbing, and browser smoke-test coverage.

## What still needs to be completed

### Current status by area

- Gemini extraction: done
- Deepgram STT local path: done
- Deepgram STT deployed path: not done
- Gemini TTS interruption path: not done
- Unified URL plumbing for web replay/live: not done
- Demo runbook / rehearsal checklist: not done
- Tracker accuracy: not done

### Highest priority next work

1. Fix deployed live STT transport so the browser no longer depends on `ws://localhost:4002`.
2. Clean the web agent URL plumbing so replay/live/local/deployed use one source of truth.
3. Add the demo runbook and fallback checklist in issue [#10](https://github.com/HydroAcrid/columbia-hack-2026/issues/10).
4. Re-scope issue [#8](https://github.com/HydroAcrid/columbia-hack-2026/issues/8) to Gemini TTS / interruption.
5. Add browser smoke tests for deployed replay and live fallback behavior.

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
AGENT_URL="$(gcloud run services describe launch-copilot-agent --project=hackathon-test-key --region=us-central1 --format='value(status.url)')"
curl -sS "${AGENT_URL}/health"
```

### Create a session

```bash
AGENT_URL="$(gcloud run services describe launch-copilot-agent --project=hackathon-test-key --region=us-central1 --format='value(status.url)')"
curl -sS -X POST "${AGENT_URL}/sessions"
```

### Deploy web

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.web.yaml .
```

### Deploy agent

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.agent.yaml .
```

### List continuous deploy triggers

```bash
gcloud builds triggers list --region=us-central1
```

## Recommended first move after opening the laptop again

1. Read this file.
2. Check the current Cloud Run service URLs in `hackathon-test-key`.
3. Verify `/health` reports Gemini extraction in `hybrid` mode.
4. Open `apps/web/app/page.tsx` and `apps/web/lib/useLiveTranscript.ts`.
5. Remove the stray `localhost:4000` fallback duplication.
6. Run an actual browser replay test before touching more product features.
