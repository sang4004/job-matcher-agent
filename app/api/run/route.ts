import { NextResponse } from "next/server";
import { getLatestRun, getSettings, setLatestRun } from "@/lib/db/client";
import { dispatchPipeline } from "@/lib/github";
import { isAuthenticated } from "@/lib/session";

const STALE_MINUTES = 45;

export async function POST() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { profile } = await getSettings();
  if (!profile) {
    return NextResponse.json({ error: "프로필이 없습니다. 설정에서 '프로필 갱신'을 먼저 실행하세요." }, { status: 400 });
  }

  const run = await getLatestRun();
  const active = run && (run.status === "queued" || run.status === "running");
  const fresh = run && Date.now() - run.startedAt.getTime() < STALE_MINUTES * 60_000;
  if (active && fresh) {
    return NextResponse.json({ error: "이미 실행 중입니다." }, { status: 409 });
  }

  await setLatestRun({ status: "queued", message: "GitHub Actions 대기 중", stats: null, startedAt: new Date(), finishedAt: null });
  try {
    await dispatchPipeline();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setLatestRun({ status: "failed", message, startedAt: new Date(), finishedAt: new Date() });
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
