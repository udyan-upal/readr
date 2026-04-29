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
  const selectedVoice = READER_VOICES.find((v) => v.value === voice)?.label ?? "Voice";
  const selectedRate = RATES.find((r) => r.value === rate)?.label ?? "1×";

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "linear-gradient(180deg, rgba(255,255,255,0.92), var(--surface))", padding: "8px 20px 10px", flexShrink: 0, boxShadow: "0 -18px 45px rgba(24,24,40,0.08)" }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-h))", borderRadius: 99, transition: "width 150ms linear" }} />
      </div>

      {/* Three-column layout: left controls | center transport | right controls */}
      <div className="player-controls-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: 12 }}>

        {/* LEFT — Voice */}
        <div className="control-card voice-card">
          <div className="control-card-head">
            <span className="control-kicker">Voice</span>
            <span className="control-value">{selectedVoice}</span>
          </div>
          <div className="voice-chip-row" role="group" aria-label="Voice">
            {READER_VOICES.map((v) => {
              const active = voice === v.value;
              return (
              <button
                key={v.value}
                type="button"
                onClick={() => onVoiceChange(v.value)}
                className={`voice-chip${active ? " is-active" : ""}`}
                aria-pressed={active}
              >
                <span className="voice-dot">{v.label[0]}</span>
                <span>{v.label}</span>
              </button>
              );
            })}
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
        <div className="control-card speed-card">
          <div className="control-card-head">
            <span className="control-kicker">Speed</span>
            <span className="control-value speed-value">{selectedRate}</span>
          </div>
          <div className="speed-rail" role="group" aria-label="Speed">
            {RATES.map((r) => {
              const active = rate === r.value;
              return (
              <button
                key={r.value}
                type="button"
                onClick={() => onRateChange(r.value)}
                className={`speed-chip${active ? " is-active" : ""}`}
                aria-pressed={active}
              >
                {r.label}
              </button>
              );
            })}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .control-card {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          padding: 7px;
          border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(245,246,255,0.72));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 24px rgba(40,40,80,0.08);
        }

        .speed-card { justify-content: flex-end; }

        .control-card-head {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 56px;
        }

        .speed-card .control-card-head { align-items: flex-end; }

        .control-kicker {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-3);
          line-height: 1;
        }

        .control-value {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-1);
          line-height: 1.25;
          white-space: nowrap;
        }

        .speed-value { color: var(--accent); }

        .voice-chip-row,
        .speed-rail {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          padding: 4px;
          border-radius: 12px;
          background: color-mix(in srgb, var(--bg) 82%, white);
          border: 1px solid var(--border-subtle);
        }

        .voice-chip,
        .speed-chip {
          border: 0;
          cursor: pointer;
          font-family: inherit;
          border-radius: 10px;
          color: var(--text-2);
          background: transparent;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s;
        }

        .voice-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px 4px 4px;
          font-size: 12px;
          font-weight: 700;
        }

        .voice-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--surface);
          color: var(--text-3);
          font-size: 11px;
          font-weight: 800;
          box-shadow: inset 0 0 0 1px var(--border-subtle);
        }

        .speed-chip {
          min-width: 42px;
          padding: 7px 9px;
          font-size: 12px;
          font-weight: 800;
        }

        .voice-chip:hover,
        .speed-chip:hover {
          color: var(--text-1);
          background: rgba(59,59,183,0.07);
        }

        .voice-chip.is-active,
        .speed-chip.is-active {
          color: #fff;
          background: linear-gradient(135deg, var(--accent), var(--accent-h));
          box-shadow: 0 8px 18px rgba(59,59,183,0.25);
        }

        .voice-chip.is-active .voice-dot {
          background: rgba(255,255,255,0.2);
          color: #fff;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.24);
        }

        @media (max-width: 860px) {
          .player-controls-grid {
            grid-template-columns: 1fr;
            justify-items: stretch;
          }

          .player-controls-grid > div:nth-child(2) {
            justify-content: center;
            order: -1;
          }

          .control-card,
          .speed-card {
            justify-content: space-between;
          }

          .speed-card .control-card-head { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
