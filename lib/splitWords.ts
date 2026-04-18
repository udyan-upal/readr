import type { Word } from "@/types";

export function splitWords(text: string): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.map((t, i) => ({ text: t, index: i }));
}

// Chunk long text by sentence to keep TTS requests tractable.
export function chunkBySentences(text: string, maxChars = 3000): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?\s*/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > maxChars && cur) {
      chunks.push(cur);
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}
