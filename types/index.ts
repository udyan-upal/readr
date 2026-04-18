export interface Word {
  text: string;
  index: number;
  offsetMs?: number;
  durationMs?: number;
}

export interface WordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
  words: Word[];
}

export interface Voice {
  shortName: string;
  friendlyName: string;
  gender: "Male" | "Female";
  locale: string;
}

export interface TtsResponse {
  audio: string;
  boundaries: WordBoundary[];
}
