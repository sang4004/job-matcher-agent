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
  const { search } = await getSettings();

  const prompt = `오늘 날짜: ${today}
목표 포지션: ${search.targetRole}

아래 자료로 지원자 프로필을 만들어주세요.
- [Notion]이 기준 자료입니다. [보조 자료]는 Notion에 없는 내용만 보충하는 데 쓰고, 겹치는 내용은 중복으로 세지 마세요.
- 자료에 없는 내용을 지어내지 마세요.
- 목표 포지션 관점에서 관련 경험을 빠짐없이 뽑으세요. 프론트엔드뿐 아니라 API·DB·서버 작업(BFF, CRUD API, SQL 개선, 테이블 설계, 사이드 프로젝트 백엔드 등)도 projects와 skills에 반영하세요.
- 프로젝트의 role에는 맡은 범위를 적되, 백엔드 작업이 있었다면 함께 적으세요 (예: "프론트엔드 리드 + BFF API 구현").
- 학습 중인 기술(${search.learningSkills.join(", ") || "없음"})은 자료에 실무 근거가 없으면 coreSkills·otherSkills에 넣지 마세요.
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
  let sync = { changedPageIds: [] as string[], removedPageIds: [] as string[], totalPages: 0, projectPages: 0 };
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
