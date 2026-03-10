import type { TranscriptChunk } from "@copilot/shared";
import type {
  TranscriptSource,
  TranscriptSourceStatus,
} from "./transcriptSource";
import { getAgentBaseUrl } from "./agent-client";

export class DeepgramSTTAdapter implements TranscriptSource {
  private static readonly RECONNECT_BASE_DELAY_MS = 600;
  private static readonly RECONNECT_MAX_DELAY_MS = 5000;
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkSequence = 0;
  private startTime = 0;
  private sessionId: string;
  private onChunk: ((chunk: TranscriptChunk) => void) | null = null;
  private isActive = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly statusListeners = new Set<(status: TranscriptSourceStatus) => void>();
  private status: TranscriptSourceStatus = {
    state: "idle",
    changedAt: Date.now(),
    reconnectAttempt: 0,
    detail: null,
  };

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  subscribeStatus(listener: (status: TranscriptSourceStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async start(onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    if (this.isActive) {
      this.onChunk = onChunk;
      return;
    }

    this.isActive = true;
    this.startTime = Date.now();
    this.chunkSequence = 0;
    this.reconnectAttempt = 0;
    this.onChunk = onChunk;
    this.clearReconnectTimer();

    try {
      await this.ensureMediaCapture();
      const ws = await this.openSocket("connecting", null);
      this.attachSocket(ws);
      this.ensureRecorderStarted();
    } catch (error) {
      this.updateStatus("error", error instanceof Error ? error.message : "Failed to start live transcription.");
      this.isActive = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isActive = false;
    this.clearReconnectTimer();

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.onChunk = null;
    this.updateStatus("idle", null);
  }

  private handleChunk(data: Partial<TranscriptChunk>) {
    const text = normalizeTranscriptText(data.text ?? "");
    if (!text || !this.onChunk) {
      return;
    }

    const chunkId = `live-${this.sessionId}-${this.chunkSequence.toString().padStart(4, "0")}`;
    this.chunkSequence += 1;
    const chunk: TranscriptChunk = {
      id: chunkId,
      speaker: data.speaker ?? "Speaker unknown",
      text,
      timestamp: data.timestamp ?? data.start ?? (Date.now() - this.startTime) / 1000,
      start: data.start,
      end: data.end,
      words: data.words,
    };

    this.onChunk(chunk);
  }

  private async ensureMediaCapture() {
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (!this.mediaRecorder) {
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(event.data);
        }
      };
    }
  }

  private ensureRecorderStarted() {
    if (this.mediaRecorder && this.mediaRecorder.state === "inactive") {
      this.mediaRecorder.start(250);
    }
  }

  private openSocket(
    state: TranscriptSourceStatus["state"],
    detail: string | null,
  ) {
    this.updateStatus(state, detail);

    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(getSttWebSocketUrl());
      let settled = false;

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(ws);
      };

      const rejectOnce = (message: string) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new Error(message));
      };

      ws.onopen = () => {
        resolveOnce();
      };

      ws.onerror = () => {
        rejectOnce("Unable to connect to the live transcript stream.");
      };

      ws.onclose = () => {
        rejectOnce("Live transcript stream closed before it was ready.");
      };
    });
  }

  private attachSocket(ws: WebSocket) {
    this.ws = ws;
    this.reconnectAttempt = 0;
    this.updateStatus("connected", null);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          this.handleChunk(data);
        }
      } catch (err) {
        console.error("[DeepgramSTTAdapter] Failed to parse chunk", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[DeepgramSTTAdapter] WebSocket error", err);
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
      }

      if (!this.isActive) {
        this.updateStatus("idle", null);
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.isActive || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempt += 1;
    const delay = Math.min(
      DeepgramSTTAdapter.RECONNECT_MAX_DELAY_MS,
      DeepgramSTTAdapter.RECONNECT_BASE_DELAY_MS * (2 ** (this.reconnectAttempt - 1)),
    );

    this.updateStatus(
      "recovering",
      `Reconnecting live transcript stream (attempt ${this.reconnectAttempt})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async reconnect() {
    if (!this.isActive) {
      return;
    }

    try {
      const ws = await this.openSocket(
        "recovering",
        `Reconnecting live transcript stream (attempt ${this.reconnectAttempt})`,
      );
      if (!this.isActive) {
        ws.close();
        return;
      }

      this.attachSocket(ws);
      this.ensureRecorderStarted();
    } catch (error) {
      console.error("[DeepgramSTTAdapter] Reconnect failed", error);
      this.scheduleReconnect();
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateStatus(
    state: TranscriptSourceStatus["state"],
    detail: string | null,
  ) {
    this.status = {
      state,
      detail,
      reconnectAttempt: this.reconnectAttempt,
      changedAt: Date.now(),
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }
}

function normalizeTranscriptText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getSttWebSocketUrl() {
  const override = process.env.NEXT_PUBLIC_STT_WS_URL;
  if (override) {
    return override;
  }

  const agentUrl = new URL(getAgentBaseUrl());
  agentUrl.protocol = agentUrl.protocol === "https:" ? "wss:" : "ws:";
  agentUrl.pathname = "/stt";
  agentUrl.search = "";
  agentUrl.hash = "";
  return agentUrl.toString();
}
