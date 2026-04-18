import { NextResponse } from "next/server";
import { VOICES } from "@/lib/voices";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ voices: VOICES });
}
