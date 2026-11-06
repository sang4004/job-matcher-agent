import { NextResponse, type NextRequest } from "next/server";
import { refreshProfile } from "@/lib/profile/build";
import { isAuthenticated } from "@/lib/session";

// Notion 동기화 + Flash 태깅 + Pro 프로필 정제까지 한 번에 처리
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = request.nextUrl.searchParams.get("force") === "1";
  try {
    const r = await refreshProfile({ force });
    return NextResponse.json({
      ok: true,
      totalPages: r.totalPages,
      changedPages: r.changedPageIds.length,
      evidenceRebuilt: r.evidenceRebuilt,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
