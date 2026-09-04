import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  const [{ data: storageFiles, error }, { data: sessions }] = await Promise.all([
    supabase.storage.from("pdfs").list(userId, { sortBy: { column: "created_at", order: "desc" } }),
    supabase
      .from("reading_sessions")
      .select("pdf_path, current_page, word_index, voice, rate, updated_at")
      .eq("user_id", userId),
  ]);

  if (error) {
    console.error("[list-pdfs] Supabase error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const sessionMap = Object.fromEntries(
    (sessions ?? []).map((s) => [s.pdf_path as string, s]),
  );

  const files = await Promise.all(
    (storageFiles ?? []).map(async (f) => {
      const path = `${userId}/${f.name}`;
      const { data: urlData } = await supabase.storage
        .from("pdfs")
        .createSignedUrl(path, 3600);
      const displayName = f.name.replace(/^\d+-/, "");
      const session = sessionMap[path];
      return {
        name: displayName,
        path,
        url: urlData?.signedUrl ?? "",
        createdAt: f.created_at ?? "",
        lastPage: (session?.current_page as number) ?? null,
        wordIndex: (session?.word_index as number) ?? null,
        voice: (session?.voice as string) ?? null,
        rate: (session?.rate as string) ?? null,
      };
    }),
  );

  return Response.json({ files });
}
