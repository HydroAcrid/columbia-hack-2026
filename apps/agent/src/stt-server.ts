import type { IncomingMessage } from "node:http";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { WebSocket, WebSocketServer } from "ws";
import { LiveTranscriptSegmenter } from "./stt-segmentation.js";

type UpgradeCapableServer = {
  on(event: "upgrade", listener: (request: IncomingMessage, socket: any, head: Buffer) => void): unknown;
};

interface SttServerOptions {
  debug?: boolean;
}

export function attachSttServer(server: UpgradeCapableServer, options: SttServerOptions = {}) {
  const wss = new WebSocketServer({ noServer: true });

  console.log("STT WebSocket proxy attached at /stt");

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/stt") {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[STT] Browser connected");
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error("[STT] Error: DEEPGRAM_API_KEY is not set in .env.");
      ws.close();
      return;
    }

    let deepgram;
    try {
      deepgram = createClient(apiKey);
    } catch (e) {
      console.error("[STT] Error initializing Deepgram:", e);
      ws.close();
      return;
    }

    let dgConnection: any = null;
    const segmenter = new LiveTranscriptSegmenter({ debug: options.debug });

    try {
      dgConnection = deepgram.listen.live({
        model: "nova-3",
        language: "en",
        smart_format: true,
        diarize: true,
        punctuate: true,
        interim_results: true,
        vad_events: true,
        endpointing: 500,
        utterance_end_ms: 1000,
      });

      dgConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log("[STT] Deepgram connection open.");

        ws.on("message", (data) => {
          if (dgConnection.getReadyState() === 1 /* OPEN */) {
            dgConnection.send(data as Buffer);
          }
        });

        ws.on("close", () => {
          console.log("[STT] Browser disconnected");
          dgConnection.requestClose();
        });
      });

      dgConnection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const chunks = segmenter.handleTranscriptEvent(data);
        for (const chunk of chunks) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(chunk));
          }
        }
      });

      dgConnection.on("UtteranceEnd", () => {
        const chunks = segmenter.handleUtteranceEnd();
        for (const chunk of chunks) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(chunk));
          }
        }
      });

      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log("[STT] Connection closed.");
        for (const chunk of segmenter.flushPending("close")) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(chunk));
          }
        }
        ws.close();
      });

      dgConnection.on(LiveTranscriptionEvents.Error, (err: any) => {
        for (const chunk of segmenter.flushPending("error")) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(chunk));
          }
        }
        console.error("[STT] Deepgram error:", err);
      });

    } catch (err) {
      console.error("[STT] Failed to start Deepgram stream:", err);
      ws.close();
    }
  });
}
