import { generateJson, model } from "../../lib/gemini";
import { AnalysisSchema, type Profile, type RawJob, type SearchSettings } from "../../lib/types";

type Evidence = { id: string; project: string; heading: string; body: string };

/** Pro: 공고 1건을 근거 사례와 대조해 심층 분석 */
export async function analyzeJob(
  job: RawJob,
  profile: Profile,
  evidence: Evidence[],
  search: SearchSettings,
) {
  return generateJson({
    model: model("analyzer"),
    schema: AnalysisSchema,
    temperature: 0.3,
    system:
      "당신은 지원자 편에 선 커리어 코치입니다. 공고와 지원자 자료에 있는 사실만 근거로 쓰고, 장점과 단점을 균형 있게 씁니다.",
    prompt: `[채용 공고]
회사: ${job.company}
포지션: ${job.title}
경력/지역: ${job.experience ?? "-"} / ${job.location ?? "-"}
주요업무:
${job.mainTasks}
자격요건:
${job.requirements}
우대사항:
${job.preferredPoints}

[지원자 프로필]
${JSON.stringify(profile)}

[지원자 선호/메모]
${search.preferenceNote || "(없음)"}

[관련 근거 사례]
${evidence.map((e) => `## ${e.project} — ${e.heading} (${e.id})\n${e.body}`).join("\n\n") || "(없음)"}

작업:
- fitScore: 실제 합격 가능성과 커리어 적합성을 함께 고려한 0~100점
- requirementMatches: 공고의 핵심 요구/우대 사항을 4~8개 골라, 근거 사례(프로젝트명 — 사례 제목)와 연결. 근거가 없으면 status=gap, evidence에는 보완 방법
- pros/cons: 지원자 관점에서 이 회사·포지션의 장단점 (공고에서 알 수 있는 범위로, 추측이면 추측이라고 표시)
- resumeTips: 이 공고에 맞춰 이력서에서 앞세울 사례와 고칠 표현
- interviewQuestions: 이 공고와 지원자 경험을 엮은 예상 질문 3개`,
  });
}
