"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileRefreshButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(force: boolean) {
    setPending(true);
    setMessage("Notion 동기화와 프로필 정제 중… (1~3분)");
    const res = await fetch(`/api/profile/refresh${force ? "?force=1" : ""}`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      totalPages?: number;
      changedPages?: number;
      evidenceRebuilt?: number;
    };
    setPending(false);
    setMessage(
      res.ok
        ? `완료: Notion ${data.totalPages}개 중 ${data.changedPages}개 갱신, 근거 사례 ${data.evidenceRebuilt}개 재생성`
        : `실패: ${data.error ?? res.status}`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => refresh(false)} disabled={pending} className="btn-primary">
        프로필 갱신
      </button>
      <button onClick={() => refresh(true)} disabled={pending} className="btn-ghost" title="모든 Notion 페이지를 다시 받아옴">
        전체 다시 받기
      </button>
      {message && <p className="w-full text-sm text-neutral-500">{message}</p>}
    </div>
  );
}
