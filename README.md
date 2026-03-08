# Cricket

Hackathon project for a launch-planning meeting copilot with:

- live or replayed transcript ingestion
- graph updates over SSE
- decisions, actions, and issues extraction
- Cloud Run deployment for both web and agent

## Architecture

- Deepgram handles live speech-to-text because speaker separation matters in real conversation.
- Gemini handles structured extraction on the agent from replay and live transcript chunks.
- Gemini-backed TTS / interruption is still planned, but Gemini Live is no longer the STT target.
- Live STT now connects to the agent service at `/stt`, so the same path works locally and on deployed Cloud Run.

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

Pushes to `main` will auto-deploy once the new project triggers are created.

Expected triggers:

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

Current status:

- the Developer Connect / Cloud Build GitHub connection has been created in `hackathon-test-key`
- GitHub OAuth / app authorization still has to be completed once in the Google Cloud console before triggers can be created
- current trigger list in `hackathon-test-key` is empty until that OAuth step is finished

Important: trigger creation required the 2nd-gen repository trigger path and an explicit service account:

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
pnpm --filter @copilot/web dev
```

## Remaining work

- Gemini extraction: done
- Deepgram STT local path: done
- Deepgram STT deployed path: not done
- Gemini TTS interruption path: not done
- Unified URL plumbing for web replay/live: not done
- Demo runbook / rehearsal checklist: not done
- Tracker accuracy: not done

## Demo runbook

1. Open `https://launch-copilot-web-fh43iudbha-uc.a.run.app`
2. Confirm the agent health endpoint returns hybrid extraction:
   `curl -sS https://launch-copilot-agent-fh43iudbha-uc.a.run.app/health`
3. Use replay mode as the primary demo path.
4. If live mode fails, verify the agent service is reachable and the browser can connect to the agent `/stt` websocket path.
5. If the web deploy looks stale, redeploy with `gcloud builds submit --config cloudbuild.web.yaml .` after confirming the agent service URL is still current.

## GitHub tracker notes

- Open issues that still matter:
  - [#8](https://github.com/HydroAcrid/columbia-hack-2026/issues/8) should be treated as Gemini TTS / interruption work, not Gemini Live STT
  - [#10](https://github.com/HydroAcrid/columbia-hack-2026/issues/10) should remain the demo runbook / fallback checklist
- Closed issues that no longer match the product direction:
  - [#6](https://github.com/HydroAcrid/columbia-hack-2026/issues/6) assumed Gemini Live STT and should be considered superseded by the Deepgram STT decision
  - [#7](https://github.com/HydroAcrid/columbia-hack-2026/issues/7) is effectively implemented via the shared live pipeline, but the live adapter in use is Deepgram, not Gemini Live
- Missing issues worth adding:
  - harden deployed live STT transport and rehearse it end-to-end on the Cloud Run stack
  - centralize web agent URL plumbing for replay/live/local/deployed
  - add a browser smoke-test matrix for deployed replay and live fallback behavior
- Tracker cleanup still requires manual GitHub edits once the team is ready to re-scope issue text and labels.

## Useful docs

- [Laptop handoff](./LAPTOP_HANDOFF.md)
- [Google Cloud notes](./docs/google-cloud.md)
- [Build phases](./PHASES.md)
