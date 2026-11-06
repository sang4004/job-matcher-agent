import { asc, count } from "drizzle-orm";
import { Nav } from "@/components/Nav";
import { ProfileRefreshButton } from "@/components/ProfileRefreshButton";
import { db, getSettings, schema } from "@/lib/db/client";
import { requireAuth } from "@/lib/session";
import { clearSeenJobs, deleteSource, saveSearchSettings, uploadSource } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAuth();
  const [settings, sources, pages, evidence, [seen]] = await Promise.all([
    getSettings(),
    db().select().from(schema.profileSources).orderBy(asc(schema.profileSources.id)),
    db()
      .select({ title: schema.notionPages.title, kind: schema.notionPages.kind, syncedAt: schema.notionPages.syncedAt })
      .from(schema.notionPages),
    db().select({ project: schema.evidenceUnits.project, heading: schema.evidenceUnits.heading, tags: schema.evidenceUnits.tags }).from(schema.evidenceUnits),
    db().select({ n: count() }).from(schema.seenJobs),
  ]);
  const s = settings.search;
  const profile = settings.profile;

  return (
    <>
      <Nav current="settings" />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* 검색 · 제외 조건 */}
        <section className="card">
          <h2 className="mb-4 font-semibold">검색 · 제외 조건</h2>
          <form action={saveSearchSettings} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">검색 키워드 (사람인·잡코리아)</label>
              <input name="searchKeyword" defaultValue={s.searchKeyword} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">최소 연차</label>
                <input name="minYears" type="number" min={0} defaultValue={s.minYears ?? ""} className="input" />
              </div>
              <div>
                <label className="label">최대 요구 연차</label>
                <input name="maxYears" type="number" min={0} defaultValue={s.maxYears ?? ""} className="input" />
              </div>
            </div>
            <div>
              <label className="label">제외 회사 (줄바꿈/쉼표 구분)</label>
              <textarea name="excludeCompanies" rows={4} defaultValue={s.excludeCompanies.join("\n")} className="input" />
            </div>
            <div>
              <label className="label">제외 키워드 (예: SI, 파견, 아웃소싱)</label>
              <textarea name="excludeKeywords" rows={4} defaultValue={s.excludeKeywords.join("\n")} className="input" />
            </div>
            <div>
              <label className="label">근무 지역 (비우면 전체)</label>
              <input name="locations" defaultValue={s.locations.join(", ")} placeholder="서울, 판교" className="input" />
            </div>
            <div>
              <label className="label">선호 · 메모 (AI 판단에 참고)</label>
              <textarea name="preferenceNote" rows={2} defaultValue={s.preferenceNote} placeholder="예: 자체 서비스 선호, 원격 근무 가능하면 가산점" className="input" />
            </div>
            <div className="md:col-span-2">
              <button className="btn-primary">저장</button>
            </div>
          </form>
        </section>

        {/* 프로필 */}
        <section className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">후보자 프로필</h2>
              <p className="text-sm text-neutral-500">
                Notion(기준) + 업로드 자료(보충)로 만듭니다. 마지막 갱신:{" "}
                {settings.profileUpdatedAt?.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) ?? "없음"}
              </p>
            </div>
            <ProfileRefreshButton />
          </div>

          {profile ? (
            <div className="space-y-3 text-sm">
              <p>{profile.summary}</p>
              <p className="text-neutral-500">
                {profile.currentRole} · {profile.totalYears}년 · 도메인: {profile.domains.join(", ")}
              </p>
              <p>
                <span className="font-medium">주력</span> {profile.coreSkills.join(", ")}
              </p>
              <details>
                <summary className="cursor-pointer font-medium">프로젝트 {profile.projects.length}개</summary>
                <ul className="mt-2 space-y-2">
                  {profile.projects.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium">{p.name}</span> <span className="text-neutral-500">({p.period}) {p.role}</span>
                      <ul className="list-disc pl-5 text-neutral-600 dark:text-neutral-400">
                        {p.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">아직 프로필이 없습니다. 자료를 준비한 뒤 &apos;프로필 갱신&apos;을 눌러주세요.</p>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              Notion 페이지 {pages.length}개 · 근거 사례 {evidence.length}개
            </summary>
            <ul className="mt-2 space-y-1">
              {evidence.map((e, i) => (
                <li key={i}>
                  <span className="text-neutral-500">{e.project} —</span> {e.heading}{" "}
                  <span className="text-xs text-neutral-400">{e.tags.join(" · ")}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>

        {/* 보조 자료 */}
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">보조 자료</h2>
            <p className="text-sm text-neutral-500">
              PDF 이력서, 경력기술서(Google Docs → PDF/.md로 내보내기), 포트폴리오(Google Slides → PDF로 내보내기). 업로드 후 &apos;프로필 갱신&apos;을 눌러야 반영됩니다.
            </p>
          </div>
          <form action={uploadSource} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">이름</label>
              <input name="label" placeholder="예: 경력기술서" className="input" />
            </div>
            <input name="file" type="file" accept=".pdf,.md,.txt" required className="text-sm" />
            <button className="btn-ghost">업로드</button>
          </form>
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
            {sources.map((src) => (
              <li key={src.id} className="flex items-center justify-between py-2">
                <span>
                  {src.label} <span className="text-neutral-500">({src.fileName}, {src.text.length.toLocaleString()}자)</span>
                </span>
                <form action={deleteSource}>
                  <input type="hidden" name="id" value={src.id} />
                  <button className="text-xs text-red-600 hover:underline">삭제</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        {/* 중복 방지 기록 */}
        <section className="card flex items-center justify-between">
          <div>
            <h2 className="font-semibold">이미 추천한 공고</h2>
            <p className="text-sm text-neutral-500">{seen.n}건 — 다음 분석에서 제외됩니다.</p>
          </div>
          <form action={clearSeenJobs}>
            <button className="btn-ghost">기록 초기화</button>
          </form>
        </section>
      </main>
    </>
  );
}
