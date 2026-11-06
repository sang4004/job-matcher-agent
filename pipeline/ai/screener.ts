import { generateJson, model } from "../../lib/gemini";
import { ScreeningSchema, type Profile, type RawJob, type SearchSettings } from "../../lib/types";

type EvidenceRef = { id: string; project: string; heading: string; tags: string[] };

/** Flash: 공고 풀에서 상위 후보를 고르고, 후보마다 관련 근거 사례 ID를 붙인다 */
export async function screenJobs(
  jobs: RawJob[],
  profile: Profile,
  evidence: EvidenceRef[],
  search: SearchSettings,
  topK: number,
) {
  const condensed = jobs.map((j) => ({
    id: j.id,
    company: j.company,
    title: j.title,
    experience: j.experience,
    location: j.location,
    mainTasks: j.mainTasks.slice(0, 900),
    requirements: j.requirements.slice(0, 800),
    preferred: j.preferredPoints.slice(0, 500),
  }));

  const result = await generateJson({
    model: model("screener"),
    schema: ScreeningSchema,
    system: "당신은 프론트엔드 채용 시장을 잘 아는 테크 리크루터입니다. 근거 없이 점수를 부풀리지 마세요.",
    prompt: `[지원자 요약]
${JSON.stringify({
  summary: profile.summary,
  totalYears: profile.totalYears,
  coreSkills: profile.coreSkills,
  otherSkills: profile.otherSkills,
  domains: profile.domains,
})}

[지원자 선호/메모]
${search.preferenceNote || "(없음)"}

[근거 사례 목록 — id, 프로젝트, 제목, 태그]
${evidence.map((e) => `${e.id} | ${e.project} | ${e.heading} | ${e.tags.join(", ")}`).join("\n")}

[채용 공고 ${jobs.length}건]
${JSON.stringify(condensed)}

작업:
1. 지원자와 가장 잘 맞는 공고를 최대 ${topK}개 고르세요. 기술 스택, 연차 적합성, 업무/도메인 연결성, 선호를 함께 봅니다.
2. 각 후보에 0~100점, 한두 문장 사유, 그리고 이 공고의 요구사항을 뒷받침할 근거 사례 id를 최대 5개 붙이세요.
3. jobId는 공고 목록의 id를 그대로 쓰세요.`,
  });

  const valid = new Set(jobs.map((j) => j.id));
  const evidenceIds = new Set(evidence.map((e) => e.id));
  return result.candidates
    .filter((c) => valid.has(c.jobId))
    .map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((id) => evidenceIds.has(id)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
