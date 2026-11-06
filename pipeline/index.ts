import "dotenv/config";
import { gte, inArray, lt } from "drizzle-orm";
import { db, getSettings, schema, setLatestRun } from "../lib/db/client";
import { dedupeKey, filterAndDedupe } from "../lib/filters";
import { RawJobSchema, type RawJob, type RunStats } from "../lib/types";
import { analyzeJob } from "./ai/analyzer";
import { screenJobs } from "./ai/screener";
import { collect, parseSites } from "./collectors";

const env = (name: string, fallback: number) => Number(process.env[name] || fallback);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const startedAt = new Date();
  const stats: RunStats = { collected: {}, collectErrors: {}, pool: 0, afterFilter: 0, afterDedupe: 0, screened: 0 };
  await setLatestRun({ status: "running", message: "공고 수집 중", stats: null, startedAt, finishedAt: null });

  const settings = await getSettings();
  const search = settings.search;
  const profile = settings.profile;
  if (!profile) throw new Error("프로필이 없습니다. 대시보드 설정에서 '프로필 갱신'을 먼저 실행하세요.");

  const windowDays = env("RAW_JOB_WINDOW_DAYS", 7);

  // 1) 수집 (COLLECT_SITES=none 이면 건너뜀 — 로컬에서 따로 수집한 경우)
  const sites = process.env.COLLECT_SITES === "none" ? [] : parseSites(process.env.COLLECT_SITES);
  if (sites.length > 0) {
    const { collected, errors } = await collect(sites, search, windowDays);
    stats.collected = collected;
    stats.collectErrors = errors;
  }

  // 2) 분석 대상 풀: 최근 N일 안에 수집된 공고 (어디서 수집했든)
  await setLatestRun({ status: "running", message: "필터링 및 1차 선별 중", stats, startedAt, finishedAt: null });
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await db().select().from(schema.rawJobs).where(gte(schema.rawJobs.collectedAt, since));
  const pool: RawJob[] = rows.map((r) =>
    RawJobSchema.parse({ ...r, location: r.location ?? undefined, experience: r.experience ?? undefined }),
  );
  stats.pool = pool.length;

  // 3) 하드 필터 + 중복 제거
  const seen = await db().select({ key: schema.seenJobs.dedupeKey }).from(schema.seenJobs);
  const { afterFilter, unique } = filterAndDedupe(pool, search, new Set(seen.map((s) => s.key)));
  stats.afterFilter = afterFilter;
  stats.afterDedupe = unique.length;
  if (unique.length === 0) {
    await setLatestRun({ status: "done", message: "조건에 맞는 새 공고가 없습니다. 이전 추천을 유지합니다.", stats, startedAt, finishedAt: new Date() });
    return;
  }

  // 4) Flash 1차 선별
  const evidence = await db().select().from(schema.evidenceUnits);
  const candidates = await screenJobs(unique, profile, evidence, search, env("SCREEN_TOP_K", 8));
  stats.screened = candidates.length;
  console.log(`🔎 1차 선별 ${candidates.length}건`);

  // 5) Pro 심층 분석
  await setLatestRun({ status: "running", message: `심층 분석 중 (${candidates.length}건)`, stats, startedAt, finishedAt: null });
  const jobById = new Map(unique.map((j) => [j.id, j]));
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const analyzed = await mapLimit(candidates, 3, async (c) => {
    const job = jobById.get(c.jobId)!;
    try {
      const ev = c.evidenceIds.map((id) => evidenceById.get(id)!).filter(Boolean);
      const analysis = await analyzeJob(job, profile, ev, search);
      console.log(`🧠 [${job.company}] ${job.title} → ${analysis.fitScore}점`);
      return { job, screenScore: c.score, analysis };
    } catch (e) {
      console.error(`⚠️ 분석 실패: ${job.company} ${job.title}`, e);
      return null;
    }
  });

  const finalTop = analyzed
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => b.analysis.fitScore - a.analysis.fitScore)
    .slice(0, env("FINAL_TOP_K", 5));
  if (finalTop.length === 0) throw new Error("심층 분석이 모두 실패했습니다.");

  // 6) 저장: 추천 덮어쓰기 + 중복 방지 기록 + 상태 갱신
  const recs = finalTop.map((r, i) => ({
    rank: i + 1,
    jobId: r.job.id,
    site: r.job.site,
    company: r.job.company,
    title: r.job.title,
    url: r.job.url,
    location: r.job.location ?? null,
    experience: r.job.experience ?? null,
    screenScore: r.screenScore,
    analysis: r.analysis,
  }));
  const seenRows = finalTop.map((r) => ({
    dedupeKey: dedupeKey(r.job),
    jobId: r.job.id,
    company: r.job.company,
    title: r.job.title,
  }));

  await db().batch([
    db().delete(schema.recommendations),
    db().insert(schema.recommendations).values(recs),
    db().insert(schema.seenJobs).values(seenRows).onConflictDoNothing(),
    db().delete(schema.rawJobs).where(lt(schema.rawJobs.collectedAt, new Date(Date.now() - windowDays * 2 * 86_400_000))),
    db()
      .update(schema.latestRun)
      .set({ status: "done", message: `추천 ${recs.length}건 갱신`, stats, finishedAt: new Date() })
      .where(inArray(schema.latestRun.id, [1])),
  ]);

  console.log(`🎉 완료: 추천 ${recs.length}건 저장`);
}

main().catch(async (error) => {
  console.error("❌ 파이프라인 실패:", error);
  try {
    await setLatestRun({
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      startedAt: new Date(),
      finishedAt: new Date(),
    });
  } catch {
    // DB 자체가 문제면 무시
  }
  process.exit(1);
});
