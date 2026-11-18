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
    system: `당신은 지원자 편에 선 커리어 코치입니다. 지원자의 목표 포지션은 "${search.targetRole}"입니다. 공고와 지원자 자료에 있는 사실만 근거로 쓰고, 장점과 단점을 균형 있게 씁니다.`,
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

[학습 중인 기술 — 실무 경험 아님]
${search.learningSkills.join(", ") || "(없음)"}

[관련 근거 사례]
${evidence.map((e) => `## ${e.project} — ${e.heading} (${e.id})\n${e.body}`).join("\n\n") || "(없음)"}

작업:
- fitScore: 실제 합격 가능성과 커리어 적합성을 함께 고려한 0~100점
- requirementMatches: 공고의 핵심 요구/우대 사항을 4~8개 골라, 근거 사례(프로젝트명 — 사례 제목)와 연결. 프론트엔드와 백엔드(API·DB) 요구를 모두 포함하세요.
  - strong: 실무 사례가 충분 / partial: 관련 실무가 있으나 범위·깊이가 얕음 / gap: 근거 없음 (evidence에 보완 방법)
  - learning: 학습 중인 기술에 해당하는 요구. 실무 근거로 취급하지 말고, evidence에는 "학습 중"임을 솔직히 밝히는 설명 방법을 쓰세요.
- pros/cons: 지원자 관점에서 이 회사·포지션의 장단점 (공고에서 알 수 있는 범위로, 추측이면 추측이라고 표시)
- resumeTips: 이 공고에 맞춰 이력서에서 앞세울 사례와 고칠 표현. 백엔드 경험(API 설계, SQL 개선, BFF 등)을 어떻게 드러낼지 포함하세요. 학습 중인 기술을 실무 경험처럼 쓰라고 제안하지 마세요.
- 현재 직함과 목표 포지션이 다르면(예: "프론트엔드 선임" → 풀스택) 이를 감점 사유로 쓰지 말고, 서류·면접에서 질문받을 포인트로 cons나 interviewQuestions에 짚고 대비 방법을 주세요.
- interviewQuestions: 이 공고와 지원자 경험을 엮은 예상 질문 3개`,
  });
}
