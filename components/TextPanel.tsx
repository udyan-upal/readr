"use client";

import { useEffect, useRef } from "react";
import type { Word } from "@/types";

interface Props {
  words: Word[];
  currentWordIndex: number;
  emptyMessage?: string;
}

export default function TextPanel({ words, currentWordIndex, emptyMessage }: Props) {
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastScrolledRef = useRef(-1);

  useEffect(() => {
    if (currentWordIndex < 0) return;
    if (currentWordIndex === lastScrolledRef.current) return;
    const el = spanRefs.current[currentWordIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      lastScrolledRef.current = currentWordIndex;
    }
  }, [currentWordIndex]);

  if (!words.length) {
    return (
      <div className="p-6 text-gray-500 text-center">
        {emptyMessage ?? "No text on this page"}
      </div>
    );
  }

  return (
    <div className="p-6 leading-relaxed text-lg">
      {words.map((w, i) => {
        const state =
          i === currentWordIndex
            ? "bg-yellow-200 dark:bg-yellow-700 dark:text-white rounded px-0.5 transition-colors"
            : i < currentWordIndex
              ? "text-gray-400 dark:text-gray-600"
              : "";
        return (
          <span
            key={i}
            ref={(el) => {
              spanRefs.current[i] = el;
            }}
            className={state}
          >
            {w.text}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}
