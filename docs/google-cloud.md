# Google Cloud setup

This repo is prepared for a split deployment:

- `apps/web` deploys to Cloud Run
- `apps/agent` deploys to Cloud Run
- Firestore stores session state and ordered SSE event history when `SESSION_STORE_BACKEND=firestore`
- Active target project: `hackathon-test-key`

## Runtime architecture

- Deepgram is the live speech-to-text provider because speaker diarization is required.
- Gemini is used for structured extraction on the agent.
- Gemini TTS / interruption remains planned.
- Gemini Live STT is no longer the target implementation.
- Live STT now goes through the agent service websocket path at `/stt`, so local and deployed mode use the same routing shape.

## Web deploy

Build and deploy the web app with Cloud Build:

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.web.yaml
```

The web build now resolves the `launch-copilot-agent` Cloud Run URL from the active project and bakes that into the client bundle as `NEXT_PUBLIC_AGENT_URL`.

## Agent deploy

Build and deploy the agent with Cloud Build:

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.agent.yaml
```

The Cloud Build config deploys a public Cloud Run service and wires:

- `SESSION_STORE_BACKEND`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_REGION`
- `VERTEX_LOCATION`
- `VERTEX_MODEL`
- `VERTEX_LIVE_MODEL`
- `LIVE_BATCH_IDLE_MS`
- `LIVE_BATCH_MAX_MS`
- `LIVE_MIN_MEANINGFUL_WORDS`
- `LIVE_CONTEXT_TRANSCRIPT_LINES`
- `LIVE_CONTEXT_NODE_LIMIT`
- `LIVE_CONTEXT_EDGE_LIMIT`
- `GEMINI_API_KEY` from Secret Manager secret `gemini-api-key`
- `DEEPGRAM_API_KEY` from Secret Manager secret `deepgram-api-key`

If you want Firestore persistence in Cloud Run, leave `_SESSION_STORE_BACKEND=firestore`.
For a local or temporary deployment, switch it to `memory`.

## Firestore layout

The agent uses:

- `launchCopilotSessions/{sessionId}`
- `launchCopilotSessions/{sessionId}/events/{eventId}`

Each session document stores the current `SessionState` plus `nextEventId`.
Each event document stores the `GraphPatchEvent` and integer event sequence for SSE replay.

## Local development

Memory-backed local dev:

```bash
pnpm --filter @copilot/shared build
pnpm --filter @copilot/graph build
pnpm --filter @copilot/agent dev
pnpm --filter @copilot/web dev
```

Firestore-backed local dev:

```bash
export SESSION_STORE_BACKEND=firestore
export GOOGLE_CLOUD_PROJECT=your-gcp-project-id
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
firebase emulators:start --only firestore
pnpm --filter @copilot/agent dev
```

## Vertex/Gemini notes

The agent now reads model configuration from env and Secret Manager:

- `GEMINI_API_KEY`
- `VERTEX_MODEL`
  Default live extraction model in this repo: `gemini-2.5-flash`
- `VERTEX_LIVE_MODEL`
- `LIVE_BATCH_IDLE_MS`
- `LIVE_BATCH_MAX_MS`
- `LIVE_MIN_MEANINGFUL_WORDS`
- `LIVE_CONTEXT_TRANSCRIPT_LINES`
- `LIVE_CONTEXT_NODE_LIMIT`
- `LIVE_CONTEXT_EDGE_LIMIT`
- `GOOGLE_APPLICATION_CREDENTIALS` if you are not using ambient credentials

Get the current Cloud Run URLs in the new project with:

```bash
gcloud run services list --project=hackathon-test-key --region=us-central1
```

## Remaining work

- Gemini extraction: done
- Deepgram STT local path: done
- Deepgram STT deployed path: not done
- Gemini TTS interruption path: not done
- Unified URL plumbing for web replay/live: not done
