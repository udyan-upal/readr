"use client";

import { useEffect, useRef, useState } from "react";
import type { PageText } from "@/types";
import { splitWords } from "@/lib/splitWords";

interface Props {
  file: File | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onTextExtracted: (pages: PageText[]) => void;
}

// PDF.js is imported dynamically so it only loads on the client.
export default function PdfViewer({
  file,
  currentPage,
  onPageChange,
  onTextExtracted,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const pdfRef = useRef<unknown>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    if (!file) {
      pdfRef.current = null;
      setNumPages(0);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Worker from CDN matching the version of pdfjs-dist we installed.
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      if (cancelled) return;
      pdfRef.current = doc;
      setNumPages(doc.numPages);

      // Extract text for all pages upfront.
      const pages: PageText[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((it) => ("str" in it ? (it as { str: string }).str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.push({ pageNumber: i, text, words: splitWords(text) });
      }
      if (cancelled) return;
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

  useEffect(() => {
    const doc = pdfRef.current as {
      getPage: (n: number) => Promise<{
        getViewport: (args: { scale: number }) => { width: number; height: number };
        render: (args: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
      }>;
    } | null;
    if (!doc || !canvasRef.current || currentPage < 1) return;

    let cancelled = false;
    (async () => {
      const page = await doc.getPage(currentPage);
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: 1.4 * dpr });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        // Cancelled render — ignore.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage]);

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
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-4 flex justify-center">
        {loading && <div className="text-gray-500">Loading PDF…</div>}
        <canvas ref={canvasRef} className="shadow rounded bg-white" />
      </div>
    </div>
  );
}
