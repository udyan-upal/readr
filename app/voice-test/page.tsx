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
  const playLockedRef = useRef(false);
  const playRequestIdRef = useRef(0);

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
  const selectedVoice = voices.find((v) => v.shortName === voice);
  const selectedRate = RATES.find((r) => r.value === rate)?.label ?? "1×";

  async function play() {
    if (playLockedRef.current) return;
    if (!text.trim()) return;
    playLockedRef.current = true;
    const requestId = ++playRequestIdRef.current;
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
      if (requestId !== playRequestIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (requestId !== playRequestIdRef.current) return;
        playLockedRef.current = false;
        setLoading(false);
      };
      audio.onerror = () => {
        if (requestId !== playRequestIdRef.current) return;
        setError("Playback error");
        playLockedRef.current = false;
        setLoading(false);
      };
      await audio.play();

      setLog((prev) => [{ voice, rate, ms: Date.now() - t0 }, ...prev].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
      playLockedRef.current = false;
      setLoading(false);
    }
  }

  function stop() {
    playRequestIdRef.current += 1;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    playLockedRef.current = false;
    setLoading(false);
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 16 }}>
        <section style={{ flex: "1 1 300px", minWidth: 0, padding: 1, borderRadius: 18, background: "linear-gradient(135deg, rgba(129,140,248,0.55), rgba(59,59,183,0.18), rgba(255,255,255,0.08))", boxShadow: "0 22px 60px rgba(0,0,0,0.35)" }}>
          <div style={{ minHeight: "100%", padding: 16, borderRadius: 17, background: "linear-gradient(180deg, rgba(31,31,42,0.96), rgba(18,18,24,0.96))", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Voice</div>
                <div style={{ fontSize: 14, color: "#f5f5f7", fontWeight: 700 }}>Narrator</div>
              </div>
              <span style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 999, background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.28)", color: "#c7d2fe", fontSize: 11 }}>
                {voicesLoading ? "Loading" : selectedVoice?.locale ?? "Voice"}
              </span>
            </div>

            <div style={{ position: "relative" }}>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                disabled={voicesLoading}
                style={{ width: "100%", appearance: "none", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: voicesLoading ? "#666" : "#f3f4f6", fontSize: 13, padding: "13px 42px 13px 14px", fontFamily: "inherit", outline: "none", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", cursor: voicesLoading ? "wait" : "pointer" }}
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
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#a5b4fc", pointerEvents: "none", fontSize: 14 }}>⌄</span>
            </div>

            <div style={{ marginTop: 11, color: "#8f8fa3", fontSize: 11, lineHeight: 1.5, minHeight: 34 }}>
              {selectedVoice ? `${selectedVoice.gender} voice · ${selectedVoice.shortName}` : "Pick voice for preview playback."}
            </div>
          </div>
        </section>

        <section style={{ flex: "1 1 300px", minWidth: 0, padding: 1, borderRadius: 18, background: "linear-gradient(135deg, rgba(34,197,94,0.42), rgba(59,59,183,0.22), rgba(255,255,255,0.08))", boxShadow: "0 22px 60px rgba(0,0,0,0.35)" }}>
          <div style={{ minHeight: "100%", padding: 16, borderRadius: 17, background: "linear-gradient(180deg, rgba(25,28,26,0.96), rgba(16,18,17,0.96))", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "#777", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Speed</div>
                <div style={{ fontSize: 14, color: "#f5f5f7", fontWeight: 700 }}>Playback pace</div>
              </div>
              <span style={{ flexShrink: 0, minWidth: 46, textAlign: "center", padding: "6px 10px", borderRadius: 999, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", color: "#bbf7d0", fontSize: 12, fontWeight: 700 }}>
                {selectedRate}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 5, padding: 5, borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 10px rgba(0,0,0,0.25)" }}>
              {RATES.map((r) => {
                const active = rate === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRate(r.value)}
                    aria-pressed={active}
                    style={{ minWidth: 0, padding: "10px 0", border: active ? "1px solid rgba(187,247,208,0.38)" : "1px solid transparent", borderRadius: 12, background: active ? "linear-gradient(135deg, #22c55e, #3B3BB7)" : "transparent", color: active ? "#fff" : "#8f8fa3", fontSize: 11, fontWeight: active ? 800 : 500, cursor: "pointer", fontFamily: "inherit", boxShadow: active ? "0 10px 24px rgba(34,197,94,0.18)" : "none", transition: "background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s" }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 11, color: "#8f8fa3", fontSize: 11, lineHeight: 1.5 }}>
              Rate sent to TTS engine. Audio + word timings match chosen pace.
            </div>
          </div>
        </section>
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
