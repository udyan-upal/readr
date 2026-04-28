"use client";

import { useState, useRef, useEffect } from "react";
import type { Voice } from "@/types";

const RATES = [
  { label: "0.5×", value: "-50%" },
  { label: "0.75×", value: "-25%" },
  { label: "1×", value: "+0%" },
  { label: "1.25×", value: "+25%" },
  { label: "1.5×", value: "+50%" },
  { label: "2×", value: "+100%" },
];

const DEFAULT_TEXT = "The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle.";

export default function VoiceTestPage() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [voice, setVoice] = useState("en-US-AriaNeural");
  const [rate, setRate] = useState("+0%");
  const [loading, setLoading] = useState(false);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [log, setLog] = useState<{ voice: string; rate: string; ms: number }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d: { voices: Voice[] }) => { if (Array.isArray(d.voices)) setVoices(d.voices); })
      .catch(() => {})
      .finally(() => setVoicesLoading(false));
  }, []);

  const grouped = voices.reduce<Record<string, Voice[]>>((acc, v) => {
    (acc[v.locale] ??= []).push(v);
    return acc;
  }, {});

  async function play() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

    const t0 = Date.now();
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { audio: string };
      const bin = atob(data.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setLoading(false);
      audio.onerror = () => { setError("Playback error"); setLoading(false); };
      await audio.play();

      setLog((prev) => [{ voice, rate, ms: Date.now() - t0 }, ...prev].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "monospace", padding: "32px 24px", maxWidth: 780, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#fff" }}>Voice Test</h1>
      <p style={{ fontSize: 12, color: "#555", marginBottom: 28 }}>
        Dev tool — not linked from UI
        {!voicesLoading && <span style={{ color: "#3B3BB7", marginLeft: 8 }}>{voices.length} voices loaded</span>}
      </p>

      {/* Text */}
      <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Text</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#e5e5e5", fontSize: 13, padding: "10px 12px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {/* Voice */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={voicesLoading}
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: voicesLoading ? "#555" : "#e5e5e5", fontSize: 13, padding: "8px 10px", fontFamily: "inherit", outline: "none" }}
          >
            {voicesLoading
              ? <option>Loading voices…</option>
              : Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([locale, list]) => (
                  <optgroup key={locale} label={locale}>
                    {list.map((v) => (
                      <option key={v.shortName} value={v.shortName}>{v.friendlyName}</option>
                    ))}
                  </optgroup>
                ))
            }
          </select>
        </div>

        {/* Rate */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rate</label>
          <div style={{ display: "flex", gap: 4 }}>
            {RATES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRate(r.value)}
                style={{ flex: 1, padding: "7px 0", border: "1px solid #333", borderRadius: 5, background: rate === r.value ? "#3B3BB7" : "#1a1a1a", color: rate === r.value ? "#fff" : "#888", fontSize: 11, fontWeight: rate === r.value ? 600 : 400, cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s" }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={() => void play()}
          disabled={loading || !text.trim()}
          style={{ padding: "10px 24px", background: loading ? "#2a2a6a" : "#3B3BB7", color: loading ? "#9999dd" : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
        >
          {loading ? "Loading…" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={stop}
          style={{ padding: "10px 18px", background: "#1a1a1a", color: "#888", border: "1px solid #333", borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          ■ Stop
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: "#2a0a0a", border: "1px solid #5a1a1a", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Recent plays</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#555", textAlign: "left" }}>
                <th style={{ padding: "4px 8px", fontWeight: 500 }}>Voice</th>
                <th style={{ padding: "4px 8px", fontWeight: 500 }}>Rate</th>
                <th style={{ padding: "4px 8px", fontWeight: 500 }}>Latency</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry, i) => (
                <tr key={i} style={{ borderTop: "1px solid #222" }}>
                  <td style={{ padding: "6px 8px", color: "#ccc" }}>{entry.voice}</td>
                  <td style={{ padding: "6px 8px", color: "#ccc" }}>{entry.rate}</td>
                  <td style={{ padding: "6px 8px", color: i === 0 ? "#4ade80" : "#666" }}>{entry.ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
