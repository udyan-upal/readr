import type { Word, WordBoundary } from "@/types";

// Normalize for matching: lowercase, strip punctuation.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Two-pointer align. TTS boundaries may merge/split versus whitespace-split words
 * (contractions, punctuation, hyphenation). Attach timing to the first rendered
 * word that matches; interpolate duration across merged words when possible.
 */
export function alignBoundaries(
  rendered: Word[],
  boundaries: WordBoundary[],
): Word[] {
  const out = rendered.map((w) => ({ ...w }));
  let ri = 0;
  let bi = 0;
  let mismatches = 0;

  while (ri < out.length && bi < boundaries.length) {
    const rTxt = norm(out[ri].text);
    const bTxt = norm(boundaries[bi].text);
    if (!rTxt) {
      ri++;
      continue;
    }
    if (!bTxt) {
      bi++;
      continue;
    }

    if (rTxt === bTxt) {
      out[ri].offsetMs = boundaries[bi].offsetMs;
      out[ri].durationMs = boundaries[bi].durationMs;
      ri++;
      bi++;
    } else if (bTxt.startsWith(rTxt)) {
      // Boundary covers multiple rendered words. Group them.
      const startRi = ri;
      let acc = "";
      const group: number[] = [];
      while (ri < out.length && acc.length < bTxt.length) {
        acc += norm(out[ri].text);
        group.push(ri);
        ri++;
      }
      const total = boundaries[bi].durationMs;
      const per = total / Math.max(group.length, 1);
      group.forEach((gi, k) => {
        out[gi].offsetMs = boundaries[bi].offsetMs + k * per;
        out[gi].durationMs = per;
      });
      bi++;
      if (norm(group.map((g) => out[g].text).join("")) !== bTxt) mismatches++;
      void startRi;
    } else if (rTxt.startsWith(bTxt)) {
      // Rendered word spans multiple boundaries. Take first boundary's offset.
      out[ri].offsetMs = boundaries[bi].offsetMs;
      let dur = 0;
      let acc = "";
      while (bi < boundaries.length && acc.length < rTxt.length) {
        acc += norm(boundaries[bi].text);
        dur += boundaries[bi].durationMs;
        bi++;
      }
      out[ri].durationMs = dur;
      ri++;
    } else {
      mismatches++;
      bi++;
    }
  }

  if (mismatches > 0 && typeof console !== "undefined") {
    console.warn(`[alignBoundaries] ${mismatches} mismatches`);
  }
  return out;
}
