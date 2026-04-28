"use client";

const READER_VOICES = [
  { label: "Ava",   value: "en-US-AvaNeural" },
  { label: "Chris", value: "en-US-ChristopherNeural" },
  { label: "Emma",  value: "en-US-EmmaNeural" },
];

interface Props {
  voice: string;
  onVoiceChange: (v: string) => void;
  rate: string;
  onRateChange: (r: string) => void;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  progress: number;
  error: string | null;
  onRetry: () => void;
}

const RATES = [
  { label: "0.5×", value: "-50%" },
  { label: "1×",   value: "+0%" },
  { label: "1.5×", value: "+50%" },
  { label: "2×",   value: "+100%" },
];

const btnBase: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", cursor: "pointer", fontFamily: "inherit",
  transition: "background 0.15s, box-shadow 0.15s, color 0.15s",
};

export default function PlayerControls({
  voice, onVoiceChange,
  rate, onRateChange,
  isPlaying, isLoading,
  onPlay, onPause, onStop,
  progress, error, onRetry,
}: Props) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", padding: "8px 20px 10px", flexShrink: 0 }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-h))", borderRadius: 99, transition: "width 150ms linear" }} />
      </div>

      {/* Three-column layout: left controls | center transport | right controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>

        {/* LEFT — Voice */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap" }}>Voice</span>
          <div style={{ display: "flex", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg)" }}>
            {READER_VOICES.map((v, i) => (
              <button
                key={v.value}
                type="button"
                onClick={() => onVoiceChange(v.value)}
                style={{
                  padding: "4px 10px",
                  border: "none",
                  borderRight: i < READER_VOICES.length - 1 ? "1px solid var(--border)" : "none",
                  background: voice === v.value ? "var(--accent)" : "transparent",
                  color: voice === v.value ? "#fff" : "var(--text-2)",
                  fontSize: 12,
                  fontWeight: voice === v.value ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s",
                  minWidth: 40,
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER — Play/Pause + Stop */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Play / Pause */}
          {!isPlaying ? (
            <button
              type="button"
              onClick={onPlay}
              disabled={isLoading}
              style={{
                ...btnBase,
                width: 44, height: 44,
                borderRadius: "50%",
                background: isLoading ? "var(--accent-s)" : "var(--accent)",
                color: isLoading ? "var(--accent)" : "#fff",
                boxShadow: isLoading ? "none" : "0 4px 14px rgba(59,59,183,0.35)",
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!isLoading) { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-h)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 18px rgba(59,59,183,0.45)"; } }}
              onMouseLeave={(e) => { if (!isLoading) { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(59,59,183,0.35)"; } }}
              title="Play"
            >
              {isLoading ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 28" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" style={{ marginLeft: 2 }}>
                  <path d="M3 2.5l10 5-10 5V2.5z"/>
                </svg>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              style={{
                ...btnBase,
                width: 44, height: 44,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "#fff",
                boxShadow: "0 4px 14px rgba(59,59,183,0.35)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-h)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
              title="Pause"
            >
              <svg width="13" height="14" viewBox="0 0 13 14" fill="currentColor">
                <rect x="0" y="0" width="4.5" height="14" rx="1.5"/>
                <rect x="8.5" y="0" width="4.5" height="14" rx="1.5"/>
              </svg>
            </button>
          )}

          {/* Stop */}
          <button
            type="button"
            onClick={onStop}
            style={{
              ...btnBase,
              width: 34, height: 34,
              borderRadius: "50%",
              background: "var(--bg)",
              color: "var(--text-2)",
              border: "1.5px solid var(--border)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--border-subtle)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; }}
            title="Stop"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect width="10" height="10" rx="2"/>
            </svg>
          </button>
        </div>

        {/* RIGHT — Speed */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>Speed</span>
          <div style={{ display: "flex", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg)" }}>
            {RATES.map((r, i) => (
              <button
                key={r.value}
                type="button"
                onClick={() => onRateChange(r.value)}
                style={{
                  padding: "4px 9px",
                  border: "none",
                  borderRight: i < RATES.length - 1 ? "1px solid var(--border)" : "none",
                  background: rate === r.value ? "var(--accent)" : "transparent",
                  color: rate === r.value ? "#fff" : "var(--text-2)",
                  fontSize: 12,
                  fontWeight: rate === r.value ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s",
                  minWidth: 36,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5"/>
            <path d="M8 5v4" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.7" fill="var(--danger)"/>
          </svg>
          <span style={{ fontSize: 12.5, color: "var(--danger)", flex: 1 }}>{error}</span>
          <button type="button" onClick={onRetry} style={{ padding: "3px 10px", borderRadius: 6, border: "1.5px solid var(--danger)", background: "transparent", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Retry
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
