import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { WebSocketServer } from "ws";

export function startSttServer() {
  const port = process.env.STT_PORT ? parseInt(process.env.STT_PORT, 10) : 4002;
  const wss = new WebSocketServer({ port });

  console.log(`STT WebSocket proxy listening on ws://localhost:${port}`);

  wss.on("connection", (ws) => {
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
