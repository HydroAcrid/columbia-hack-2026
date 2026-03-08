import type { TranscriptChunk } from "@copilot/shared";
import type { TranscriptSource } from "./transcriptSource";
import { getAgentBaseUrl } from "./agent-client";

export class DeepgramSTTAdapter implements TranscriptSource {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkSequence = 0;
  private startTime = 0;

  constructor(private readonly sessionId: string) { }

  async start(onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    this.startTime = Date.now();
    this.chunkSequence = 0;

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
            const chunkId = `live-${this.sessionId}-${this.chunkSequence.toString().padStart(4, "0")}`;
            this.chunkSequence++;

            const chunk: TranscriptChunk = {
              id: chunkId,
              speaker: data.speaker || "Speaker 1",
              text: data.text,
              timestamp: (Date.now() - this.startTime) / 1000,
            };

            onChunk(chunk);
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
  }
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
