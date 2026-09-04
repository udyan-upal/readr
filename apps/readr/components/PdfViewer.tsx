"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FaNotesMedical } from "react-icons/fa";
import type { OutlineItem, PageText, PdfNote, Word } from "@/types";

// pdf.js outline node shape (narrow subset we need).
interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

interface PdfDocLike {
  getDestination: (name: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: unknown) => Promise<number>;
}

async function resolveOutline(
  doc: unknown,
  items: RawOutlineItem[],
): Promise<OutlineItem[]> {
  const d = doc as PdfDocLike;
  const out: OutlineItem[] = [];
  for (const it of items) {
    let pageNumber: number | undefined;
    try {
      let dest = it.dest as string | unknown[] | null;
      if (typeof dest === "string") dest = await d.getDestination(dest);
      if (Array.isArray(dest) && dest.length > 0) {
        const idx = await d.getPageIndex(dest[0]);
        pageNumber = idx + 1;
      }
    } catch {
      // Unresolvable destination — leave pageNumber undefined.
    }
    const children = it.items?.length ? await resolveOutline(doc, it.items) : [];
    out.push({ title: it.title, pageNumber, items: children });
  }
  return out;
}

interface Line {
  y: number;
  bottom: number;
  firstWordIndex: number;
}

function computeLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.y == null || w.h == null) continue;
    const found = lines.find((l) => w.y! >= l.y - 4 && w.y! <= l.y + 14);
    if (found) {
      found.bottom = Math.max(found.bottom, w.y! + w.h!);
    } else {
      lines.push({ y: w.y!, bottom: w.y! + w.h!, firstWordIndex: i });
    }
  }
  return lines.sort((a, b) => a.y - b.y);
}

interface Props {
  file: File | null;
  currentPage: number;
  initialPage?: number;
  onPageChange: (page: number) => void;
  onPageReady: (page: PageText) => void;
  onPrefetchPageReady?: (page: PageText) => void;
  onLoad: (numPages: number) => void;
  onOutline?: (items: OutlineItem[]) => void;
  currentWordIndex: number;
  noTextMessage?: string | null;
  // Notes
  notes?: PdfNote[];
  highlightNoteId?: string | null;
  onNoteAdd?: (lineY: number, wordIndex: number, text: string) => Promise<void>;
  onNoteUpdate?: (noteId: string, text: string) => Promise<void>;
  onNoteDelete?: (noteId: string) => Promise<void>;
}

interface CanvasSize {
  cssW: number;
  cssH: number;
}

// PDF.js is imported dynamically — it's a client-only lib w/ a worker.
export default function PdfViewer({
  file,
  currentPage,
  initialPage,
  onPageChange,
  onPageReady,
  onPrefetchPageReady,
  onLoad,
  onOutline,
  currentWordIndex,
  noTextMessage,
  notes,
  highlightNoteId,
  onNoteAdd,
  onNoteUpdate,
  onNoteDelete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageWords, setPageWords] = useState<Word[]>([]);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ cssW: 0, cssH: 0 });

  const pdfRef = useRef<unknown>(null);
  const lastScrolledRef = useRef(-1);
  const renderTokenRef = useRef(0);
  const prefetchedPagesRef = useRef<Set<number>>(new Set());
  const prefetchTokenRef = useRef(0);

  // Note state
  const [lines, setLines] = useState<Line[]>([]);
  const [hoveredLine, setHoveredLine] = useState<Line | null>(null);
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [popoverFixedStyle, setPopoverFixedStyle] = useState<CSSProperties>({});

  useEffect(() => {
    setLines(computeLines(pageWords));
    setHoveredLine(null);
    setEditingLine(null);
    setEditingNoteId(null);
    setNoteText("");
    setNoteError(null);
    setIsSavingNote(false);
  }, [pageWords]);

  const cancelNote = useCallback(() => {
    setEditingLine(null);
    setEditingNoteId(null);
    setNoteText("");
    setNoteError(null);
    setIsSavingNote(false);
  }, []);

  useEffect(() => {
    if (!editingLine || !pageContainerRef.current) return;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const topInPdf = Math.min(editingLine.y, Math.max(0, canvasSize.cssH - 210));
    const top = rect.top + topInPdf;
    const popoverW = 280;
    const gap = 14;
    if (rect.right + popoverW + gap <= window.innerWidth) {
      setPopoverFixedStyle({ position: "fixed", top, left: rect.right + gap, width: popoverW });
    } else {
      // no viewport space on right — render inside PDF, anchored to right edge
      setPopoverFixedStyle({ position: "fixed", top, right: window.innerWidth - rect.right + 10, width: Math.min(popoverW, rect.width - 20) });
    }
  }, [editingLine, canvasSize.cssH]);

  const openNoteEditor = useCallback((line: Line) => {
    setEditingLine(line);
    setEditingNoteId(null);
    setNoteText("");
    setNoteError(null);
    setHoveredLine(null);
    setTimeout(() => noteTextareaRef.current?.focus(), 50);
  }, []);

  const openExistingNote = useCallback((note: PdfNote) => {
    setEditingLine({ y: note.lineY, bottom: note.lineY + 20, firstWordIndex: note.wordIndex });
    setEditingNoteId(note.id);
    setNoteText(note.noteText);
    setNoteError(null);
    setHoveredLine(null);
    setTimeout(() => noteTextareaRef.current?.focus(), 50);
  }, []);

  const handleSaveNote = useCallback(async () => {
    const text = noteText.trim();
    if (!editingLine || !text || isSavingNote) return;
    setIsSavingNote(true);
    setNoteError(null);
    try {
      if (editingNoteId && onNoteUpdate) {
        await onNoteUpdate(editingNoteId, text);
      } else if (onNoteAdd) {
        await onNoteAdd(editingLine.y, editingLine.firstWordIndex, text);
      }
      cancelNote();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save note";
      setNoteError(message);
    } finally {
      setIsSavingNote(false);
    }
  }, [editingLine, editingNoteId, noteText, onNoteAdd, onNoteUpdate, cancelNote, isSavingNote]);

  const handleDeleteNote = useCallback(async () => {
    if (!editingNoteId || !onNoteDelete || isSavingNote) return;
    setIsSavingNote(true);
    setNoteError(null);
    try {
      await onNoteDelete(editingNoteId);
      cancelNote();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete note";
      setNoteError(message);
    } finally {
      setIsSavingNote(false);
    }
  }, [editingNoteId, onNoteDelete, cancelNote, isSavingNote]);

  // Load PDF.
  useEffect(() => {
    if (!file) {
      pdfRef.current = null;
      setNumPages(0);
      setPageWords([]);
      prefetchedPagesRef.current.clear();
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      if (cancelled) return;
      pdfRef.current = doc;
      setNumPages(doc.numPages);
      onLoad(doc.numPages);
      setLoading(false);
      const startPage = initialPage && initialPage > 1
        ? Math.min(initialPage, doc.numPages)
        : 1;
      onPageChange(startPage);

      // Resolve PDF outline (bookmarks) → page numbers.
      if (onOutline) {
        try {
          const raw = await (
            doc as unknown as {
              getOutline: () => Promise<RawOutlineItem[] | null>;
            }
          ).getOutline();
          if (!cancelled) {
            const resolved = raw ? await resolveOutline(doc, raw) : [];
            onOutline(resolved);
          }
        } catch (err) {
          console.warn("[PdfViewer] outline fetch failed", err);
          onOutline([]);
        }
      }
    })().catch((err) => {
      console.error("[PdfViewer] load error", err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    const doc = pdfRef.current as {
      getPage: (n: number) => Promise<unknown>;
    } | null;
    if (!doc || !onPrefetchPageReady) return;

    const nextPage = currentPage + 1;
    if (nextPage > numPages) return;
    if (prefetchedPagesRef.current.has(nextPage)) return;

    const myToken = ++prefetchTokenRef.current;
    let cancelled = false;

    (async () => {
      const page = (await doc.getPage(nextPage)) as {
        getTextContent: () => Promise<unknown>;
      };
      if (cancelled || prefetchTokenRef.current !== myToken) return;

      const textContent = (await page.getTextContent()) as {
        items?: Array<{ str?: string }>;
      };
      if (cancelled || prefetchTokenRef.current !== myToken) return;

      const words: Word[] = [];
      const tokens: string[] = [];
      const items = Array.isArray(textContent.items) ? textContent.items : [];
      for (const it of items) {
        const s = it?.str ?? "";
        if (!s.trim()) continue;
        for (const token of s.split(/\s+/g)) {
          if (!token) continue;
          words.push({ text: token, index: words.length });
          tokens.push(token);
        }
      }

      prefetchedPagesRef.current.add(nextPage);
      onPrefetchPageReady({
        pageNumber: nextPage,
        text: tokens.join(" "),
        words,
      });
    })().catch((err) => {
      console.warn("[PdfViewer] prefetch error", err);
    });

    return () => {
      cancelled = true;
    };
  }, [currentPage, numPages, onPrefetchPageReady]);

  // Render current page: canvas + TextLayer, then measure per-word rects.
  useEffect(() => {
    const doc = pdfRef.current as {
      getPage: (n: number) => Promise<unknown>;
    } | null;
    if (!doc || !canvasRef.current || !textLayerRef.current || currentPage < 1) return;

    const SCALE = 1.4;
    const myToken = ++renderTokenRef.current;
    let cancelled = false;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const page = (await doc.getPage(currentPage)) as {
        getViewport: (args: { scale: number }) => {
          width: number;
          height: number;
          transform: number[];
        };
        getTextContent: () => Promise<unknown>;
        render: (args: {
          canvasContext: CanvasRenderingContext2D;
          viewport: unknown;
        }) => { promise: Promise<void>; cancel: () => void };
      };
      if (cancelled || renderTokenRef.current !== myToken) return;

      const dpr = window.devicePixelRatio || 1;
      const cssViewport = page.getViewport({ scale: SCALE });
      const renderViewport = page.getViewport({ scale: SCALE * dpr });

      // Canvas
      const canvas = canvasRef.current!;
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      const ctx = canvas.getContext("2d")!;
      const task = page.render({ canvasContext: ctx, viewport: renderViewport });
      try {
        await task.promise;
      } catch {
        /* cancelled */
      }
      if (cancelled || renderTokenRef.current !== myToken) return;

      setCanvasSize({ cssW: cssViewport.width, cssH: cssViewport.height });

      // TextLayer — pdf.js builds transparent positioned spans matching the
      // rendered text exactly. We use the DOM it produces to measure words.
      const tlContainer = textLayerRef.current!;
      tlContainer.innerHTML = "";
      tlContainer.style.width = `${cssViewport.width}px`;
      tlContainer.style.height = `${cssViewport.height}px`;
      tlContainer.style.setProperty("--scale-factor", String(SCALE));

      const textContent = await page.getTextContent();
      if (cancelled || renderTokenRef.current !== myToken) return;

      const textLayer = new pdfjs.TextLayer({
        textContentSource: textContent as never,
        container: tlContainer,
        viewport: cssViewport as never,
      });
      await textLayer.render();
      if (cancelled || renderTokenRef.current !== myToken) return;

      // Measure per-word rects via DOM Range — accurate because the browser
      // uses pdf.js's font metrics (including the CSS scaleX fit pdf.js applies).
      const containerRect = tlContainer.getBoundingClientRect();
      const spans = tlContainer.querySelectorAll<HTMLSpanElement>("span");
      const words: Word[] = [];
      const tokens: string[] = [];

      for (const span of spans) {
        const node = span.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        if (!text.trim()) continue;

        let i = 0;
        while (i < text.length) {
          while (i < text.length && /\s/.test(text[i])) i++;
          if (i >= text.length) break;
          const start = i;
          while (i < text.length && !/\s/.test(text[i])) i++;
          const end = i;
          const token = text.slice(start, end);

          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          const rect = range.getBoundingClientRect();

          words.push({
            text: token,
            index: words.length,
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            w: rect.width,
            h: rect.height,
          });
          tokens.push(token);
        }
      }

      setPageWords(words);
      lastScrolledRef.current = -1;
      onPageReady({
        pageNumber: currentPage,
        text: tokens.join(" "),
        words,
      });
    })().catch((err) => {
      console.error("[PdfViewer] render error", err);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pdfRef.current]);

  // Auto-scroll the container to keep active word centered.
  useEffect(() => {
    if (currentWordIndex < 0) return;
    if (currentWordIndex === lastScrolledRef.current) return;
    const el = highlightRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      lastScrolledRef.current = currentWordIndex;
    }
  }, [currentWordIndex]);

  const activeWord =
    currentWordIndex >= 0 && currentWordIndex < pageWords.length
      ? pageWords[currentWordIndex]
      : null;
  const highlightVisible =
    !!activeWord &&
    activeWord.x != null &&
    activeWord.y != null &&
    activeWord.w != null &&
    activeWord.h != null;

  const notesEnabled = !!onNoteAdd;

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between border-b px-4 py-2 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
      >
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="px-3 py-1 rounded disabled:opacity-40"
          style={{ background: "var(--bg)", color: "var(--text-1)", border: "1px solid var(--border)" }}
        >
          ← Prev
        </button>
        <div className="flex items-center gap-2">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= numPages) onPageChange(n);
            }}
            className="w-16 px-2 py-1 rounded border bg-transparent text-center"
            style={{ borderColor: "var(--border)", color: "var(--text-1)" }}
          />
          <span>/ {numPages || "—"}</span>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
          className="px-3 py-1 rounded disabled:opacity-40"
          style={{ background: "var(--bg)", color: "var(--text-1)", border: "1px solid var(--border)" }}
        >
          Next →
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 flex justify-center items-start" style={{ background: "var(--bg)" }}>
        {loading && <div style={{ color: "var(--text-3)" }}>Loading PDF…</div>}
        <div
          ref={pageContainerRef}
          className="relative shadow-lg rounded"
          style={{ width: canvasSize.cssW, height: canvasSize.cssH, background: "var(--surface)" }}
        >
          <canvas ref={canvasRef} className="block rounded" />
          <div
            ref={textLayerRef}
            className="pdf-textlayer"
            aria-hidden="true"
            style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
          />
          <div
            className="pdf-overlay"
            style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
          >
            {pageWords.map((w, i) => {
              if (w.x == null || w.y == null || w.w == null || w.h == null) return null;
              const done = currentWordIndex >= 0 && i < currentWordIndex;
              return (
                <span
                  key={i}
                  className={`pdf-word${done ? " done" : ""}`}
                  style={{ left: w.x, top: w.y, width: w.w, height: w.h }}
                />
              );
            })}
            <div
              ref={highlightRef}
              className={`pdf-highlight${highlightVisible ? " visible" : ""}`}
              style={
                highlightVisible && activeWord
                  ? {
                      left: activeWord.x,
                      top: activeWord.y,
                      width: activeWord.w,
                      height: activeWord.h,
                    }
                  : undefined
              }
            />
          </div>

          {/* Notes interaction layer */}
          {notesEnabled && canvasSize.cssW > 0 && (
            <div
              className="absolute inset-0 pdf-notes-layer"
              style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
            >
              {/* Per-line hover zones */}
              {lines.map((line, i) => {
                const lineH = Math.max(16, line.bottom - line.y);
                const lineNote = (notes ?? []).find((n) => Math.abs(n.lineY - line.y) < 10);
                const isHovered = hoveredLine?.y === line.y;
                return (
                  <div
                    key={i}
                    className="note-hover-zone"
                    style={{ top: line.y, height: lineH }}
                    onMouseEnter={() => { if (!editingLine) setHoveredLine(line); }}
                    >
                    {isHovered && !editingLine && !lineNote && (
                      <button
                        className="note-add-btn"
                        style={{ height: lineH }}
                        onClick={() => openNoteEditor(line)}
                        title="Add note"
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Note markers for lines with existing notes */}
              {(notes ?? []).map((note) => (
                <button
                  key={note.id}
                  className={`note-marker${highlightNoteId === note.id ? " note-marker-highlight" : ""}`}
                  style={{ top: note.lineY }}
                  onClick={() => openExistingNote(note)}
                  title={note.noteText}
                >
                  <FaNotesMedical className="note-marker-icon" />
                </button>
              ))}

              {/* Note editor popover */}
              {editingLine && (
                <div
                  className="note-editor-popover"
                  style={popoverFixedStyle}
                  onMouseEnter={() => setHoveredLine(null)}
                >
                  <div className="note-editor-header">
                    {editingNoteId ? "Edit note" : "Add note"}
                  </div>
                  <textarea
                    ref={noteTextareaRef}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type your note…"
                    className="note-editor-textarea"
                    disabled={isSavingNote}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleSaveNote();
                      if (e.key === "Escape") cancelNote();
                    }}
                  />
                  {noteError && <div className="note-editor-error">{noteError}</div>}
                  <div className="note-editor-actions">
                    {editingNoteId && (
                      <button className="note-btn note-btn-delete" onClick={() => void handleDeleteNote()} disabled={isSavingNote}>
                        Delete
                      </button>
                    )}
                    <button className="note-btn note-btn-cancel" onClick={cancelNote} disabled={isSavingNote}>
                      Cancel
                    </button>
                    <button
                      className="note-btn note-btn-save"
                      onClick={() => void handleSaveNote()}
                      disabled={!noteText.trim() || isSavingNote}
                    >
                      {isSavingNote ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <div className="note-editor-hint">⌘↵ to save · Esc to cancel</div>
                </div>
              )}
            </div>
          )}

          {!loading && pageWords.length === 0 && noTextMessage && (
            <div
              className="absolute inset-0 flex items-center justify-center p-6 text-center"
              style={{ color: "var(--text-3)", background: "color-mix(in srgb, var(--surface) 78%, transparent)" }}
            >
              {noTextMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
