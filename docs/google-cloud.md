# Google Cloud setup

This repo is prepared for a split deployment:

- `apps/web` deploys to Cloud Run
- `apps/agent` deploys to Cloud Run
- Firestore stores session state and ordered SSE event history when `SESSION_STORE_BACKEND=firestore`
- Vertex/Gemini env wiring is present in the agent, but replay remains the active extraction path

## Web deploy

Build and deploy the web app with Cloud Build:

```bash
gcloud builds submit \
  --config cloudbuild.web.yaml \
  --substitutions=_SERVICE_NAME=launch-copilot-web,_REGION=us-central1,_AR_REPOSITORY=launch-copilot,_IMAGE_TAG=latest,_NEXT_PUBLIC_AGENT_URL=https://launch-copilot-agent-353476176382.us-central1.run.app
```

The web container builds the Next.js standalone output and bakes `NEXT_PUBLIC_AGENT_URL` into the client bundle at build time.

## Agent deploy

Build and deploy the agent with Cloud Build:

```bash
gcloud builds submit \
  --config cloudbuild.agent.yaml \
  --substitutions=_SERVICE_NAME=launch-copilot-agent,_REGION=us-central1,_AR_REPOSITORY=launch-copilot
```

The Cloud Build config deploys a public Cloud Run service and wires:

- `SESSION_STORE_BACKEND`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_REGION`
- `VERTEX_LOCATION`
- `VERTEX_MODEL`
- `VERTEX_LIVE_MODEL`

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

The agent now reads Vertex-related env vars so Nelly can target the same deployment shape later:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_REGION`
- `VERTEX_LOCATION`
- `VERTEX_MODEL`
- `VERTEX_LIVE_MODEL`
- `GOOGLE_APPLICATION_CREDENTIALS` if you are not using ambient credentials

These values are configuration only in the current phase. No live Gemini call path is active yet.
