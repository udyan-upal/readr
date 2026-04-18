"use client";

import { useCallback, useEffect, useState } from "react";
import PdfUploader from "@/components/PdfUploader";
import PdfViewer from "@/components/PdfViewer";
import PdfOutline from "@/components/PdfOutline";
import PlayerControls from "@/components/PlayerControls";
import { useTtsPlayer } from "@/hooks/useTtsPlayer";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import type { OutlineItem, PageText, Voice } from "@/types";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pageData, setPageData] = useState<PageText | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState("+0%");
  const [voices, setVoices] = useState<Voice[]>(VOICES);

  const tts = useTtsPlayer();

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d: { voices: Voice[] }) => {
        if (Array.isArray(d.voices) && d.voices.length) setVoices(d.voices);
      })
      .catch(() => {});
  }, []);

  const handlePageReady = useCallback((p: PageText) => {
    setPageData(p);
  }, []);

  const handleLoad = useCallback((n: number) => {
    setNumPages(n);
  }, []);

  const handlePageChange = useCallback(
    (n: number) => {
      tts.stop();
      setPageData(null);
      setCurrentPage(n);
    },
    [tts],
  );

  const handleFile = useCallback(
    (f: File) => {
      tts.stop();
      setPageData(null);
      setNumPages(0);
      setCurrentPage(1);
      setOutline([]);
      setFile(f);
    },
    [tts],
  );

  const onPlay = useCallback(() => {
    if (!pageData || !pageData.text.trim()) return;
    void tts.play({
      text: pageData.text,
      voice,
      rate,
      words: pageData.words,
    });
  }, [pageData, voice, rate, tts]);

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

  if (!file) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-2">PDF Read Aloud</h1>
        <p className="text-gray-500 mb-8">
          Word-synced narration using Microsoft Edge neural voices
        </p>
        <PdfUploader onFile={handleFile} />
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
              title="Toggle contents"
            >
              ☰
            </button>
          )}
          <div className="font-semibold">PDF Read Aloud</div>
        </div>
        <button
          type="button"
          onClick={() => {
            tts.stop();
            setFile(null);
            setPageData(null);
            setNumPages(0);
            setOutline([]);
          }}
          className="text-sm px-3 py-1 rounded bg-gray-100 dark:bg-gray-800"
        >
          New PDF
        </button>
      </header>
      <div className="flex-1 min-h-0 flex">
        {outlineOpen && outline.length > 0 && (
          <PdfOutline
            items={outline}
            currentPage={currentPage}
            onNavigate={handlePageChange}
          />
        )}
        <div className="flex-1 min-w-0">
          <PdfViewer
            file={file}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onPageReady={handlePageReady}
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
