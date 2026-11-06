import type { BrowserContext } from "playwright";
import { RawJobSchema as JobPostSchema, type RawJob as JobPost } from "../../lib/types";
import {
  cleanPureText,
  splitJobSections,
} from "./utils";

export interface CrawlJobkoreaOptions {
  /** 이미 raw_jobs에 있는 공고 ID (상세 재조회 생략) */
  knownIds?: Set<string>;
  maxJobs?: number;
  keyword?: string;
}

interface JobkoreaListItem {
  gno: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  experience?: string;
  summaryText?: string;
}

/**
 * 잡코리아(JobKorea) 프론트엔드 채용 공고 목록 및 상세 본문 크롤러 (기본 20개)
 */
export async function crawlJobkoreaFrontendJobs(
  context: BrowserContext,
  options: CrawlJobkoreaOptions = {}
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
      `🌐 [JobKorea] 잡코리아 '${keyword}' 채용 공고 수집 시작 (목표: ${maxJobs}개)...`
    );

    let pageNo = 1;

    while (collectedJobs.length < maxJobs && pageNo <= 5) {
      const searchUrl = new URL("https://www.jobkorea.co.kr/Search/");
      searchUrl.searchParams.set("stext", keyword);
      searchUrl.searchParams.set("tabType", "recruit");
      searchUrl.searchParams.set("Page_No", String(pageNo));

      await page.goto(searchUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const listItems: JobkoreaListItem[] = await page.evaluate(() => {
        const results: JobkoreaListItem[] = [];
        const seenGno = new Set<string>();

        // 잡코리아 검색결과 내 GI_Read 링크를 가진 요소 탐색
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/Recruit/GI_Read/"]')
        );

        for (const a of anchors) {
          const href = a.getAttribute("href") || "";
          const match = href.match(/\/Recruit\/GI_Read\/(\d+)/i);
          if (!match) continue;

          const gno = match[1];
          const text = a.textContent?.trim() || "";
          if (!text || text.length < 2) continue;

          // 컨테이너(li 또는 article) 찾기
          const card =
            a.closest("li, article, .list-post, .post") || a.parentElement;
          if (!card) continue;

          if (seenGno.has(gno)) continue;

          // 회사명과 공고 제목 구분
          const corpEl = card.querySelector(
            '.post-list-corp a, .corp-name a, a[href*="Co_Read"], .name'
          );
          const titleEl = card.querySelector(
            '.post-list-info a.title, .information-title a, a.title, a[href*="/Recruit/GI_Read/"]'
          );

          const company =
            corpEl && corpEl !== titleEl
              ? corpEl.textContent?.trim() || ""
              : "";
          const title = titleEl ? titleEl.textContent?.trim() || text : text;

          if (!title || !company || title === company) continue;

          seenGno.add(gno);

          const optionSpans = Array.from(
            card.querySelectorAll(".option span, .chip-information-group li")
          ).map((s) => s.textContent?.trim() || "");

          const experience = optionSpans.find((s) =>
            /신입|경력|무관|\d+년/.test(s)
          );
          const location = optionSpans.find((s) =>
            /서울|경기|판교|분당|강남|성남|인천|부산|대전|대구|광주/.test(s)
          );
          const summaryText = card
            .querySelector(".etc, .post-list-info")
            ?.textContent?.trim();

          results.push({
            gno,
            title,
            company,
            url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${gno}`,
            location,
            experience,
            summaryText,
          });
        }

        return results;
      });

      if (listItems.length === 0) {
        console.log("ℹ️ [JobKorea] 더 이상 조회할 공고 목록이 없습니다.");
        break;
      }

      for (const item of listItems) {
        if (collectedJobs.length >= maxJobs) break;

        const uniqueId = `jobkorea_${item.gno}`;
        if (seenIds.has(uniqueId)) {
          continue;
        }

        let detailText = "";

        try {
          // 상세 모집요강 iframe 페이지(GI_Read_Comt_Ifrm) 우선 조회
          const iframeUrl = `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${item.gno}`;
          await page.goto(iframeUrl, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });

          detailText = await page.evaluate(() => {
            return document.body ? document.body.innerText : "";
          });

          // 만약 iframe 텍스트가 너무 짧다면 본 상세 페이지에서 요약 테이블 추출
          if (cleanPureText(detailText).length < 50) {
            await page.goto(item.url, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            detailText = await page.evaluate(() => {
              const summarySec =
                document.querySelector(".tbRow, .artReadJobSum, #container") ||
                document.body;
              return summarySec ? (summarySec as HTMLElement).innerText : "";
            });
          }
        } catch {
          detailText = item.summaryText || item.title;
        }

        const sections = splitJobSections(detailText);

        const rawJobPost = {
          id: uniqueId,
          site: "jobkorea" as const,
          company: item.company,
          title: item.title,
          url: item.url,
          location: item.location,
          experience: item.experience,
          mainTasks:
            sections.mainTasks || item.summaryText || `${item.title} 개발`,
          requirements:
            sections.requirements ||
            item.experience ||
            "(공고 상세 링크 참조)",
          preferredPoints:
            sections.preferredPoints || "(공고 상세 링크 참조)",
        };

        const validated = JobPostSchema.safeParse(rawJobPost);
        if (validated.success) {
          collectedJobs.push(validated.data);
          seenIds.add(uniqueId);
          console.log(
            `✅ [JobKorea] (${collectedJobs.length}/${maxJobs}) [${validated.data.company}] ${validated.data.title}`
          );
        }

        await page.waitForTimeout(350);
      }

      pageNo += 1;
    }
    console.log(
      `🎉 [JobKorea] 총 ${collectedJobs.length}개의 신규 공고 수집 완료`
    );

    return collectedJobs;
  } catch (error) {
    console.error("⚠️ [JobKorea] 크롤링 중 오류 발생:", error);
    return collectedJobs;
  } finally {
    await page.close();
  }
}

