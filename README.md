# Live Launch Meeting Copilot

Hackathon project for a launch-planning meeting copilot with:

- live or replayed transcript ingestion
- graph updates over SSE
- decisions, actions, and issues extraction
- Cloud Run deployment for both web and agent

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

## Deployment

The project is deployed on Google Cloud:

- `apps/web` -> Cloud Run
- `apps/agent` -> Cloud Run
- Firestore -> session persistence and SSE event history

### Continuous deploy

Pushes to `main` now trigger automatic Cloud Build deploys.

Active triggers:

- `deploy-web-main`
- `deploy-agent-main`

Check them with:

```bash
gcloud builds triggers list --region=us-central1
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

Important: trigger creation required the 2nd-gen repository trigger path and an explicit service account:

- command family: `gcloud alpha builds triggers create repository`
- service account pattern: `projects/hackathon-test-key/serviceAccounts/<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`

## Local development

```bash
pnpm install
pnpm build
pnpm --filter @copilot/agent dev
pnpm --filter @copilot/web dev
```

If you need the deployed agent in local web dev:

```bash
export NEXT_PUBLIC_AGENT_URL="$(gcloud run services describe launch-copilot-agent --project=hackathon-test-key --region=us-central1 --format='value(status.url)')"
pnpm --filter @copilot/web dev
```

## Known issues

- `PHASES.md` is stale relative to the current repo state.
- Local live-mode code still has duplicated `localhost:4000` fallbacks in:
  - `apps/web/app/page.tsx`
  - `apps/web/lib/useLiveTranscript.ts`
- Replay mock extraction only produces graph updates for canonical demo chunk ids like `t1`, `t2`, etc.

## Useful docs

- [Laptop handoff](./LAPTOP_HANDOFF.md)
- [Google Cloud notes](./docs/google-cloud.md)
- [Build phases](./PHASES.md)
