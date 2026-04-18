"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Word, WordBoundary, TtsResponse } from "@/types";
import { alignBoundaries } from "@/lib/alignBoundaries";

interface PlayOptions {
  text: string;
  voice: string;
  rate: string;
  words: Word[];
}

interface State {
  isPlaying: boolean;
  isLoading: boolean;
  currentWordIndex: number;
  progress: number;
  error: string | null;
  alignedWords: Word[];
}

export function useTtsPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const boundariesRef = useRef<WordBoundary[]>([]);
  const wordsRef = useRef<Word[]>([]);
  const lastReqRef = useRef<PlayOptions | null>(null);

  const [state, setState] = useState<State>({
    isPlaying: false,
    isLoading: false,
    currentWordIndex: -1,
    progress: 0,
    error: null,
    alignedWords: [],
  });

  // Ensure an audio element exists (created lazily on client).
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const cleanupUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    cleanupUrl();
    setState((s) => ({ ...s, isPlaying: false, currentWordIndex: -1, progress: 0 }));
  }, [cleanupUrl]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const play = useCallback(
    async (opts: PlayOptions) => {
      lastReqRef.current = opts;
      const a = getAudio();
      a.pause();
      cleanupUrl();

      setState((s) => ({
        ...s,
        isLoading: true,
        isPlaying: false,
        currentWordIndex: -1,
        progress: 0,
        error: null,
        alignedWords: opts.words,
      }));

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: opts.text, voice: opts.voice, rate: opts.rate }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as TtsResponse;

        const bin = atob(data.audio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        a.src = url;

        boundariesRef.current = data.boundaries;
        const aligned = alignBoundaries(opts.words, data.boundaries);
        wordsRef.current = aligned;

        setState((s) => ({
          ...s,
          isLoading: false,
          alignedWords: aligned,
        }));

        await a.play();
      } catch (err) {
        setState((s) => ({
          ...s,
          isLoading: false,
          isPlaying: false,
          error: (err as Error).message,
        }));
      }
    },
    [cleanupUrl, getAudio],
  );

  const retry = useCallback(() => {
    if (lastReqRef.current) void play(lastReqRef.current);
  }, [play]);

  // Wire up audio events.
  useEffect(() => {
    const a = getAudio();

    const onTime = () => {
      const ms = a.currentTime * 1000;
      const words = wordsRef.current;
      let idx = -1;
      // Linear scan — fine for page-sized word counts.
      for (let i = 0; i < words.length; i++) {
        const off = words[i].offsetMs;
        if (off === undefined) continue;
        if (off <= ms) idx = i;
        else break;
      }
      const dur = a.duration || 0;
      setState((s) => ({
        ...s,
        currentWordIndex: idx,
        progress: dur > 0 ? a.currentTime / dur : 0,
      }));
    };
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () =>
      setState((s) => ({ ...s, isPlaying: false, progress: 1 }));

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [getAudio]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      cleanupUrl();
    };
  }, [cleanupUrl]);

  return {
    ...state,
    play,
    pause,
    resume,
    stop,
    retry,
  };
}
