import { GoogleGenAI, Modality } from "@google/genai";

const TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
] as const;

const DEFAULT_VOICE = "Kore";
const DEFAULT_TTS_CONFIG = {
  responseModalities: [Modality.AUDIO] as string[],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: DEFAULT_VOICE,
      },
    },
  },
};

let cachedAi: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

type TtsResult = {
  audioBase64: string;
  mimeType: string | null;
  sampleRate: number | null;
};

export async function textToSpeechGemini(text: string): Promise<TtsResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[TTS] No GEMINI_API_KEY set");
    return null;
  }

  const ai = getGeminiClient(apiKey);
  const prompt = buildTtsPrompt(text);

  for (const model of TTS_MODELS) {
    try {
      console.log(`[TTS] Trying model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: DEFAULT_TTS_CONFIG,
      });

      const audio = extractAudioFromTtsResponse(response);
      if (audio) {
        console.log(
          `[TTS] Generated audio with ${model} (${audio.mimeType ?? "unknown mime"}, rate=${audio.sampleRate ?? "unknown"})`,
        );
        return audio;
      }

      console.warn(`[TTS] Model ${model} returned no audio data`);
    } catch (err: any) {
      console.warn(`[TTS] Model ${model} failed:`, err?.message ?? err);
    }
  }

  console.error("[TTS] All TTS models failed");
  return null;
}

function getGeminiClient(apiKey: string) {
  if (cachedAi && cachedApiKey === apiKey) {
    return cachedAi;
  }

  cachedAi = new GoogleGenAI({ apiKey });
  cachedApiKey = apiKey;
  return cachedAi;
}

export function extractAudioFromTtsResponse(response: unknown): TtsResult | null {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> })
    ?.candidates;

  for (const candidate of candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const audioBase64 = part.inlineData?.data;
      if (!audioBase64) {
        continue;
      }

      const mimeType = part.inlineData?.mimeType ?? null;
      return {
        audioBase64,
        mimeType,
        sampleRate: parseSampleRate(mimeType),
      };
    }
  }

  return null;
}

export function parseSampleRate(mimeType: string | null | undefined): number | null {
  if (!mimeType) {
    return null;
  }

  const match = /rate=(\d+)/i.exec(mimeType);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

function buildTtsPrompt(text: string): string {
  return [
    "You are Cricket, an AI meeting assistant.",
    "Read the following reply aloud naturally and conversationally, as if speaking briefly in a meeting.",
    "Do not add any preamble, stage directions, or extra words.",
    `Reply: ${text}`,
  ].join("\n");
}
