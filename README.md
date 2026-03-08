# Nota

Hackathon project for a launch-planning meeting copilot with:

- live or replayed transcript ingestion
- graph updates over SSE
- decisions, actions, and issues extraction
- Cloud Run deployment for both web and agent

## Team

Team members and contributors:

- Kevin Dotel (`HydroAcrid`)
- Nelly Nguyen (`nellynguyen`)

## Architecture

- Deepgram handles live speech-to-text because speaker separation matters in real conversation.
- Gemini handles structured extraction on the agent from replay and live transcript chunks.
- Gemini-backed TTS / interruption is handled on the agent, with browser speech fallback if Gemini audio generation fails.
- Live STT now connects to the agent service at `/stt`, so the same path works locally and on deployed Cloud Run.

## Tech stack

- Web: Next.js 16, React 19, Tailwind CSS 4, React Flow (`@xyflow/react`)
- Agent: Hono on Node.js, WebSocket STT bridge, SSE for session events
- Speech-to-text: Deepgram via the agent `/stt` websocket
- GenAI:
  - `@google/generative-ai` for graph / insight extraction
  - `@google/genai` for Nota TTS audio generation
- Persistence: Firestore for session state and ordered event replay
- Hosting: Cloud Run, Cloud Build, Secret Manager, Artifact Registry

## Repo layout

- `apps/web` — Next.js frontend
- `apps/agent` — Hono/Node backend
- `packages/shared` — shared schemas and demo script
- `packages/graph` — graph merge and dedupe logic

## Target project

- Google Cloud project: `hackathon-test-key`
- Cloud Run service names: `launch-copilot-web`, `launch-copilot-agent`
- Read the current URLs from Cloud Run after deploy:
  `gcloud run services list --project=hackathon-test-key --region=us-central1`

## Demo URLs

- Web: `https://launch-copilot-web-fh43iudbha-uc.a.run.app`
- Agent: `https://launch-copilot-agent-fh43iudbha-uc.a.run.app`
- Agent health: `https://launch-copilot-agent-fh43iudbha-uc.a.run.app/health`

## Deployment

The project is deployed on Google Cloud:

- `apps/web` -> Cloud Run
- `apps/agent` -> Cloud Run
- Firestore -> session persistence and SSE event history
- Agent deploy mounts Secret Manager secrets `gemini-api-key` and `deepgram-api-key`
- Web build resolves the current agent Cloud Run URL dynamically at build time

### Continuous deploy

Pushes to `main` auto-deploy in `hackathon-test-key` via:

- `deploy-web-main`
- `deploy-agent-main`

Check them with:

```bash
gcloud builds triggers list --project=hackathon-test-key --region=us-central1
```

### Manual deploy fallback

Deploy web:

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.web.yaml .
```

Deploy agent:

```bash
gcloud config set project hackathon-test-key
gcloud builds submit --config cloudbuild.agent.yaml .
```

### Trigger setup

The trigger setup script is:

```bash
./scripts/setup-cloudbuild-triggers.sh
```

What it does:

- ensures Secret Manager permissions for the Cloud Build service agent
- uses the GitHub connection `hydroacrid-github`
- uses the 2nd-gen Cloud Build repository resource for this repo
- creates the `main` branch deploy triggers in `hackathon-test-key`
- resolves the current project number dynamically
- points the web build at the current project's agent service URL

Important: trigger creation used the 2nd-gen repository trigger path and an explicit service account:

- command family: `gcloud alpha builds triggers create repository`
- service account pattern: `projects/hackathon-test-key/serviceAccounts/<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`

## Local development

This repo uses `pnpm` via Corepack. On a clean machine, run `corepack enable` once first.

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm --filter @copilot/agent dev
corepack pnpm --filter @copilot/web dev
```

If you need the deployed agent in local web dev:

```bash
export NEXT_PUBLIC_AGENT_URL="$(gcloud run services describe launch-copilot-agent --project=hackathon-test-key --region=us-central1 --format='value(status.url)')"
corepack pnpm --filter @copilot/web dev
```

## Current status

- Gemini extraction: done
- Deepgram STT local path: done
- Deepgram STT deployed path: implemented via agent `/stt`
- Gemini TTS interruption path: implemented
- Continuous deploy to `hackathon-test-key`: active on pushes to `main`

## Demo caveats

- Rehearse the deployed live mic path once before demo time.
- If Gemini TTS is slow or blocked by browser audio permissions, the web client falls back to browser speech synthesis.
- Local web dev talks to `http://localhost:4000` by default; set `NEXT_PUBLIC_AGENT_URL` if you want local web to target the deployed agent.

## Demo runbook

1. Open `https://launch-copilot-web-fh43iudbha-uc.a.run.app`
2. Confirm the agent health endpoint returns hybrid extraction:
   `curl -sS https://launch-copilot-agent-fh43iudbha-uc.a.run.app/health`
3. Use live mode as the primary demo path if the mic and browser permissions are healthy; use replay as backup.
4. If live mode fails, verify the agent service is reachable and the browser can connect to the agent `/stt` websocket path.
5. If the web deploy looks stale, push to `main` or redeploy manually with `gcloud builds submit --config cloudbuild.web.yaml .`.
