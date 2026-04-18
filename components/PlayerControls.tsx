"use client";

import type { Voice } from "@/types";
import VoiceSelector from "./VoiceSelector";

interface Props {
  voices: Voice[];
  voice: string;
  onVoiceChange: (v: string) => void;
  rate: string;
  onRateChange: (r: string) => void;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  progress: number; // 0..1
  error: string | null;
  onRetry: () => void;
}

const RATES: Array<{ label: string; value: string }> = [
  { label: "0.5x", value: "-50%" },
  { label: "0.75x", value: "-25%" },
  { label: "1x", value: "+0%" },
  { label: "1.25x", value: "+25%" },
  { label: "1.5x", value: "+50%" },
  { label: "2x", value: "+100%" },
];

export default function PlayerControls({
  voices,
  voice,
  onVoiceChange,
  rate,
  onRateChange,
  isPlaying,
  isLoading,
  onPlay,
  onPause,
  onStop,
  progress,
  error,
  onRetry,
}: Props) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 sticky bottom-0">
      <div className="flex flex-wrap items-center gap-3">
        {!isPlaying ? (
          <button
            type="button"
            onClick={onPlay}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {isLoading ? "Loading…" : "▶ Play"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
          >
            ⏸ Pause
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
        >
          ⏹ Stop
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Voice</span>
          <VoiceSelector voices={voices} value={voice} onChange={onVoiceChange} />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Speed</span>
          <select
            value={rate}
            onChange={(e) => onRateChange(e.target.value)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          >
            {RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="px-2 py-0.5 rounded bg-red-600 text-white text-xs"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
