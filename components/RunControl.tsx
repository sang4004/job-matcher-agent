"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = "queued" | "running" | "done" | "failed" | null;

/** 분석 실행 버튼 + 실행 중이면 10초마다 상태 확인 후 화면 새로고침 */
export function RunControl({ initialStatus, hasProfile }: { initialStatus: Status; hasProfile: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = status === "queued" || status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status: Status };
      setStatus(data.status);
      router.refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [active, router]);

  async function run() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/run", { method: "POST" });
    setPending(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "실행 요청에 실패했습니다.");
      return;
    }
    setStatus("queued");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={run} disabled={pending || active || !hasProfile} className="btn-primary">
        {active ? "분석 진행 중…" : pending ? "요청 중…" : "새로 분석하기"}
      </button>
      {!hasProfile && <p className="text-xs text-neutral-500">설정에서 프로필을 먼저 만들어주세요.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
