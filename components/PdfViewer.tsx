"use client";

import { useEffect, useRef, useState } from "react";
import type { PageText, Word } from "@/types";

interface Props {
  file: File | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageReady: (page: PageText) => void;
  onLoad: (numPages: number) => void;
  currentWordIndex: number;
  noTextMessage?: string | null;
}

interface CanvasSize {
  cssW: number;
  cssH: number;
}

// PDF.js is imported dynamically — it's a client-only lib w/ a worker.
export default function PdfViewer({
  file,
  currentPage,
  onPageChange,
  onPageReady,
  onLoad,
  currentWordIndex,
  noTextMessage,
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

  // Load PDF.
  useEffect(() => {
    if (!file) {
      pdfRef.current = null;
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
      onLoad(doc.numPages);
      setLoading(false);
      onPageChange(1);
    })().catch((err) => {
      console.error("[PdfViewer] load error", err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

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

      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-6 flex justify-center items-start">
        {loading && <div className="text-gray-500">Loading PDF…</div>}
        <div
          className="relative shadow-lg rounded bg-white"
          style={{ width: canvasSize.cssW, height: canvasSize.cssH }}
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
