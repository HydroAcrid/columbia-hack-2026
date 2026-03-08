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

export interface AgentConfig {
  port: number;
  sessionStoreBackend: SessionStoreBackend;
  googleCloudProject: string | null;
  googleCloudRegion: string;
  firestoreDatabaseId: string | null;
  vertex: VertexConfig;
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
