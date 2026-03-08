import { Firestore } from "@google-cloud/firestore";
import { GraphPatchEvent, SessionState } from "@copilot/shared";

import type { AgentConfig } from "./config.js";

export interface SessionEvent {
  id: string;
  patch: GraphPatchEvent;
}

export interface StoredSession {
  state: SessionState;
  nextEventId: number;
}

export interface SessionStore {
  createSession(id: string): Promise<StoredSession>;
  getSession(id: string): Promise<StoredSession | null>;
  saveSession(session: StoredSession): Promise<void>;
  appendEvent(sessionId: string, event: SessionEvent): Promise<void>;
  listEventsAfter(
    sessionId: string,
    lastEventId: number,
    beforeEventId?: number,
  ): Promise<SessionEvent[]>;
}

const SESSIONS_COLLECTION = "launchCopilotSessions";
const EVENTS_SUBCOLLECTION = "events";

export function createSessionStore(config: AgentConfig): SessionStore {
  if (config.sessionStoreBackend === "firestore") {
    return new FirestoreSessionStore(
      new Firestore({
        projectId: config.googleCloudProject ?? undefined,
        databaseId: config.firestoreDatabaseId ?? undefined,
      }),
    );
  }

  return new InMemorySessionStore();
}

export function createEmptyStoredSession(id: string): StoredSession {
  return {
    state: {
      id,
      transcript: [],
      nodes: [],
      edges: [],
      decisions: [],
      actions: [],
      issues: [],
      speakerProfiles: [],
    },
    nextEventId: 1,
  };
}

class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly events = new Map<string, SessionEvent[]>();

  async createSession(id: string) {
    const session = createEmptyStoredSession(id);
    this.sessions.set(id, cloneStoredSession(session));
    this.events.set(id, []);
    return cloneStoredSession(session);
  }

  async getSession(id: string) {
    const session = this.sessions.get(id);
    return session ? cloneStoredSession(session) : null;
  }

  async saveSession(session: StoredSession) {
    this.sessions.set(session.state.id, cloneStoredSession(session));
  }

  async appendEvent(sessionId: string, event: SessionEvent) {
    const events = this.events.get(sessionId) ?? [];
    events.push(cloneSessionEvent(event));
    this.events.set(sessionId, events);
  }

  async listEventsAfter(sessionId: string, lastEventId: number, beforeEventId = Number.POSITIVE_INFINITY) {
    const events = this.events.get(sessionId) ?? [];
    return events
      .filter((event) => {
        const sequence = parseSequence(event.id);
        return sequence !== null && sequence > lastEventId && sequence < beforeEventId;
      })
      .map(cloneSessionEvent);
  }
}

class FirestoreSessionStore implements SessionStore {
  constructor(private readonly db: Firestore) {}

  async createSession(id: string) {
    const session = createEmptyStoredSession(id);
    await this.sessionRef(id).set(serializeSession(session), { merge: false });
    return session;
  }

  async getSession(id: string) {
    const snapshot = await this.sessionRef(id).get();
    if (!snapshot.exists) {
      return null;
    }

    return deserializeSession(snapshot.data());
  }

  async saveSession(session: StoredSession) {
    await this.sessionRef(session.state.id).set(serializeSession(session), { merge: true });
  }

  async appendEvent(sessionId: string, event: SessionEvent) {
    const sequence = parseSequence(event.id);
    if (sequence === null) {
      throw new Error(`Invalid event id "${event.id}"`);
    }

    await this.eventsRef(sessionId).doc(event.id).set({
      id: event.id,
      sequence,
      patch: event.patch,
      createdAt: Date.now(),
    });
  }

  async listEventsAfter(sessionId: string, lastEventId: number, beforeEventId = Number.POSITIVE_INFINITY) {
    let query = this.eventsRef(sessionId)
      .where("sequence", ">", lastEventId)
      .orderBy("sequence", "asc");

    if (Number.isFinite(beforeEventId)) {
      query = query.where("sequence", "<", beforeEventId);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => deserializeEvent(doc.data()));
  }

  private sessionRef(sessionId: string) {
    return this.db.collection(SESSIONS_COLLECTION).doc(sessionId);
  }

  private eventsRef(sessionId: string) {
    return this.sessionRef(sessionId).collection(EVENTS_SUBCOLLECTION);
  }
}

function serializeSession(session: StoredSession) {
  return {
    state: session.state,
    nextEventId: session.nextEventId,
    updatedAt: Date.now(),
  };
}

function deserializeSession(raw: unknown): StoredSession {
  const record = raw as {
    state?: unknown;
    nextEventId?: unknown;
  };

  return {
    state: SessionState.parse(record.state),
    nextEventId: parseNextEventId(record.nextEventId),
  };
}

function deserializeEvent(raw: unknown): SessionEvent {
  const record = raw as {
    id?: unknown;
    patch?: unknown;
  };

  return {
    id: String(record.id),
    patch: GraphPatchEvent.parse(record.patch),
  };
}

function parseNextEventId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function parseSequence(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function cloneStoredSession(session: StoredSession): StoredSession {
  return {
    state: structuredClone(session.state),
    nextEventId: session.nextEventId,
  };
}

function cloneSessionEvent(event: SessionEvent): SessionEvent {
  return {
    id: event.id,
    patch: structuredClone(event.patch),
  };
}
