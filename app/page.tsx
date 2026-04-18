"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PdfUploader from "@/components/PdfUploader";
import PdfViewer from "@/components/PdfViewer";
import TextPanel from "@/components/TextPanel";
import PlayerControls from "@/components/PlayerControls";
import { useTtsPlayer } from "@/hooks/useTtsPlayer";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import type { PageText, Voice } from "@/types";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageText[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState("+0%");
  const [voices, setVoices] = useState<Voice[]>(VOICES);

  const tts = useTtsPlayer();

  useEffect(() => {
    // Keep bundled list as default; refresh from API if it differs.
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d: { voices: Voice[] }) => {
        if (Array.isArray(d.voices) && d.voices.length) setVoices(d.voices);
      })
      .catch(() => {});
  }, []);

  const pageText = useMemo(
    () => pages.find((p) => p.pageNumber === currentPage),
    [pages, currentPage],
  );

  const displayWords =
    tts.alignedWords.length && tts.isPlaying ? tts.alignedWords : pageText?.words ?? [];

  const handleTextExtracted = useCallback((p: PageText[]) => {
    setPages(p);
  }, []);

  const handlePageChange = useCallback(
    (n: number) => {
      tts.stop();
      setCurrentPage(n);
    },
    [tts],
  );

  const handleFile = useCallback(
    (f: File) => {
      tts.stop();
      setPages([]);
      setCurrentPage(1);
      setFile(f);
    },
    [tts],
  );

  const onPlay = useCallback(() => {
    if (!pageText || !pageText.text.trim()) return;
    void tts.play({
      text: pageText.text,
      voice,
      rate,
      words: pageText.words,
    });
  }, [pageText, voice, rate, tts]);

  // Keyboard shortcuts: Space = play/pause, arrows = page nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (tts.isPlaying) tts.pause();
        else if (tts.alignedWords.length) tts.resume();
        else onPlay();
      } else if (e.code === "ArrowRight") {
        handlePageChange(Math.min(pages.length, currentPage + 1));
      } else if (e.code === "ArrowLeft") {
        handlePageChange(Math.max(1, currentPage - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tts, onPlay, handlePageChange, pages.length, currentPage]);

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

  const hasText = pageText && pageText.words.length > 0;

  return (
    <main className="h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-2">
        <div className="font-semibold">PDF Read Aloud</div>
        <button
          type="button"
          onClick={() => {
            tts.stop();
            setFile(null);
            setPages([]);
          }}
          className="text-sm px-3 py-1 rounded bg-gray-100 dark:bg-gray-800"
        >
          New PDF
        </button>
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
        <div className="border-r border-gray-200 dark:border-gray-800 min-h-0 flex flex-col">
          <PdfViewer
            file={file}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextExtracted={handleTextExtracted}
          />
        </div>
        <div className="overflow-auto min-h-0">
          <TextPanel
            words={displayWords}
            currentWordIndex={tts.currentWordIndex}
            emptyMessage={
              pages.length && !hasText
                ? "No text found on this page. Scanned/image PDFs are not supported (no OCR)."
                : undefined
            }
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
