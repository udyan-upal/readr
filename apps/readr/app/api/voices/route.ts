import { NextResponse } from "next/server";
import { MsEdgeTTS } from "msedge-tts";
import { VOICES as FALLBACK_VOICES } from "@/lib/voices";
import type { Voice } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache upstream response per server process — list is large (~400 voices)
// and doesn't change often, so refetch every ~24h.
let cache: { voices: Voice[]; ts: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

function mapUpstream(v: {
  ShortName: string;
  FriendlyName: string;
  Gender: string;
  Locale: string;
  Status?: string;
}): Voice {
  return {
    shortName: v.ShortName,
    friendlyName: v.FriendlyName,
    gender: v.Gender,
    locale: v.Locale,
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return NextResponse.json({ voices: cache.voices, source: "cache" });
  }

  try {
    const tts = new MsEdgeTTS();
    const upstream = await tts.getVoices();
    tts.close();
    const voices = upstream
      .map(mapUpstream)
      .filter((v) => v.shortName && v.locale)
      .sort((a, b) => a.locale.localeCompare(b.locale) || a.shortName.localeCompare(b.shortName));
    cache = { voices, ts: now };
    return NextResponse.json({ voices, source: "upstream" });
  } catch (err) {
    console.error("[/api/voices] upstream fetch failed", err);
    // Fall back to curated static list so UI isn't empty.
    return NextResponse.json(
      { voices: FALLBACK_VOICES, source: "fallback", error: (err as Error).message },
      { status: 200 },
    );
  }
}
