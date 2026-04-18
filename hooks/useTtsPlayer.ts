"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsResponse, Word, WordBoundary } from "@/types";
import { alignBoundaries } from "@/lib/alignBoundaries";

interface PlayOptions {
  text: string;
  voice: string;
  rate: string;
  words: Word[];
  startWordIndex?: number;
}

interface FetchedClip {
  blob: Blob;
  boundaries: WordBoundary[];
}

interface State {
  isPlaying: boolean;
  isLoading: boolean;
  currentWordIndex: number;
  progress: number;
  error: string | null;
  alignedWords: Word[];
  endedCount: number;
}

// Cheap cache key — voice + rate + length + text edges uniquely identify a page's clip.
function keyOf(o: PlayOptions): string {
  return `${o.voice}|${o.rate}|${o.startWordIndex ?? 0}|${o.text.length}|${o.text.slice(0, 64)}|${o.text.slice(-64)}`;
}

async function fetchClip(opts: PlayOptions): Promise<FetchedClip> {
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
  return { blob, boundaries: data.boundaries };
}

export function useTtsPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const boundariesRef = useRef<WordBoundary[]>([]);
  const wordsRef = useRef<Word[]>([]);
  const lastReqRef = useRef<PlayOptions | null>(null);
  const prefetchRef = useRef<{ key: string; clip: FetchedClip; words: Word[] } | null>(null);
  const inFlightPrefetchRef = useRef<string | null>(null);

  const [state, setState] = useState<State>({
    isPlaying: false,
    isLoading: false,
    currentWordIndex: -1,
    progress: 0,
    error: null,
    alignedWords: [],
    endedCount: 0,
  });

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

  const startWithClip = useCallback(
    async (opts: PlayOptions, clip: FetchedClip) => {
      const startWordIndex = Math.max(0, Math.min(opts.startWordIndex ?? 0, Math.max(0, opts.words.length - 1)));
      const a = getAudio();
      a.pause();
      cleanupUrl();

      const url = URL.createObjectURL(clip.blob);
      urlRef.current = url;
      a.src = url;

      boundariesRef.current = clip.boundaries;
      const leadingWords = opts.words.slice(0, startWordIndex).map((w) => ({ ...w }));
      const targetWords = opts.words.slice(startWordIndex);
      const alignedTail = alignBoundaries(targetWords, clip.boundaries);
      const aligned = leadingWords.length ? [...leadingWords, ...alignedTail] : alignedTail;
      wordsRef.current = aligned;

      setState((s) => ({
        ...s,
        isLoading: false,
        currentWordIndex: -1,
        progress: 0,
        error: null,
        alignedWords: aligned,
      }));

      try {
        await a.play();
      } catch (err) {
        setState((s) => ({ ...s, isPlaying: false, error: (err as Error).message }));
      }
    },
    [cleanupUrl, getAudio],
  );

  const play = useCallback(
    async (opts: PlayOptions) => {
      lastReqRef.current = opts;
      const k = keyOf(opts);

      // Hot cache from prefetch — swap instantly, no loading state.
      if (prefetchRef.current?.key === k) {
        const pre = prefetchRef.current;
        prefetchRef.current = null;
        await startWithClip(opts, pre.clip);
        return;
      }

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
        const clip = await fetchClip(opts);
        await startWithClip(opts, clip);
      } catch (err) {
        setState((s) => ({
          ...s,
          isLoading: false,
          isPlaying: false,
          error: (err as Error).message,
        }));
      }
    },
    [startWithClip],
  );

  const prefetch = useCallback(async (opts: PlayOptions) => {
    const k = keyOf(opts);
    if (prefetchRef.current?.key === k) return;
    if (inFlightPrefetchRef.current === k) return;
    inFlightPrefetchRef.current = k;
    try {
      const clip = await fetchClip(opts);
      if (inFlightPrefetchRef.current === k) {
        prefetchRef.current = { key: k, clip, words: opts.words };
      }
    } catch {
      // Best-effort — a prefetch failure should not surface an error.
    } finally {
      if (inFlightPrefetchRef.current === k) inFlightPrefetchRef.current = null;
    }
  }, []);

  // When positioned words for the currently-playing page arrive, realign
  // against the stored boundaries so highlight rects update in place.
  const updateWords = useCallback((words: Word[]) => {
    if (!boundariesRef.current.length) return;
    const aligned = alignBoundaries(words, boundariesRef.current);
    wordsRef.current = aligned;
    setState((s) => ({ ...s, alignedWords: aligned }));
  }, []);

  const retry = useCallback(() => {
    if (lastReqRef.current) void play(lastReqRef.current);
  }, [play]);

  useEffect(() => {
    const a = getAudio();

    const onTime = () => {
      const ms = a.currentTime * 1000;
      const words = wordsRef.current;
      let idx = -1;
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
      setState((s) => ({ ...s, isPlaying: false, progress: 1, endedCount: s.endedCount + 1 }));

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

  useEffect(
    () => () => {
      audioRef.current?.pause();
      cleanupUrl();
    },
    [cleanupUrl],
  );

  return {
    ...state,
    play,
    prefetch,
    updateWords,
    pause,
    resume,
    stop,
    retry,
  };
}
