import type { BrowserContext } from "playwright";
import { RawJobSchema as JobPostSchema, type RawJob as JobPost } from "../../lib/types";
import { cleanPureText} from "./utils";

/**
 * 원티드 직군/직무 태그 ID
 * 518: 개발 직군 (Job Group)
 * 669: 프론트엔드 개발자 (Duty / Category)
 */
const WANTED_JOB_GROUP_ID = 518;
const WANTED_FRONTEND_CATEGORY_ID = 669;

interface WantedListJobItem {
  id: number;
  position: string;
  company: {
    id: number;
    name: string;
  };
  address?: {
    country?: string;
    location?: string;
    district?: string;
  };
  annual_from?: number;
  annual_to?: number;
}

interface WantedListApiResponse {
  data?: WantedListJobItem[];
  links?: {
    next?: string | null;
  };
}

interface WantedDetailApiResponse {
  job?: {
    id: number;
    position: string;
    company?: {
      id: number;
      name: string;
    };
    address?: {
      full_location?: string;
      location?: string;
      district?: string;
    };
    detail?: {
      intro?: string;
      main_tasks?: string;
      requirements?: string;
      preferred_points?: string;
      benefits?: string;
    };
    annual_from?: number;
    annual_to?: number;
  };
}

export interface CrawlWantedOptions {
  /** 이미 raw_jobs에 있는 공고 ID (상세 재조회 생략) */
  knownIds?: Set<string>;
  maxJobs?: number;
  minYears?: number;
  maxYears?: number;
}

/**
 * 원티드 프론트엔드 채용 공고 목록 및 상세 API 데이터를 활용하여
 * 주요업무, 자격요건, 우대사항 순수 텍스트만 20개(기본값) 추출합니다.
 */
export async function crawlWantedFrontendJobs(
  context: BrowserContext,
  options: CrawlWantedOptions = {}
): Promise<JobPost[]> {
  const maxJobs =
    options.maxJobs ?? Number(process.env.MAX_JOBS_PER_SITE || 20);
  const minYears =
    options.minYears ?? Number(process.env.WANTED_MIN_YEARS || 0);
  const maxYears =
    options.maxYears ?? Number(process.env.WANTED_MAX_YEARS || 10);

  const seenIds = options.knownIds ?? new Set<string>();
  const collectedJobs: JobPost[] = [];

  const page = await context.newPage();

  try {
    console.log(
      `🌐 [Wanted] 원티드 프론트엔드 채용 공고 수집 시작 (목표: ${maxJobs}개)...`
    );

    await page.goto(
      `https://www.wanted.co.kr/wdlist/${WANTED_JOB_GROUP_ID}/${WANTED_FRONTEND_CATEGORY_ID}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    let offset = 0;
    const limit = 20;

    while (collectedJobs.length < maxJobs) {
      const listApiUrl = new URL(
        "https://www.wanted.co.kr/api/chaos/navigation/v1/results"
      );
      listApiUrl.searchParams.set("job_group_id", String(WANTED_JOB_GROUP_ID));
      listApiUrl.searchParams.append(
        "tag_type_ids",
        String(WANTED_FRONTEND_CATEGORY_ID)
      );
      listApiUrl.searchParams.set("country", "kr");
      listApiUrl.searchParams.set("job_sort", "job.latest_order");
      listApiUrl.searchParams.append("years", String(minYears));
      listApiUrl.searchParams.append("years", String(maxYears));
      listApiUrl.searchParams.set("locations", "all");
      listApiUrl.searchParams.set("limit", String(limit));
      listApiUrl.searchParams.set("offset", String(offset));

      const listData = await page.evaluate(async (url: string) => {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json, text/plain, */*",
            "wanted-user-country": "KR",
            "wanted-user-language": "ko",
          },
        });
        if (!res.ok) {
          throw new Error(`Wanted List API failed with status ${res.status}`);
        }
        return (await res.json()) as WantedListApiResponse;
      }, listApiUrl.toString());

      const jobSummaries = listData.data ?? [];
      if (jobSummaries.length === 0) {
        console.log("ℹ️ [Wanted] 더 이상 조회할 공고 목록이 없습니다.");
        break;
      }

      for (const summary of jobSummaries) {
        if (collectedJobs.length >= maxJobs) break;

        const uniqueId = `wanted_${summary.id}`;
        if (seenIds.has(uniqueId)) {
          continue;
        }

        const detailData = await page.evaluate(async (jobId: number) => {
          const endpoints = [
            `https://www.wanted.co.kr/api/chaos/jobs/v2/${jobId}/details`,
            `https://www.wanted.co.kr/api/v4/jobs/${jobId}`,
          ];

          for (const endpoint of endpoints) {
            try {
              const res = await fetch(endpoint, {
                headers: {
                  Accept: "application/json, text/plain, */*",
                  "wanted-user-country": "KR",
                  "wanted-user-language": "ko",
                },
              });
              if (res.ok) {
                const json = await res.json();
                return (
                  json.data ? { job: json.data.job ?? json.data } : json
                ) as WantedDetailApiResponse;
              }
            } catch {
              // 다음 엔드포인트 시도
            }
          }
          return null;
        }, summary.id);

        const jobDetail = detailData?.job;
        if (!jobDetail || !jobDetail.detail) {
          continue;
        }

        const mainTasks = cleanPureText(jobDetail.detail.main_tasks);
        const requirements = cleanPureText(jobDetail.detail.requirements);
        const preferredPoints = cleanPureText(
          jobDetail.detail.preferred_points
        );

        const locationParts = [
          jobDetail.address?.location ?? summary.address?.location,
          jobDetail.address?.district ?? summary.address?.district,
        ].filter(Boolean);

        const annualFrom = jobDetail.annual_from ?? summary.annual_from;
        const annualTo = jobDetail.annual_to ?? summary.annual_to;
        const experience =
          annualFrom !== undefined && annualTo !== undefined
            ? `${annualFrom}~${annualTo}년`
            : undefined;

        const rawJobPost = {
          id: uniqueId,
          site: "wanted" as const,
          company: jobDetail.company?.name ?? summary.company.name,
          title: jobDetail.position ?? summary.position,
          url: `https://www.wanted.co.kr/wd/${summary.id}`,
          location:
            locationParts.length > 0 ? locationParts.join(" ") : undefined,
          experience,
          mainTasks,
          requirements,
          preferredPoints,
        };

        const validated = JobPostSchema.safeParse(rawJobPost);
        if (validated.success) {
          collectedJobs.push(validated.data);
          seenIds.add(uniqueId);
          console.log(
              `✅ [Wanted] (${collectedJobs.length}/${maxJobs}) [${validated.data.company}] ${validated.data.title}`
          );
        }

        await page.waitForTimeout(250);
      }

      if (!listData.links?.next) {
        break;
      }
      offset += limit;
    }
    console.log(
        `🎉 [Wanted] 총 ${collectedJobs.length}개의 신규 공고 수집 완료`
    );

    return collectedJobs;
  } catch (error) {
    console.error("⚠️ [Wanted] 크롤링 중 오류 발생:", error);
    return collectedJobs;
  } finally {
    await page.close();
  }
}
