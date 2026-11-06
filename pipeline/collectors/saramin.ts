import type { BrowserContext } from "playwright";
import { RawJobSchema as JobPostSchema, type RawJob as JobPost } from "../../lib/types";
import {
  cleanPureText,
  splitJobSections,
} from "./utils";

export interface CrawlSaraminOptions {
  /** 이미 raw_jobs에 있는 공고 ID (상세 재조회 생략) */
  knownIds?: Set<string>;
  maxJobs?: number;
  keyword?: string;
}

interface SaraminListItem {
  recIdx: string;
  title: string;
  company: string;
  location?: string;
  experience?: string;
  jobSectorTags?: string;
}

/**
 * 사람인(Saramin) 프론트엔드 채용 공고 목록 및 상세 본문 크롤러 (기본 20개)
 */
export async function crawlSaraminFrontendJobs(
  context: BrowserContext,
  options: CrawlSaraminOptions = {}
): Promise<JobPost[]> {
  const maxJobs =
    options.maxJobs ?? Number(process.env.MAX_JOBS_PER_SITE || 20);
  const keyword =
    options.keyword ?? "프론트엔드";

  const seenIds = options.knownIds ?? new Set<string>();
  const collectedJobs: JobPost[] = [];

  const page = await context.newPage();

  try {
    console.log(
      `🌐 [Saramin] 사람인 '${keyword}' 채용 공고 수집 시작 (목표: ${maxJobs}개)...`
    );

    let recruitPage = 1;

    while (collectedJobs.length < maxJobs && recruitPage <= 5) {
      const searchUrl = new URL(
        "https://www.saramin.co.kr/zf_user/search/recruit"
      );
      searchUrl.searchParams.set("searchType", "search");
      searchUrl.searchParams.set("searchword", keyword);
      searchUrl.searchParams.set("recruitPage", String(recruitPage));
      searchUrl.searchParams.set("recruitSort", "relation");
      searchUrl.searchParams.set("recruitPageCount", "40");

      await page.goto(searchUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const listItems: SaraminListItem[] = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(".item_recruit"));
        return items
          .map((el) => {
            const recIdx =
              el.getAttribute("value") ||
              el
                .querySelector("a.data_layer, .job_tit a")
                ?.getAttribute("href")
                ?.match(/rec_idx=(\d+)/)?.[1] ||
              "";
            const title =
              el.querySelector(".job_tit a")?.textContent?.trim() || "";
            const company =
              el.querySelector(".corp_name a")?.textContent?.trim() || "";
            const conditions = Array.from(
              el.querySelectorAll(".job_condition span")
            ).map((s) => s.textContent?.trim() || "");
            const location = conditions[0] || undefined;
            const experience = conditions[1] || undefined;
            const jobSectorTags = Array.from(
              el.querySelectorAll(".job_sector a, .job_sector span")
            )
              .map((s) => s.textContent?.trim())
              .filter(Boolean)
              .join(", ");

            return {
              recIdx,
              title,
              company,
              location,
              experience,
              jobSectorTags,
            };
          })
          .filter((item) => item.recIdx && item.title && item.company);
      });

      if (listItems.length === 0) {
        console.log("ℹ️ [Saramin] 더 이상 조회할 공고 목록이 없습니다.");
        break;
      }

      for (const item of listItems) {
        if (collectedJobs.length >= maxJobs) break;

        const uniqueId = `saramin_${item.recIdx}`;
        if (seenIds.has(uniqueId)) {
          continue;
        }

        const detailUrl = `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${item.recIdx}`;
        let detailText = "";

        try {
          // 사람인 상세 본문 iframe(view-detail) 직접 조회 시도
          const viewDetailUrl = `https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=${item.recIdx}`;
          await page.goto(viewDetailUrl, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });

          detailText = await page.evaluate(() => {
            const container =
              document.querySelector(".user_content") || document.body;
            return container ? (container as HTMLElement).innerText : "";
          });

          // 만약 view-detail에서 텍스트가 거의 없다면 기본 상세 페이지로 폴백
          if (cleanPureText(detailText).length < 50) {
            await page.goto(detailUrl, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            detailText = await page.evaluate(() => {
              const contentEl =
                document.querySelector(".wrap_jv_cont") || document.body;
              return contentEl ? (contentEl as HTMLElement).innerText : "";
            });
          }
        } catch {
          // 개별 공고 로드 실패 시 목록 요약 정보로 대체
          detailText = `${item.title} / 직무 키워드: ${item.jobSectorTags ?? ""}`;
        }

        const sections = splitJobSections(detailText);
        if (!sections.mainTasks && item.jobSectorTags) {
          sections.mainTasks = `직무 분야: ${item.jobSectorTags}`;
        }

        const rawJobPost = {
          id: uniqueId,
          site: "saramin" as const,
          company: item.company,
          title: item.title,
          url: detailUrl,
          location: item.location,
          experience: item.experience,
          mainTasks:
            sections.mainTasks ||
            `${item.title} (${item.jobSectorTags || "프론트엔드 개발"})`,
          requirements:
            sections.requirements ||
            item.experience ||
            "(공고 상세 링크 참조)",
          preferredPoints:
            sections.preferredPoints ||
            item.jobSectorTags ||
            "(공고 상세 링크 참조)",
        };

        const validated = JobPostSchema.safeParse(rawJobPost);
        if (validated.success) {
          collectedJobs.push(validated.data);
          seenIds.add(uniqueId);
          console.log(
            `✅ [Saramin] (${collectedJobs.length}/${maxJobs}) [${validated.data.company}] ${validated.data.title}`
          );
        }

        await page.waitForTimeout(350);
      }

      recruitPage += 1;
    }
    console.log(
      `🎉 [Saramin] 총 ${collectedJobs.length}개의 신규 공고 수집 완료`
    );

    return collectedJobs;
  } catch (error) {
    console.error("⚠️ [Saramin] 크롤링 중 오류 발생:", error);
    return collectedJobs;
  } finally {
    await page.close();
  }
}

