import { asc } from "drizzle-orm";
import { Nav } from "@/components/Nav";
import { RecommendationCard } from "@/components/RecommendationCard";
import { RunControl } from "@/components/RunControl";
import { db, getLatestRun, getSettings, schema } from "@/lib/db/client";
import { requireAuth } from "@/lib/session";
import { SITE_LABEL, type Site } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { queued: "대기 중", running: "실행 중", done: "완료", failed: "실패" } as const;

function formatDate(d: Date | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(d);
}

export default async function Home() {
  await requireAuth();
  const [settings, run, recs] = await Promise.all([
    getSettings(),
    getLatestRun(),
    db().select().from(schema.recommendations).orderBy(asc(schema.recommendations.rank)),
  ]);
  const stats = run?.stats;

  return (
    <>
      <Nav current="home" />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <section className="card flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold">
              마지막 실행:{" "}
              <span className={run?.status === "failed" ? "text-red-600" : ""}>
                {run ? STATUS_LABEL[run.status] : "아직 없음"}
              </span>
            </h2>
            {run && (
              <p className="text-sm text-neutral-500">
                {formatDate(run.startedAt)} 시작{run.finishedAt && ` · ${formatDate(run.finishedAt)} 종료`}
                {run.message && ` · ${run.message}`}
              </p>
            )}
            {stats && (
              <p className="text-sm text-neutral-500">
                수집{" "}
                {Object.entries(stats.collected)
                  .map(([site, n]) => `${SITE_LABEL[site as Site]} ${n}`)
                  .join(" / ") || "-"}{" "}
                → 풀 {stats.pool} → 필터 후 {stats.afterFilter} → 중복 제거 {stats.afterDedupe} → 1차 선별 {stats.screened}
              </p>
            )}
            {stats && Object.keys(stats.collectErrors).length > 0 && (
              <p className="text-sm text-amber-600">
                {Object.entries(stats.collectErrors)
                  .map(([site, msg]) => `${SITE_LABEL[site as Site]}: ${msg}`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <RunControl initialStatus={run?.status ?? null} hasProfile={!!settings.profile} />
        </section>

        {recs.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">아직 추천 결과가 없습니다.</p>
        ) : (
          <section className="space-y-4">
            {recs.map((rec) => (
              <RecommendationCard key={rec.rank} rec={rec} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}
