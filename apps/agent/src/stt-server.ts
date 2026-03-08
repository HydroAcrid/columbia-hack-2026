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
    let pendingUtterance: { speaker: string; text: string } | null = null;

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
        const alternative = data.channel?.alternatives?.[0];
        if (!alternative) {
          return;
        }

        const transcript = normalizeTranscriptText(alternative.transcript);
        const words = alternative.words;
        if (!transcript || !Array.isArray(words) || words.length === 0) {
          return;
        }

        const speakers = new Set(words.map((w: any) => w.speaker).filter((s: any) => s !== undefined));
        const speaker = `Speaker ${speakers.size > 1 ? `${words[0]?.speaker}+` : words[0]?.speaker}`;
        const isFinal = Boolean(data.is_final);
        const speechFinal = Boolean(data.speech_final);

        if (!isFinal) {
          return;
        }

        if (!pendingUtterance) {
          pendingUtterance = { speaker, text: transcript };
        } else if (pendingUtterance.speaker === speaker) {
          pendingUtterance.text = mergeTranscriptText(pendingUtterance.text, transcript);
        } else {
          ws.send(JSON.stringify(pendingUtterance));
          pendingUtterance = { speaker, text: transcript };
        }

        if (speechFinal && pendingUtterance) {
          ws.send(JSON.stringify(pendingUtterance));
          pendingUtterance = null;
        }
      });

      dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log("[STT] Connection closed.");
        if (pendingUtterance) {
          ws.send(JSON.stringify(pendingUtterance));
          pendingUtterance = null;
        }
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
