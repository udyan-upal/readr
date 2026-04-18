"use client";

import { useMemo } from "react";
import type { Voice } from "@/types";

interface Props {
  voices: Voice[];
  value: string;
  onChange: (shortName: string) => void;
}

export default function VoiceSelector({ voices, value, onChange }: Props) {
  const grouped = useMemo(() => {
    const byLocale = new Map<string, Voice[]>();
    for (const v of voices) {
      const arr = byLocale.get(v.locale) ?? [];
      arr.push(v);
      byLocale.set(v.locale, arr);
    }
    return Array.from(byLocale.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [voices]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
    >
      {grouped.map(([locale, list]) => (
        <optgroup key={locale} label={locale}>
          {list.map((v) => (
            <option key={v.shortName} value={v.shortName}>
              {v.friendlyName} ({v.gender.charAt(0) || "?"})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
