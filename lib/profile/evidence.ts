import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";
import { generateJson, model } from "../gemini";

type Unit = typeof schema.evidenceUnits.$inferInsert;

/** 근거 사례로 쓰기엔 목록/메타 성격인 섹션 */
const SKIP_HEADINGS =
  /기술\s*스택|stacks?|주력|구현\s*경험|배포\s*및\s*협업|자격증|career|experiences?|대표\s*화면|side\s*project|projects?$/i;
const MIN_BODY = 150;
const MAX_BODY = 3500;

function cleanHeading(h: string) {
  return h.replace(/\*\*/g, "").replace(/^[\p{Extended_Pictographic}️⃣\d\s]+/u, "").trim();
}

/** Markdown을 제목 단위로 잘라 근거 사례를 만든다 */
export function splitEvidence(page: { pageId: string; title: string; markdown: string }): Unit[] {
  const units: Unit[] = [];
  let heading: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (heading === null) return;
    const text = body.join("\n").trim();
    const h = cleanHeading(heading);
    if (text.length >= MIN_BODY && !SKIP_HEADINGS.test(h)) {
      units.push({
        // Notion ID는 앞부분이 워크스페이스 내에서 겹칠 수 있어 뒷부분을 사용
        id: `${page.pageId.replace(/-/g, "").slice(-8)}-${units.length + 1}`,
        pageId: page.pageId,
        project: page.title,
        heading: h,
        body: text.slice(0, MAX_BODY),
        tags: [],
      });
    }
  };

  for (const line of page.markdown.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.*)$/);
    if (m) {
      flush();
      heading = m[1];
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return units;
}

const TagSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      tags: z.array(z.string()).describe("3~6개. 기술/역량 키워드, 한국어 또는 공식 영문 표기"),
    }),
  ),
});

/** 바뀐 페이지의 근거 사례를 다시 만들고 Flash로 태그를 붙인다 */
export async function rebuildEvidence(pageIds: string[]) {
  if (pageIds.length === 0) return 0;

  const pages = await db()
    .select()
    .from(schema.notionPages)
    .where(inArray(schema.notionPages.pageId, pageIds));

  const units = pages.flatMap(splitEvidence);

  if (units.length > 0) {
    const tagged = await generateJson({
      model: model("screener"),
      schema: TagSchema,
      prompt: `다음은 프론트엔드 개발자의 포트폴리오 사례 목록입니다.
각 사례마다 채용공고 요구사항과 매칭하기 좋은 태그 3~6개를 붙여주세요.
기술(예: SSE, LangGraph, Next.js, Zustand, 차트), 역량(예: 공통 컴포넌트 설계, 성능 최적화, 오류 모니터링, 협업·설득) 위주로.

${JSON.stringify(units.map((u) => ({ id: u.id, project: u.project, heading: u.heading, body: u.body.slice(0, 1200) })))}`,
    });
    const tagMap = new Map(tagged.items.map((t) => [t.id, t.tags]));
    for (const u of units) u.tags = tagMap.get(u.id) ?? [];
  }

  for (const pageId of pageIds) {
    await db().delete(schema.evidenceUnits).where(eq(schema.evidenceUnits.pageId, pageId));
  }
  if (units.length > 0) await db().insert(schema.evidenceUnits).values(units);
  return units.length;
}
