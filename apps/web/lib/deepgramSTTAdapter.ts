import type { TranscriptChunk } from "@copilot/shared";
import type { TranscriptSource } from "./transcriptSource";
import { getAgentBaseUrl } from "./agent-client";

export class DeepgramSTTAdapter implements TranscriptSource {
  private readonly flushDelayMs = 850;
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkSequence = 0;
  private startTime = 0;
  private pendingSegment: {
    speaker: string;
    text: string;
    timestamp: number;
  } | null = null;
  private onChunk: ((chunk: TranscriptChunk) => void) | null = null;

  constructor(private readonly sessionId: string) { }

  async start(onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    this.startTime = Date.now();
    this.chunkSequence = 0;
    this.pendingSegment = null;
    this.onChunk = onChunk;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(getSttWebSocketUrl());

      this.ws.onopen = async () => {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.mediaRecorder = new MediaRecorder(this.stream);

          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(event.data);
            }
          };

          this.mediaRecorder.start(250); // Send chunks every 250ms
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.text) {
            this.handleStableText(data.speaker || "Speaker 1", data.text);
          }
        } catch (err) {
          console.error("[DeepgramSTTAdapter] Failed to parse chunk", err);
        }
      };

      this.ws.onerror = (err) => {
        console.error("[DeepgramSTTAdapter] WebSocket error", err);
        reject(err);
      };

      this.ws.onclose = () => {
        this.stop();
      };
    });
  }

  async stop(): Promise<void> {
    this.flushPendingSegment();

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

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingSegment = null;
    this.onChunk = null;
  }

  private handleStableText(speaker: string, rawText: string) {
    const text = normalizeTranscriptText(rawText);
    if (!text) {
      return;
    }

    const timestamp = (Date.now() - this.startTime) / 1000;
    const pending = this.pendingSegment;

    if (!pending) {
      this.pendingSegment = { speaker, text, timestamp };
      this.scheduleFlush();
      return;
    }

    if (pending.speaker !== speaker) {
      this.flushPendingSegment();
      this.pendingSegment = { speaker, text, timestamp };
      this.scheduleFlush();
      return;
    }

    pending.text = mergeTranscriptText(pending.text, text);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flushPendingSegment();
    }, this.flushDelayMs);
  }

  private flushPendingSegment() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.pendingSegment || !this.onChunk) {
      return;
    }

    const chunkId = `live-${this.sessionId}-${this.chunkSequence.toString().padStart(4, "0")}`;
    this.chunkSequence += 1;
    const chunk: TranscriptChunk = {
      id: chunkId,
      speaker: this.pendingSegment.speaker,
      text: this.pendingSegment.text,
      timestamp: this.pendingSegment.timestamp,
    };

    this.pendingSegment = null;
    this.onChunk(chunk);
  }
}

function normalizeTranscriptText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function mergeTranscriptText(existing: string, incoming: string) {
  if (!existing) {
    return incoming;
  }

  if (!incoming || existing === incoming) {
    return existing;
  }

  if (incoming.startsWith(existing)) {
    return incoming;
  }

  if (existing.endsWith(incoming)) {
    return existing;
  }

  const existingWords = existing.split(/\s+/);
  const incomingWords = incoming.split(/\s+/);
  const maxOverlap = Math.min(existingWords.length, incomingWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const existingSuffix = existingWords.slice(-overlap).join(" ").toLowerCase();
    const incomingPrefix = incomingWords.slice(0, overlap).join(" ").toLowerCase();
    if (existingSuffix === incomingPrefix) {
      return [...existingWords, ...incomingWords.slice(overlap)].join(" ");
    }
  }

  return `${existing} ${incoming}`.replace(/\s+/g, " ").trim();
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
