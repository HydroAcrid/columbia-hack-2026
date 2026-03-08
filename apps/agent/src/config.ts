export type SessionStoreBackend = "memory" | "firestore";

export interface VertexConfig {
  enabled: boolean;
  projectId: string | null;
  region: string;
  location: string;
  model: string | null;
  liveModel: string | null;
  credentialsPath: string | null;
}

export interface LiveExtractionConfig {
  batchIdleMs: number;
  batchMaxMs: number;
  minMeaningfulWords: number;
  contextTranscriptLines: number;
  contextNodeLimit: number;
  contextEdgeLimit: number;
}

export interface AgentConfig {
  port: number;
  sessionStoreBackend: SessionStoreBackend;
  googleCloudProject: string | null;
  googleCloudRegion: string;
  firestoreDatabaseId: string | null;
  vertex: VertexConfig;
  liveExtraction: LiveExtractionConfig;
}

export function readAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const googleCloudProject = readOptional(env.GOOGLE_CLOUD_PROJECT);
  const googleCloudRegion = readOptional(env.GOOGLE_CLOUD_REGION) ?? "us-central1";
  const vertexLocation = readOptional(env.VERTEX_LOCATION) ?? googleCloudRegion;
  const vertexModel = readOptional(env.VERTEX_MODEL);
  const vertexLiveModel = readOptional(env.VERTEX_LIVE_MODEL);
  const credentialsPath = readOptional(env.GOOGLE_APPLICATION_CREDENTIALS);
  const configuredBackend = env.SESSION_STORE_BACKEND;
  const sessionStoreBackend = configuredBackend === "firestore" ? "firestore" : "memory";
  const batchIdleMs = readPositiveInt(env.LIVE_BATCH_IDLE_MS, 750);
  const batchMaxMs = Math.max(readPositiveInt(env.LIVE_BATCH_MAX_MS, 1200), batchIdleMs);

  return {
    port: readPort(env.PORT),
    sessionStoreBackend,
    googleCloudProject,
    googleCloudRegion,
    firestoreDatabaseId: readOptional(env.FIRESTORE_DATABASE_ID),
    vertex: {
      enabled: Boolean(googleCloudProject && (vertexModel || vertexLiveModel)),
      projectId: googleCloudProject,
      region: googleCloudRegion,
      location: vertexLocation,
      model: vertexModel,
      liveModel: vertexLiveModel,
      credentialsPath,
    },
    liveExtraction: {
      batchIdleMs,
      batchMaxMs,
      minMeaningfulWords: readPositiveInt(env.LIVE_MIN_MEANINGFUL_WORDS, 4),
      contextTranscriptLines: readPositiveInt(env.LIVE_CONTEXT_TRANSCRIPT_LINES, 2),
      contextNodeLimit: readPositiveInt(env.LIVE_CONTEXT_NODE_LIMIT, 8),
      contextEdgeLimit: readPositiveInt(env.LIVE_CONTEXT_EDGE_LIMIT, 6),
    },
  };
}

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readPort(value: string | undefined) {
  const parsed = Number(value ?? 4000);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4000;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
