"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";
import PdfUploader from "@/components/PdfUploader";
import PdfViewer from "@/components/PdfViewer";
import PdfOutline from "@/components/PdfOutline";
import NotesPanel from "@/components/NotesPanel";
import PlayerControls from "@/components/PlayerControls";
import { FaNotesMedical } from "react-icons/fa";
import { useTtsPlayer } from "@/hooks/useTtsPlayer";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import type { OutlineItem, PageText, PdfNote, Voice, Word } from "@/types";

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

interface RawPdfNote {
  id: string;
  page_number?: number;
  pageNumber?: number;
  note_text?: string;
  noteText?: string;
  line_y?: number;
  lineY?: number;
  word_index?: number;
  wordIndex?: number;
  created_at?: string;
  createdAt?: string;
}

function normalizeNote(note: RawPdfNote): PdfNote {
  return {
    id: note.id,
    pageNumber: Number(note.pageNumber ?? note.page_number ?? 0),
    noteText: String(note.noteText ?? note.note_text ?? ""),
    lineY: Number(note.lineY ?? note.line_y ?? 0),
    wordIndex: Number(note.wordIndex ?? note.word_index ?? 0),
    createdAt: String(note.createdAt ?? note.created_at ?? ""),
  };
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Ignore parse failures and use fallback.
  }
  return fallback;
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
  const [notesByPage, setNotesByPage] = useState<Record<number, PdfNote[]>>({});
  const [allNotes, setAllNotes] = useState<PdfNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);
  const [currentPdfPath, setCurrentPdfPath] = useState<string | null>(null);

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
    setNotesByPage({});
    setAllNotes([]);
    setHighlightNoteId(null);
    setCurrentPdfPath(null);
  }, [tts]);

  const handleFile = useCallback(
    (f: File) => {
      resetReader();
      currentPdfPathRef.current = null;
      setCurrentPdfPath(null);
      currentPdfNameRef.current = f.name;
      setFile(f);

      if (isSignedIn) {
        setUploadStatus("uploading");
        const fd = new FormData();
        fd.append("file", f);
        fetch("/api/upload-pdf", { method: "POST", body: fd })
          .then((r) => r.json())
          .then((d: { path?: string }) => {
            if (d.path) {
              currentPdfPathRef.current = d.path;
              setCurrentPdfPath(d.path);
              window.history.replaceState(null, "", `/read/${encodeURIComponent(d.path)}`);
            }
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
        setCurrentPdfPath(pdf.path);
        currentPdfNameRef.current = pdf.name;
        window.history.replaceState(null, "", `/read/${encodeURIComponent(pdf.path)}`);
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
        setCurrentPdfPath(pdf.path);
        currentPdfNameRef.current = pdf.name;
        window.history.replaceState(null, "", `/read/${encodeURIComponent(pdf.path)}`);
        setFile(f);
      } catch { /* ignore */ }
    },
    [resetReader],
  );

  const onPlay = useCallback(() => {
    if (!pageData || !pageData.text.trim()) return;
    if (tts.alignedWords.length > 0) { tts.resume(); return; }
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

  const fetchNotesForPage = useCallback(async (path: string, page: number) => {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(path)}&page=${page}`);
    if (!res.ok) throw new Error("Failed to load notes");
    const data = (await res.json()) as { notes?: RawPdfNote[] };
    const normalized = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
    setNotesByPage((prev) => ({ ...prev, [page]: normalized }));
  }, []);

  const fetchAllNotes = useCallback(async (path: string) => {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(path)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { notes?: RawPdfNote[] };
    const normalized = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
    setAllNotes(normalized);
  }, []);

  useEffect(() => {
    if (!currentPdfPath) return;
    fetchNotesForPage(currentPdfPath, currentPage).catch((err) => {
      console.warn("[notes] fetch failed", err);
    });
  }, [currentPage, currentPdfPath, fetchNotesForPage]);

  useEffect(() => {
    if (!currentPdfPath) { setAllNotes([]); return; }
    fetchAllNotes(currentPdfPath).catch(() => {});
  }, [currentPdfPath, fetchAllNotes]);

  const handleAddNote = useCallback(async (lineY: number, wordIndex: number, text: string) => {
    if (!currentPdfPath) throw new Error("Missing PDF path");
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: currentPdfPath,
        pageNumber: currentPage,
        noteText: text,
        lineY,
        wordIndex,
      }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "Failed to save note"));
    const data = (await res.json()) as { note?: RawPdfNote };
    if (!data.note) return;
    const note = normalizeNote(data.note);
    setNotesByPage((prev) => {
      const nextPageNotes = [...(prev[currentPage] ?? []).filter((n) => n.id !== note.id), note]
        .sort((a, b) => a.lineY - b.lineY);
      return { ...prev, [currentPage]: nextPageNotes };
    });
    setAllNotes((prev) => [...prev.filter((n) => n.id !== note.id), note]
      .sort((a, b) => a.pageNumber !== b.pageNumber ? a.pageNumber - b.pageNumber : a.lineY - b.lineY));
  }, [currentPage, currentPdfPath]);

  const handleUpdateNote = useCallback(async (noteId: string, text: string) => {
    const res = await fetch(`/api/notes?id=${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteText: text }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "Failed to update note"));
    const data = (await res.json()) as { note?: RawPdfNote };
    const updated = data.note ? normalizeNote(data.note) : null;
    setNotesByPage((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] ?? []).map((n) => {
        if (n.id !== noteId) return n;
        return updated ?? { ...n, noteText: text };
      }),
    }));
    setAllNotes((prev) => prev.map((n) => {
      if (n.id !== noteId) return n;
      return updated ?? { ...n, noteText: text };
    }));
  }, [currentPage]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    const res = await fetch(`/api/notes?id=${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await readApiError(res, "Failed to delete note"));
    setNotesByPage((prev) => ({
      ...prev,
      [currentPage]: (prev[currentPage] ?? []).filter((n) => n.id !== noteId),
    }));
    setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [currentPage]);

  if (!isLoaded) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ width: 28, height: 28, border: "2.5px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "2rem" }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, maxWidth: 400, width: "100%" }}>
          <img src="/readr-logo-nobg.png" alt="Readr" style={{ width: 64, height: 64, objectFit: "contain" }} />
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-1)", margin: "0 0 8px" }}>Readr</h1>
            <p style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.5, margin: 0 }}>
              Word-synced narration with<br/>Microsoft Edge neural voices
            </p>
          </div>
          <SignInButton mode="modal">
            <button
              style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 14px rgba(91,94,255,0.35)", fontFamily: "inherit", transition: "background 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-h)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
            >
              Sign in to get started
            </button>
          </SignInButton>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Upload &amp; sync across sessions after sign-in</p>
        </div>
      </main>
    );
  }

  if (!file) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent-s)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src="/readr-logo-nobg.png" alt="Readr" style={{ width: 18, height: 18, objectFit: "contain" }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", letterSpacing: "-0.3px" }}>Readr</span>
          </div>
          <UserButton />
        </header>

        {/* Hero + upload */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px 40px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--text-1)", margin: "0 0 8px", textAlign: "center" }}>
            Open a PDF to get started
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-3)", margin: "0 0 36px", textAlign: "center" }}>
            Drag &amp; drop or click below
          </p>
          <PdfUploader onFile={handleFile} />

          {/* Library */}
          {(loadingSaved || savedPdfs.length > 0) && (
            <div style={{ width: "100%", marginTop: 48 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  Your Library
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              </div>

              {loadingSaved ? (
                <div style={{ fontSize: 13, color: "var(--text-3)", padding: "12px 0" }}>Loading…</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {savedPdfs.map((pdf) => (
                    <li
                      key={pdf.path}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLLIElement).style.boxShadow = "0 0 0 3px var(--accent-s)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLLIElement).style.boxShadow = "none"; }}
                      onClick={() => void handleOpenSaved(pdf)}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent-s)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdf.name}</div>
                        {pdf.lastPage && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Last read: page {pdf.lastPage}</div>
                        )}
                      </div>
                      {pdf.lastPage != null && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleResumeSaved(pdf); }}
                          style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 99, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-h)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
                        >
                          Resume
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  const noTextMessage =
    pageData && pageData.words.length === 0
      ? "No text on this page (scanned/image PDFs are not supported — no OCR)."
      : null;

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Reader header */}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "0 16px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        {/* Left: logo + toc toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--accent-s)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img src="/readr-logo-nobg.png" alt="Readr" style={{ width: 17, height: 17, objectFit: "contain" }} />
          </div>
          {outline.length > 0 && (
            <button
              type="button"
              onClick={() => setOutlineOpen((o) => !o)}
              aria-label="Toggle contents"
              style={{ padding: "5px 9px", borderRadius: 7, border: "1.5px solid var(--border)", background: outlineOpen ? "var(--accent-s)" : "transparent", color: outlineOpen ? "var(--accent)" : "var(--text-2)", fontSize: 14, cursor: "pointer", lineHeight: 1, transition: "all 0.15s", fontFamily: "inherit" }}
            >
              ☰
            </button>
          )}
        </div>

        {/* Right: status + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {uploadStatus === "uploading" && (
            <span style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)", display: "inline-block", animation: "pulse 1.2s ease infinite" }} />
              Saving
            </span>
          )}
          {uploadStatus === "done" && <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 500 }}>Saved</span>}
          {uploadStatus === "error" && <span style={{ fontSize: 12, color: "var(--danger)" }}>Save failed</span>}

          {currentPdfPath && (
            <button
              type="button"
              onClick={() => setNotesOpen((o) => !o)}
              className={`notes-panel-toggle${notesOpen ? " active" : ""}`}
              aria-label="Toggle notes"
              title="All notes"
            >
              <FaNotesMedical size={14} />
              {allNotes.length > 0 && <span className="notes-toggle-count">{allNotes.length}</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => { resetReader(); setFile(null); window.history.replaceState(null, "", "/"); }}
            style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; }}
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
            notes={currentPdfPath ? (notesByPage[currentPage] ?? []) : []}
            highlightNoteId={highlightNoteId}
            onNoteAdd={currentPdfPath ? handleAddNote : undefined}
            onNoteUpdate={currentPdfPath ? handleUpdateNote : undefined}
            onNoteDelete={currentPdfPath ? handleDeleteNote : undefined}
          />
        </div>
        {notesOpen && currentPdfPath && (
          <NotesPanel
            notes={allNotes}
            currentPage={currentPage}
            onNavigate={(page, noteId) => {
              handlePageChange(page);
              setHighlightNoteId(noteId);
              setTimeout(() => setHighlightNoteId(null), 1800);
            }}
            onEdit={handleUpdateNote}
            onDelete={handleDeleteNote}
          />
        )}
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
