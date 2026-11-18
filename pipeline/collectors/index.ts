import { gte } from "drizzle-orm";
import { db, schema } from "../../lib/db/client";
import type { RawJob, SearchSettings, Site } from "../../lib/types";
import { launchPersistentBrowser } from "./browser";
import { crawlJobkoreaJobs } from "./jobkorea";
import { crawlSaraminJobs } from "./saramin";
import { crawlWantedJobs } from "./wanted";

export function parseSites(value: string | undefined): Site[] {
  const all: Site[] = ["wanted", "saramin", "jobkorea"];
  if (!value) return all;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Site => (all as string[]).includes(s));
}

async function upsertRawJobs(jobs: RawJob[]) {
  for (const job of jobs) {
    const values = { ...job, location: job.location ?? null, experience: job.experience ?? null };
    await db()
      .insert(schema.rawJobs)
      .values(values)
      .onConflictDoUpdate({ target: schema.rawJobs.id, set: { ...values, collectedAt: new Date() } });
  }
}

/**
 * 지정한 사이트를 크롤링해 raw_jobs에 저장한다.
 * 사이트 하나가 실패해도 나머지는 계속 진행한다.
 */
export async function collect(sites: Site[], search: SearchSettings, windowDays: number) {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const known = await db()
    .select({ id: schema.rawJobs.id })
    .from(schema.rawJobs)
    .where(gte(schema.rawJobs.collectedAt, since));
  const knownIds = new Set(known.map((r) => r.id));

  const maxJobs = Number(process.env.MAX_JOBS_PER_SITE || 20);
  const collected: Partial<Record<Site, number>> = {};
  const errors: Partial<Record<Site, string>> = {};

  const context = await launchPersistentBrowser();
  try {
    for (const site of sites) {
      try {
        let jobs: RawJob[];
        if (site === "wanted") {
          jobs = await crawlWantedJobs(context, {
            maxJobs,
            knownIds,
            categoryIds: search.wantedCategoryIds,
            minYears: search.minYears ?? 0,
            maxYears: search.maxYears ?? 10,
          });
        } else {
          // 키워드마다 몫을 나눠 수집. knownIds를 공유하므로 키워드 간 중복 공고는 건너뜀
          const crawl = site === "saramin" ? crawlSaraminJobs : crawlJobkoreaJobs;
          const quota = Math.max(1, Math.ceil(maxJobs / search.keywords.length));
          jobs = [];
          for (const keyword of search.keywords) {
            if (jobs.length >= maxJobs) break;
            const batch = await crawl(context, {
              keyword,
              knownIds,
              maxJobs: Math.min(quota, maxJobs - jobs.length),
            });
            jobs.push(...batch);
          }
        }
        await upsertRawJobs(jobs);
        collected[site] = jobs.length;
        if (jobs.length === 0) errors[site] = "신규 공고 0건 (차단 또는 셀렉터 변경 가능성)";
      } catch (e) {
        errors[site] = e instanceof Error ? e.message : String(e);
        console.error(`⚠️ [${site}] 수집 실패:`, e);
      }
    }
  } finally {
    await context.close();
  }

  return { collected, errors };
}
