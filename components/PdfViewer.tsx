"use client";

import { useEffect, useRef, useState } from "react";
import type { PageText, Word } from "@/types";

interface Props {
  file: File | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onTextExtracted: (pages: PageText[]) => void;
  currentWordIndex: number;
  noTextMessage?: string | null;
}

interface CanvasSize {
  cssW: number;
  cssH: number;
}

// PDF.js imported dynamically — it's a client-only lib w/ a worker.
export default function PdfViewer({
  file,
  currentPage,
  onPageChange,
  onTextExtracted,
  currentWordIndex,
  noTextMessage,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageWords, setPageWords] = useState<Word[]>([]);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ cssW: 0, cssH: 0 });

  const pdfRef = useRef<unknown>(null);
  const pagesRef = useRef<PageText[]>([]);
  const lastScrolledRef = useRef(-1);

  // Load PDF + extract text (with positions) for every page once.
  useEffect(() => {
    if (!file) {
      pdfRef.current = null;
      pagesRef.current = [];
      setNumPages(0);
      setPageWords([]);
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

      const SCALE = 1.4;
      const pages: PageText[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: SCALE });
        const content = await page.getTextContent();

        const words: Word[] = [];
        const fullTextParts: string[] = [];
        let wordIdx = 0;

        for (const raw of content.items) {
          const it = raw as {
            str: string;
            width: number;
            height: number;
            transform: number[];
            hasEOL?: boolean;
          };
          if (!("str" in it)) continue;
          const str = it.str;
          if (!str) continue;

          // Transform the text item matrix into viewport space.
          const m = pdfjs.Util.transform(viewport.transform, it.transform) as number[];
          const fontHeight = Math.hypot(m[2], m[3]);
          const x0 = m[4];
          const yBaseline = m[5];
          const totalW = it.width * SCALE;

          // Approximate per-char width; fine for latin scripts, drifts on CJK.
          const charW = totalW / Math.max(str.length, 1);

          let ci = 0;
          while (ci < str.length) {
            while (ci < str.length && /\s/.test(str[ci])) ci++;
            if (ci >= str.length) break;
            const start = ci;
            while (ci < str.length && !/\s/.test(str[ci])) ci++;
            const token = str.slice(start, ci);

            const xLocal = start * charW;
            const wLocal = (ci - start) * charW;
            words.push({
              text: token,
              index: wordIdx++,
              x: x0 + xLocal,
              y: yBaseline - fontHeight,
              w: wLocal,
              h: fontHeight,
            });
            fullTextParts.push(token);
          }
        }

        pages.push({
          pageNumber: i,
          text: fullTextParts.join(" "),
          words,
        });
      }
      if (cancelled) return;
      pagesRef.current = pages;
      onTextExtracted(pages);
      onPageChange(1);
      setLoading(false);
    })().catch((err) => {
      console.error("[PdfViewer] load error", err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Render current page to canvas + set overlay size.
  useEffect(() => {
    const doc = pdfRef.current as {
      getPage: (n: number) => Promise<{
        getViewport: (args: { scale: number }) => {
          width: number;
          height: number;
        };
        render: (args: {
          canvasContext: CanvasRenderingContext2D;
          viewport: unknown;
        }) => { promise: Promise<void>; cancel: () => void };
      }>;
    } | null;
    if (!doc || !canvasRef.current || currentPage < 1) return;

    const SCALE = 1.4;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(currentPage);
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const cssViewport = page.getViewport({ scale: SCALE });
      const renderViewport = page.getViewport({ scale: SCALE * dpr });

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
      if (cancelled) return;

      setCanvasSize({ cssW: cssViewport.width, cssH: cssViewport.height });
      const pt = pagesRef.current.find((p) => p.pageNumber === currentPage);
      setPageWords(pt?.words ?? []);
      lastScrolledRef.current = -1;
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  // Auto-scroll using the highlight element as anchor.
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
    !!activeWord && activeWord.x != null && activeWord.y != null && activeWord.w != null && activeWord.h != null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-2 text-sm">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 disabled:opacity-40"
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
            className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent text-center"
          />
          <span>/ {numPages || "—"}</span>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
          className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-6 flex justify-center items-start"
      >
        {loading && <div className="text-gray-500">Loading PDF…</div>}
        <div
          className="relative shadow-lg rounded bg-white"
          style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
        >
          <canvas ref={canvasRef} className="block rounded" />
          <div
            className="pdf-overlay"
            style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
          >
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
          {!loading && pageWords.length === 0 && noTextMessage && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-gray-500 bg-white/70 dark:bg-black/50">
              {noTextMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
