"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import PdfUploader from "@/components/PdfUploader";
import PdfViewer from "@/components/PdfViewer";
import PdfOutline from "@/components/PdfOutline";
import PlayerControls from "@/components/PlayerControls";
import { useTtsPlayer } from "@/hooks/useTtsPlayer";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import type { OutlineItem, PageText, Voice, Word } from "@/types";

function hasWordPositions(words: Word[]): boolean {
  return words.some((w) => w.x != null && w.y != null && w.w != null && w.h != null);
}

function mergeCachedPage(existing: PageText | undefined, incoming: PageText): PageText {
  if (!existing) return incoming;
  if (hasWordPositions(existing.words) && !hasWordPositions(incoming.words)) return existing;
  return incoming;
}

interface SavedPdf {
  name: string;
  path: string;
  url: string;
  createdAt: string;
  lastPage: number | null;
  wordIndex: number | null;
  voice: string | null;
  rate: string | null;
}

export default function Home() {
  const { isLoaded, isSignedIn } = useUser();
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [pageData, setPageData] = useState<PageText | null>(null);
  const [pageCache, setPageCache] = useState<Record<number, PageText>>({});
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState("+0%");
  const [voices, setVoices] = useState<Voice[]>(VOICES.filter((v) => v.locale.toLowerCase() === "en-us"));
  const [savedPdfs, setSavedPdfs] = useState<SavedPdf[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [initialPage, setInitialPage] = useState(1);

  const tts = useTtsPlayer();
  const pendingAutoPageRef = useRef<number | null>(null);
  const handledEndedCountRef = useRef(0);
  const handledGaplessCountRef = useRef(0);
  const prefetchKeyRef = useRef("");
  const prevPlaybackSettingsRef = useRef({ voice: DEFAULT_VOICE, rate: "+0%" });

  // Session tracking refs — always current so unload handlers never see stale closures
  const currentPdfPathRef = useRef<string | null>(null);
  const currentPdfNameRef = useRef<string | null>(null);
  const lastWordIndexRef = useRef(0);
  const currentPageRef = useRef(1);
  const voiceRef = useRef(DEFAULT_VOICE);
  const rateRef = useRef("+0%");
  const isSignedInRef = useRef(false);
  const prevIsPlayingRef = useRef(false);
  const prevEndedCountRef = useRef(0);
  const pendingResumeRef = useRef<{ page: number; wordIndex: number } | null>(null);

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { isSignedInRef.current = !!isSignedIn; }, [isSignedIn]);
  useEffect(() => { if (tts.currentWordIndex >= 0) lastWordIndexRef.current = tts.currentWordIndex; }, [tts.currentWordIndex]);

  const saveSession = useCallback((page: number, wordIndex: number, v: string, r: string) => {
    const path = currentPdfPathRef.current;
    const name = currentPdfNameRef.current;
    if (!path || !name) return;
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name, page, wordIndex, voice: v, rate: r }),
    }).catch(() => {});
  }, []);

  const beaconSession = useCallback(() => {
    const path = currentPdfPathRef.current;
    const name = currentPdfNameRef.current;
    if (!path || !name || !isSignedInRef.current) return;
    navigator.sendBeacon(
      "/api/session",
      new Blob([JSON.stringify({
        path, name,
        page: currentPageRef.current,
        wordIndex: lastWordIndexRef.current,
        voice: voiceRef.current,
        rate: rateRef.current,
      })], { type: "application/json" }),
    );
  }, []);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") beaconSession(); };
    const onUnload = () => beaconSession();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [beaconSession]);

  // Save on user pause/stop only — not on automatic page-end transitions
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    const endedJustNow = tts.endedCount !== prevEndedCountRef.current;
    prevIsPlayingRef.current = tts.isPlaying;
    prevEndedCountRef.current = tts.endedCount;
    if (wasPlaying && !tts.isPlaying && isSignedIn && !endedJustNow) {
      saveSession(currentPage, lastWordIndexRef.current, voice, rate);
    }
  }, [tts.isPlaying, tts.endedCount, isSignedIn, currentPage, voice, rate, saveSession]);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d: { voices: Voice[] }) => {
        if (Array.isArray(d.voices) && d.voices.length)
          setVoices(d.voices.filter((v) => v.locale.toLowerCase() === "en-us"));
      })
      .catch(() => {});
  }, []);

  const refreshSavedList = useCallback(() => {
    fetch("/api/list-pdfs")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.files)) setSavedPdfs(d.files); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    setLoadingSaved(true);
    fetch("/api/list-pdfs")
      .then((r) => r.json())
      .then((d) => setSavedPdfs(Array.isArray(d.files) ? d.files : []))
      .catch(() => {})
      .finally(() => setLoadingSaved(false));
  }, [isSignedIn]);

  const handlePageReady = useCallback(
    (p: PageText) => {
      setPageData(p);
      setPageCache((prev) => ({
        ...prev,
        [p.pageNumber]: mergeCachedPage(prev[p.pageNumber], p),
      }));

      // Resume: auto-start from the saved word index
      if (pendingResumeRef.current?.page === p.pageNumber && p.text.trim()) {
        const wordIndex = Math.max(0, Math.min(pendingResumeRef.current.wordIndex, p.words.length - 1));
        pendingResumeRef.current = null;
        const text = p.words.slice(wordIndex).map((w) => w.text).join(" ").trim();
        void tts.play({ text, voice, rate, words: p.words, startWordIndex: wordIndex });
        return;
      }

      // Continuous page advance: auto-play full page
      if (pendingAutoPageRef.current === p.pageNumber && p.text.trim()) {
        pendingAutoPageRef.current = null;
        void tts.play({ text: p.text, voice, rate, words: p.words });
        return;
      }

      if (tts.isPlaying) tts.updateWords(p.words);
    },
    [rate, tts, voice],
  );

  const handlePrefetchPageReady = useCallback((p: PageText) => {
    setPageCache((prev) => ({
      ...prev,
      [p.pageNumber]: mergeCachedPage(prev[p.pageNumber], p),
    }));
  }, []);

  const handleLoad = useCallback((n: number) => setNumPages(n), []);

  const handlePageChange = useCallback(
    (n: number) => {
      pendingAutoPageRef.current = null;
      tts.stop();
      setPageData(pageCache[n] ?? null);
      setCurrentPage(n);
    },
    [pageCache, tts],
  );

  const resetReader = useCallback(() => {
    pendingAutoPageRef.current = null;
    pendingResumeRef.current = null;
    prefetchKeyRef.current = "";
    handledEndedCountRef.current = 0;
    lastWordIndexRef.current = 0;
    tts.stop();
    setPageData(null);
    setPageCache({});
    setNumPages(0);
    setCurrentPage(1);
    setOutline([]);
    setInitialPage(1);
  }, [tts]);

  const handleFile = useCallback(
    (f: File) => {
      resetReader();
      currentPdfPathRef.current = null;
      currentPdfNameRef.current = f.name;
      setFile(f);

      if (isSignedIn) {
        setUploadStatus("uploading");
        const fd = new FormData();
        fd.append("file", f);
        fetch("/api/upload-pdf", { method: "POST", body: fd })
          .then((r) => r.json())
          .then((d: { path?: string }) => {
            if (d.path) currentPdfPathRef.current = d.path;
            setUploadStatus("done");
            refreshSavedList();
          })
          .catch(() => setUploadStatus("error"))
          .finally(() => setTimeout(() => setUploadStatus("idle"), 3000));
      }
    },
    [isSignedIn, resetReader, refreshSavedList],
  );

  const handleOpenSaved = useCallback(
    async (pdf: SavedPdf) => {
      try {
        const res = await fetch(pdf.url);
        const blob = await res.blob();
        const f = new File([blob], pdf.name, { type: "application/pdf" });
        resetReader();
        if (pdf.voice) setVoice(pdf.voice);
        if (pdf.rate) setRate(pdf.rate);
        setInitialPage(pdf.lastPage ?? 1);
        currentPdfPathRef.current = pdf.path;
        currentPdfNameRef.current = pdf.name;
        setFile(f);
      } catch { /* ignore */ }
    },
    [resetReader],
  );

  const handleResumeSaved = useCallback(
    async (pdf: SavedPdf) => {
      try {
        const res = await fetch(pdf.url);
        const blob = await res.blob();
        const f = new File([blob], pdf.name, { type: "application/pdf" });
        resetReader();
        if (pdf.voice) setVoice(pdf.voice);
        if (pdf.rate) setRate(pdf.rate);
        const resumePage = pdf.lastPage ?? 1;
        setInitialPage(resumePage);
        pendingResumeRef.current = { page: resumePage, wordIndex: pdf.wordIndex ?? 0 };
        currentPdfPathRef.current = pdf.path;
        currentPdfNameRef.current = pdf.name;
        setFile(f);
      } catch { /* ignore */ }
    },
    [resetReader],
  );

  const onPlay = useCallback(() => {
    if (!pageData || !pageData.text.trim()) return;
    void tts.play({ text: pageData.text, voice, rate, words: pageData.words });
  }, [pageData, voice, rate, tts]);

  // Restart from current word when voice/rate changes mid-playback
  useEffect(() => {
    const prev = prevPlaybackSettingsRef.current;
    const changed = prev.voice !== voice || prev.rate !== rate;
    prevPlaybackSettingsRef.current = { voice, rate };
    if (!changed) return;
    prefetchKeyRef.current = "";
    if (!tts.isPlaying || !pageData || !pageData.words.length) return;
    const startWordIndex = Math.max(0, Math.min(tts.currentWordIndex, pageData.words.length - 1));
    const text = pageData.words.slice(startWordIndex).map((w) => w.text).join(" ").trim();
    if (!text) return;
    void tts.play({ text, voice, rate, words: pageData.words, startWordIndex });
  }, [pageData, rate, tts, voice]);

  // Prefetch next page at 60% progress
  useEffect(() => {
    if (!tts.isPlaying || tts.progress < 0.6) return;
    const nextPage = currentPage + 1;
    if (nextPage > numPages) return;
    const next = pageCache[nextPage];
    if (!next || !next.text.trim()) return;
    const k = `${nextPage}|${voice}|${rate}|${next.text.length}|${next.text.slice(0, 32)}|${next.text.slice(-32)}`;
    if (prefetchKeyRef.current === k) return;
    prefetchKeyRef.current = k;
    void tts.prefetch({ text: next.text, voice, rate, words: next.words });
  }, [currentPage, numPages, pageCache, rate, tts, voice]);

  // Auto-advance to next page when audio ends.
  // If gaplessEndedCount also incremented, the standby element already started playing —
  // just update page state; do NOT call tts.play again or it will interrupt the audio.
  useEffect(() => {
    if (tts.endedCount === 0) return;
    if (tts.endedCount === handledEndedCountRef.current) return;
    handledEndedCountRef.current = tts.endedCount;

    const wasGapless = tts.gaplessEndedCount > handledGaplessCountRef.current;
    handledGaplessCountRef.current = tts.gaplessEndedCount;

    const nextPage = currentPage + 1;
    if (nextPage > numPages) return;
    const next = pageCache[nextPage];
    setCurrentPage(nextPage);
    setPageData(next ?? null);

    if (wasGapless) {
      // Audio already running via ping-pong swap — page state updated, nothing else to do.
      pendingAutoPageRef.current = null;
      return;
    }

    if (next?.text.trim()) {
      pendingAutoPageRef.current = null;
      void tts.play({ text: next.text, voice, rate, words: next.words });
      return;
    }
    pendingAutoPageRef.current = nextPage;
  }, [currentPage, numPages, pageCache, rate, tts, voice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (tts.isPlaying) tts.pause();
        else if (tts.alignedWords.length) tts.resume();
        else onPlay();
      } else if (e.code === "ArrowRight") {
        handlePageChange(Math.min(numPages, currentPage + 1));
      } else if (e.code === "ArrowLeft") {
        handlePageChange(Math.max(1, currentPage - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tts, onPlay, handlePageChange, numPages, currentPage]);

  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
        <h1 className="text-3xl font-bold">PDF Read Aloud</h1>
        <p className="text-gray-500">Word-synced narration using Microsoft Edge neural voices</p>
        <p className="text-sm text-gray-400">Sign in to upload and save your PDFs</p>
        <SignInButton mode="modal">
          <button className="px-6 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700">
            Sign In
          </button>
        </SignInButton>
      </main>
    );
  }

  if (!file) {
    return (
      <main className="min-h-screen flex flex-col items-center p-6 pt-16">
        <div className="absolute top-4 right-4"><UserButton /></div>
        <h1 className="text-3xl font-bold mb-2">PDF Read Aloud</h1>
        <p className="text-gray-500 mb-8">Word-synced narration using Microsoft Edge neural voices</p>
        <PdfUploader onFile={handleFile} />

        <div className="w-full max-w-xl mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Your saved PDFs
          </h2>
          {loadingSaved && <p className="text-sm text-gray-400">Loading…</p>}
          {!loadingSaved && savedPdfs.length === 0 && (
            <p className="text-sm text-gray-400">No saved PDFs yet.</p>
          )}
          <ul className="space-y-2">
            {savedPdfs.map((pdf) => (
              <li key={pdf.path} className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => void handleOpenSaved(pdf)} className="flex-1 text-left min-w-0">
                  <span className="block truncate text-sm font-medium">{pdf.name}</span>
                  {pdf.lastPage && <span className="text-xs text-gray-400">Last read: p.{pdf.lastPage}</span>}
                </button>
                {pdf.lastPage != null && (
                  <button
                    type="button"
                    onClick={() => void handleResumeSaved(pdf)}
                    className="shrink-0 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    ▶ Resume
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  const noTextMessage =
    pageData && pageData.words.length === 0
      ? "No text on this page (scanned/image PDFs are not supported — no OCR)."
      : null;

  return (
    <main className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-2">
        <div className="flex items-center gap-3">
          {outline.length > 0 && (
            <button
              type="button"
              onClick={() => setOutlineOpen((o) => !o)}
              className="text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
              aria-label="Toggle contents"
            >
              ☰
            </button>
          )}
          <div className="font-semibold">PDF Read Aloud</div>
        </div>
        <div className="flex items-center gap-3">
          {uploadStatus === "uploading" && <span className="text-xs text-gray-400">Saving…</span>}
          {uploadStatus === "done" && <span className="text-xs text-green-600">Saved</span>}
          {uploadStatus === "error" && <span className="text-xs text-red-500">Save failed</span>}
          <button
            type="button"
            onClick={() => { resetReader(); setFile(null); }}
            className="text-sm px-3 py-1 rounded bg-gray-100 dark:bg-gray-800"
          >
            New PDF
          </button>
          <UserButton />
        </div>
      </header>
      <div className="flex-1 min-h-0 flex">
        {outlineOpen && outline.length > 0 && (
          <PdfOutline items={outline} currentPage={currentPage} onNavigate={handlePageChange} />
        )}
        <div className="flex-1 min-w-0">
          <PdfViewer
            file={file}
            currentPage={currentPage}
            initialPage={initialPage}
            onPageChange={handlePageChange}
            onPageReady={handlePageReady}
            onPrefetchPageReady={handlePrefetchPageReady}
            onLoad={handleLoad}
            onOutline={setOutline}
            currentWordIndex={tts.currentWordIndex}
            noTextMessage={noTextMessage}
          />
        </div>
      </div>
      <PlayerControls
        voices={voices}
        voice={voice}
        onVoiceChange={setVoice}
        rate={rate}
        onRateChange={setRate}
        isPlaying={tts.isPlaying}
        isLoading={tts.isLoading}
        onPlay={onPlay}
        onPause={tts.pause}
        onStop={tts.stop}
        progress={tts.progress}
        error={tts.error}
        onRetry={tts.retry}
      />
    </main>
  );
}
