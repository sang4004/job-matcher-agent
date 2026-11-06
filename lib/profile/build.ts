import { eq } from "drizzle-orm";
import { db, getSettings, schema } from "../db/client";
import { generateJson, model } from "../gemini";
import { ProfileSchema } from "../types";
import { syncNotion } from "./notion";
import { rebuildEvidence } from "./evidence";

/** Notion(기준 자료) + 업로드 자료(보충)로 후보자 프로필 JSON을 만든다 */
export async function buildProfile() {
  const pages = await db().select().from(schema.notionPages);
  const sources = await db().select().from(schema.profileSources);
  if (pages.length === 0 && sources.length === 0) {
    throw new Error("프로필을 만들 자료가 없습니다. Notion 연동 또는 자료 업로드를 먼저 해주세요.");
  }

  const root = pages.filter((p) => p.kind === "root");
  const projects = pages.filter((p) => p.kind === "project");
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `오늘 날짜: ${today}

아래 자료로 지원자 프로필을 만들어주세요.
- [Notion]이 기준 자료입니다. [보조 자료]는 Notion에 없는 내용만 보충하는 데 쓰고, 겹치는 내용은 중복으로 세지 마세요.
- 자료에 없는 내용을 지어내지 마세요.
- totalYears는 정규 경력(재직 기간)만 합산하고, 교육/인턴성 경력은 제외하세요.

[Notion — 메인 페이지]
${root.map((p) => p.markdown).join("\n\n")}

[Notion — 프로젝트 (${projects.length}건)]
${projects
  .map((p) => `### ${p.title} (${p.period ?? "기간 미기재"})\n대표 성과: ${p.highlight ?? "-"}\n${p.markdown}`)
  .join("\n\n")}

[보조 자료]
${sources.map((s) => `### ${s.label} (${s.fileName})\n${s.text.slice(0, 20000)}`).join("\n\n") || "(없음)"}`;

  const profile = await generateJson({
    model: model("analyzer"),
    schema: ProfileSchema,
    prompt,
  });

  await getSettings(); // 행 보장
  await db()
    .update(schema.settings)
    .set({ profile, profileUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.settings.id, 1));

  return profile;
}

export async function refreshProfile(opts: { force?: boolean; skipNotion?: boolean } = {}) {
  let sync = { changedPageIds: [] as string[], removedPageIds: [] as string[], totalPages: 0 };
  if (!opts.skipNotion && process.env.NOTION_TOKEN) {
    sync = await syncNotion({ force: opts.force });
  }
  // 근거 사례가 비어 있으면(첫 실행 등) 전체 페이지로 다시 만든다
  const hasEvidence = (await db().select({ id: schema.evidenceUnits.id }).from(schema.evidenceUnits).limit(1)).length > 0;
  const targetIds = hasEvidence
    ? sync.changedPageIds
    : (await db().select({ id: schema.notionPages.pageId }).from(schema.notionPages)).map((p) => p.id);
  const evidenceCount = await rebuildEvidence(targetIds);
  const profile = await buildProfile();
  return { ...sync, evidenceRebuilt: evidenceCount, profile };
}
