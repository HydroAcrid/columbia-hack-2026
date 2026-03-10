"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentBaseUrl, getVisitorHeaders, readAgentErrorMessage } from "./agent-client";

export type CricketTTSMode = "gemini" | null;
export type CricketTTSPhase = "idle" | "requesting" | "speaking" | "error";

const DEFAULT_SAMPLE_RATE = 24000;

type PreparedGeminiAudio = {
  buffer: AudioBuffer;
  ctx: AudioContext;
};

/**
 * useCricketTTS
 *
 * Requests Gemini TTS audio and plays it directly through Web Audio.
 */
export function useCricketTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [playbackMode, setPlaybackMode] = useState<CricketTTSMode>(null);
  const [phase, setPhase] = useState<CricketTTSPhase>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const isSpeakingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const requestSequenceRef = useRef(0);

  const clearActiveSource = useCallback(() => {
    if (!activeSourceRef.current) {
      return;
    }

    activeSourceRef.current.onended = null;
    try {
      activeSourceRef.current.stop();
    } catch {
      // Ignore invalid-state races when the source already ended.
    }
    activeSourceRef.current.disconnect();
    activeSourceRef.current = null;
  }, []);

  const clearPlaybackRefs = useCallback(() => {
    clearActiveSource();
  }, [clearActiveSource]);

  const finishSpeaking = useCallback(() => {
    clearPlaybackRefs();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setCurrentMessage(null);
    setPlaybackMode(null);
    setPhase("idle");
  }, [clearPlaybackRefs]);

  const failSpeaking = useCallback((message: string) => {
    console.error("[CricketTTS] Error:", message);
    clearPlaybackRefs();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setPlaybackMode(null);
    setPhase("error");
    setLastError(message);
    setCurrentMessage(null);
  }, [clearPlaybackRefs]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor = window.AudioContext ?? (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor({ sampleRate: DEFAULT_SAMPLE_RATE });
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch (error) {
        console.warn("[CricketTTS] AudioContext resume failed", error);
      }
    }

    return audioContextRef.current;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const prewarmAudio = () => {
      void ensureAudioContext();
    };

    window.addEventListener("pointerdown", prewarmAudio, { once: true, passive: true });
    window.addEventListener("keydown", prewarmAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", prewarmAudio);
      window.removeEventListener("keydown", prewarmAudio);
    };
  }, [ensureAudioContext]);

  useEffect(() => () => {
    clearActiveSource();
  }, [clearActiveSource]);

  const prepareGeminiAudio = useCallback(async (
    audioBase64: string,
    sampleRate: number | null | undefined,
  ): Promise<PreparedGeminiAudio | null> => {
    const ctx = await ensureAudioContext();
    if (!ctx) {
      return null;
    }

    const raw = atob(audioBase64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let index = 0; index < int16.length; index += 1) {
      float32[index] = int16[index] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, sampleRate || DEFAULT_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);
    return { buffer, ctx };
  }, [ensureAudioContext]);

  const startGeminiPlayback = useCallback((
    preparedAudio: PreparedGeminiAudio,
    requestId: number,
    requestStartedAt: number,
  ) => {
    const source = preparedAudio.ctx.createBufferSource();
    source.buffer = preparedAudio.buffer;
    source.connect(preparedAudio.ctx.destination);
    source.onended = () => {
      if (requestId !== requestSequenceRef.current) {
        return;
      }

      console.log("[CricketTTS] ✅ Finished (Gemini audio)");
      finishSpeaking();
    };

    activeSourceRef.current = source;
    setPlaybackMode("gemini");
    setPhase("speaking");
    source.start();

    console.log(
      `[CricketTTS] Gemini audible start after ${Math.round(performance.now() - requestStartedAt)}ms`,
    );
  }, [finishSpeaking]);

  const speak = useCallback(async (text: string) => {
    if (isSpeakingRef.current) {
      console.log("[CricketTTS] Already speaking, skipping");
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    const requestStartedAt = performance.now();

    console.log(`[CricketTTS] 🦗 Speaking: "${text}"`);
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setCurrentMessage(text);
    setPlaybackMode(null);
    setLastError(null);
    setPhase("requesting");

    try {
      const agentUrl = getAgentBaseUrl();
      const ttsStartedAt = performance.now();
      const res = await fetch(`${agentUrl}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Object.fromEntries(getVisitorHeaders().entries()),
        },
        body: JSON.stringify({ text }),
      });
      console.log(
        `[CricketTTS] Gemini TTS response received after ${Math.round(performance.now() - ttsStartedAt)}ms`,
      );

      if (!res.ok) {
        const message = await readAgentErrorMessage(res);
        failSpeaking(message);
        return;
      }

      const { audio, sampleRate } = await res.json();
      if (!audio) {
        failSpeaking("No audio returned from Gemini TTS.");
        return;
      }

      const preparedAudio = await prepareGeminiAudio(audio, sampleRate);
      const audioReadyAt = performance.now();
      console.log(
        `[CricketTTS] Gemini audio ready after ${Math.round(audioReadyAt - requestStartedAt)}ms`,
      );

      if (!preparedAudio) {
        failSpeaking("Web Audio playback is unavailable.");
        return;
      }

      if (requestId !== requestSequenceRef.current || !isSpeakingRef.current) {
        return;
      }

      startGeminiPlayback(preparedAudio, requestId, requestStartedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failSpeaking(message);
    }
  }, [failSpeaking, finishSpeaking, prepareGeminiAudio, startGeminiPlayback]);

  return { speak, isSpeaking, currentMessage, playbackMode, phase, lastError };
}
