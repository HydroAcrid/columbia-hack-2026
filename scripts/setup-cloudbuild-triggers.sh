#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-hackathon-test-key}"
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
REGION="${REGION:-us-central1}"
CONNECTION_NAME="${CONNECTION_NAME:-hydroacrid-github}"
REPOSITORY_NAME="${REPOSITORY_NAME:-columbia-hack-2026}"
REMOTE_URI="${REMOTE_URI:-https://github.com/HydroAcrid/columbia-hack-2026.git}"
WEB_TRIGGER_NAME="${WEB_TRIGGER_NAME:-deploy-web-main}"
AGENT_TRIGGER_NAME="${AGENT_TRIGGER_NAME:-deploy-agent-main}"
AGENT_SERVICE_NAME="${AGENT_SERVICE_NAME:-launch-copilot-agent}"
AR_REPOSITORY="${AR_REPOSITORY:-launch-copilot}"
TRIGGER_SERVICE_ACCOUNT="${TRIGGER_SERVICE_ACCOUNT:-}"
VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-flash}"
VERTEX_LIVE_MODEL="${VERTEX_LIVE_MODEL:-gemini-live-2.5-flash-preview}"
LIVE_BATCH_IDLE_MS="${LIVE_BATCH_IDLE_MS:-750}"
LIVE_BATCH_MAX_MS="${LIVE_BATCH_MAX_MS:-1200}"
LIVE_MIN_MEANINGFUL_WORDS="${LIVE_MIN_MEANINGFUL_WORDS:-4}"
LIVE_CONTEXT_TRANSCRIPT_LINES="${LIVE_CONTEXT_TRANSCRIPT_LINES:-4}"
LIVE_CONTEXT_NODE_LIMIT="${LIVE_CONTEXT_NODE_LIMIT:-8}"
LIVE_CONTEXT_EDGE_LIMIT="${LIVE_CONTEXT_EDGE_LIMIT:-6}"

CONNECTION_RESOURCE="projects/${PROJECT_ID}/locations/${REGION}/connections/${CONNECTION_NAME}"
REPOSITORY_RESOURCE="${CONNECTION_RESOURCE}/repositories/${REPOSITORY_NAME}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd gcloud

gcloud config set project "${PROJECT_ID}" >/dev/null

if [[ -z "${PROJECT_NUMBER}" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
fi

if [[ -z "${TRIGGER_SERVICE_ACCOUNT}" ]]; then
  TRIGGER_SERVICE_ACCOUNT="projects/${PROJECT_ID}/serviceAccounts/${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

ensure_secret_manager_permissions() {
  gcloud services enable secretmanager.googleapis.com >/dev/null

  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
    --role="roles/secretmanager.admin" \
    >/dev/null
}

ensure_connection() {
  if gcloud builds connections describe "${CONNECTION_NAME}" --region="${REGION}" >/dev/null 2>&1; then
    return
  fi

  gcloud builds connections create github "${CONNECTION_NAME}" --region="${REGION}"
}

check_connection_state() {
  local stage
  stage="$(gcloud builds connections describe "${CONNECTION_NAME}" --region="${REGION}" --format='value(installationState.stage)')"

  if [[ "${stage}" != "COMPLETE" ]]; then
    local action_uri message
    action_uri="$(gcloud builds connections describe "${CONNECTION_NAME}" --region="${REGION}" --format='value(installationState.actionUri)')"
    message="$(gcloud builds connections describe "${CONNECTION_NAME}" --region="${REGION}" --format='value(installationState.message)')"

    cat <<EOF
Cloud Build GitHub connection is not ready yet.
Stage: ${stage}
Message: ${message}
Action URL:
${action_uri}

Open that URL, complete the GitHub authorization/install flow, then rerun:
  $(basename "$0")
EOF
    exit 1
  fi
}

ensure_repository() {
  if gcloud builds repositories describe "${REPOSITORY_NAME}" --connection="${CONNECTION_NAME}" --region="${REGION}" >/dev/null 2>&1; then
    return
  fi

  gcloud builds repositories create "${REPOSITORY_NAME}" \
    --connection="${CONNECTION_NAME}" \
    --region="${REGION}" \
    --remote-uri="${REMOTE_URI}"
}

ensure_trigger() {
  local name="$1"
  local config="$2"
  local description="$3"
  local included_files="$4"
  local substitutions="$5"

  if gcloud builds triggers list --region="${REGION}" --format='value(name)' | grep -Fxq "${name}"; then
    echo "Trigger already exists: ${name}"
    return
  fi

  gcloud alpha builds triggers create repository \
    --region="${REGION}" \
    --name="${name}" \
    --repository="${REPOSITORY_RESOURCE}" \
    --branch-pattern="^main$" \
    --build-config="${config}" \
    --description="${description}" \
    --included-files="${included_files}" \
    --service-account="${TRIGGER_SERVICE_ACCOUNT}" \
    --substitutions="${substitutions}"
}

ensure_secret_manager_permissions
ensure_connection
check_connection_state
ensure_repository

ensure_trigger \
  "${WEB_TRIGGER_NAME}" \
  "cloudbuild.web.yaml" \
  "Deploy web Cloud Run service on pushes to main" \
  "apps/web/**,packages/**,cloudbuild.web.yaml,pnpm-lock.yaml,pnpm-workspace.yaml,package.json" \
  "_SERVICE_NAME=launch-copilot-web,_AGENT_SERVICE_NAME=${AGENT_SERVICE_NAME},_REGION=${REGION},_AR_REPOSITORY=${AR_REPOSITORY},_IMAGE_TAG=latest"

ensure_trigger \
  "${AGENT_TRIGGER_NAME}" \
  "cloudbuild.agent.yaml" \
  "Deploy agent Cloud Run service on pushes to main" \
  "apps/agent/**,packages/**,cloudbuild.agent.yaml,pnpm-lock.yaml,pnpm-workspace.yaml,package.json,firestore.rules,firestore.indexes.json" \
  "_SERVICE_NAME=${AGENT_SERVICE_NAME},_REGION=${REGION},_AR_REPOSITORY=${AR_REPOSITORY},_IMAGE_TAG=latest,_GEMINI_SECRET_NAME=gemini-api-key,_DEEPGRAM_SECRET_NAME=deepgram-api-key,_SESSION_STORE_BACKEND=firestore,_VERTEX_LOCATION=${REGION},_VERTEX_MODEL=${VERTEX_MODEL},_VERTEX_LIVE_MODEL=${VERTEX_LIVE_MODEL},_LIVE_BATCH_IDLE_MS=${LIVE_BATCH_IDLE_MS},_LIVE_BATCH_MAX_MS=${LIVE_BATCH_MAX_MS},_LIVE_MIN_MEANINGFUL_WORDS=${LIVE_MIN_MEANINGFUL_WORDS},_LIVE_CONTEXT_TRANSCRIPT_LINES=${LIVE_CONTEXT_TRANSCRIPT_LINES},_LIVE_CONTEXT_NODE_LIMIT=${LIVE_CONTEXT_NODE_LIMIT},_LIVE_CONTEXT_EDGE_LIMIT=${LIVE_CONTEXT_EDGE_LIMIT}"

echo
echo "Cloud Build trigger setup complete."
echo "List triggers with:"
echo "  gcloud builds triggers list --region=${REGION}"
