import type { IncomingMessage } from "node:http";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { WebSocket, WebSocketServer } from "ws";

type UpgradeCapableServer = {
  on(event: "upgrade", listener: (request: IncomingMessage, socket: any, head: Buffer) => void): unknown;
};

export function attachSttServer(server: UpgradeCapableServer) {
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

    try {
      dgConnection = deepgram.listen.live({
        model: "nova-3",
        language: "en",
        smart_format: true,
        diarize: true,
        punctuate: true,
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
        if (data.channel?.alternatives?.[0]) {
          const transcript = data.channel.alternatives[0].transcript;
          const words = data.channel.alternatives[0].words;
          
          if (words && words.length > 0) {
            const speakers = new Set(words.map((w: any) => w.speaker).filter((s: any) => s !== undefined));
            const speaker = speakers.size > 1 ? `${words[0]?.speaker}+` : words[0]?.speaker;
            
            if (transcript) {
              ws.send(
                JSON.stringify({
                  text: transcript,
                  speaker: `Speaker ${speaker}`,
                })
              );
            }
          }
        }
      });

      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log("[STT] Connection closed.");
        ws.close();
      });

      dgConnection.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error("[STT] Deepgram error:", err);
      });

    } catch (err) {
      console.error("[STT] Failed to start Deepgram stream:", err);
      ws.close();
    }
  });
}
