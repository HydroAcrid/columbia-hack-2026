import { GoogleGenAI, Modality } from "@google/genai";

// Models to try in order
const TTS_MODELS = [
  "gemini-2.5-flash-preview-native-audio-dialog",
  "gemini-2.0-flash-live-001",
];

/**
 * Speaks a text message using the Gemini Live API and returns PCM audio
 * as a base64-encoded string (24kHz, 16-bit, mono).
 */
export async function textToSpeechGeminiLive(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[TTS] No GEMINI_API_KEY set");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  for (const model of TTS_MODELS) {
    try {
      console.log(`[TTS] Trying model: ${model}`);
      const result = await attemptLiveTTS(ai, model, text);
      if (result) return result;
    } catch (err: any) {
      console.warn(`[TTS] Model ${model} failed:`, err?.message ?? err);
    }
  }

  console.error("[TTS] All TTS models failed");
  return null;
}

async function attemptLiveTTS(
  ai: GoogleGenAI,
  model: string,
  text: string,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const audioChunks: string[] = [];
    let resolved = false;
    let sessionRef: { sendClientContent(payload: unknown): void } | null = null;

    const done = (result: string | null) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      console.warn(`[TTS] Timed out on model ${model} (got ${audioChunks.length} chunks so far)`);
      done(audioChunks.length > 0 ? audioChunks.join("") : null);
    }, 15000);

    ai.live
      .connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore",
              },
            },
          },
          systemInstruction:
            "You are Cricket, a helpful AI meeting assistant. Speak the following message aloud naturally and conversationally, as if speaking in a meeting. Keep it brief.",
        },
        callbacks: {
          onopen: () => {
            console.log(`[TTS] WebSocket open for ${model}`);
          },
          onmessage: (message: any) => {
            // Wait for setupComplete before sending content
            if (message.setupComplete) {
              console.log(`[TTS] Setup complete for ${model}, sending text...`);
              if (sessionRef) {
                sessionRef.sendClientContent({
                  turns: [
                    {
                      role: "user",
                      parts: [{ text }],
                    },
                  ],
                  turnComplete: true,
                });
              }
              return;
            }

            // Collect audio chunks
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  audioChunks.push(part.inlineData.data);
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              console.log(`[TTS] ✅ Turn complete — got ${audioChunks.length} audio chunks from ${model}`);
              done(audioChunks.length > 0 ? audioChunks.join("") : null);
            }
          },
          onerror: (e: any) => {
            console.error(`[TTS] Error from ${model}:`, e?.message ?? e);
            done(null);
          },
          onclose: () => {
            console.log(`[TTS] Connection closed for ${model} (${audioChunks.length} chunks collected)`);
            // Only resolve if we haven't already — give audio a chance to arrive
            if (!resolved && audioChunks.length > 0) {
              done(audioChunks.join(""));
            }
          },
        },
      })
      .then((session: { sendClientContent(payload: unknown): void }) => {
        sessionRef = session;
        console.log(`[TTS] Session established for ${model}, waiting for setupComplete...`);
      })
      .catch((err: unknown) => {
        console.error(`[TTS] Failed to connect to ${model}:`, err);
        done(null);
      });
  });
}
