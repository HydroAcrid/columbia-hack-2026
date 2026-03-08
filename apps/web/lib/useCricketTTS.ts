"use client";

import { useCallback, useRef, useState } from "react";
import { getAgentBaseUrl } from "./agent-client";

/**
 * useCricketTTS
 *
 * Calls POST /tts on the agent backend, which uses Gemini TTS
 * to generate speech audio (base64 PCM, 24kHz, 16-bit, mono).
 * Decodes and plays via AudioContext. Falls back to browser speechSynthesis.
 */
export function useCricketTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const isSpeakingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const finishSpeaking = useCallback(() => {
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setCurrentMessage(null);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (isSpeakingRef.current) {
      console.log("[CricketTTS] Already speaking, skipping");
      return;
    }

    console.log(`[CricketTTS] 🦗 Speaking: "${text}"`);
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setCurrentMessage(text);

    try {
      const agentUrl = getAgentBaseUrl();
      const res = await fetch(`${agentUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.warn("[CricketTTS] TTS endpoint returned", res.status, "— using browser fallback");
        fallbackSpeak(text, finishSpeaking);
        return;
      }

      const { audio, sampleRate } = await res.json();
      if (!audio) {
        console.warn("[CricketTTS] No audio returned — using browser fallback");
        fallbackSpeak(text, finishSpeaking);
        return;
      }

      // Decode base64 PCM to Float32Array
      const raw = atob(audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: sampleRate || 24000 });
      }
      const ctx = audioContextRef.current;

      const buffer = ctx.createBuffer(1, float32.length, sampleRate || 24000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        console.log("[CricketTTS] ✅ Finished (Gemini audio)");
        finishSpeaking();
      };
      source.start();
    } catch (err) {
      console.error("[CricketTTS] Error:", err);
      fallbackSpeak(text, finishSpeaking);
    }
  }, [finishSpeaking]);

  return { speak, isSpeaking, currentMessage };
}

function fallbackSpeak(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  console.log("[CricketTTS] Using browser speech fallback");
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0;
  u.pitch = 1.0;
  u.onend = () => { console.log("[CricketTTS] ✅ Finished (browser)"); onEnd(); };
  u.onerror = () => { onEnd(); };
  window.speechSynthesis.speak(u);
}
