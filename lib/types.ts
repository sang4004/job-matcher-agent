import { z } from "zod";

export const SITES = ["wanted", "saramin", "jobkorea"] as const;
export type Site = (typeof SITES)[number];

export const SITE_LABEL: Record<Site, string> = {
  wanted: "원티드",
  saramin: "사람인",
  jobkorea: "잡코리아",
};

/** 크롤러가 수집한 공고 원본 (raw_jobs 테이블 한 행) */
export const RawJobSchema = z.object({
  id: z.string(), // wanted_123 / saramin_456 / jobkorea_789
  site: z.enum(SITES),
  company: z.string(),
  title: z.string(),
  url: z.string().url(),
  location: z.string().optional(),
  experience: z.string().optional(),
  mainTasks: z.string(),
  requirements: z.string(),
  preferredPoints: z.string(),
});
export type RawJob = z.infer<typeof RawJobSchema>;

/** 대시보드에서 편집하는 검색/제외 조건 */
export const SearchSettingsSchema = z.object({
  searchKeyword: z.string().min(1).default("프론트엔드"),
  excludeCompanies: z.array(z.string()).default([]),
  excludeKeywords: z.array(z.string()).default([]),
  minYears: z.number().int().min(0).nullable().default(null),
  maxYears: z.number().int().min(0).nullable().default(null),
  locations: z.array(z.string()).default([]),
  preferenceNote: z.string().default(""),
});
export type SearchSettings = z.infer<typeof SearchSettingsSchema>;

/** Pro가 정제한 후보자 프로필 */
export const ProfileSchema = z.object({
  summary: z.string().describe("지원자를 3~4문장으로 요약"),
  totalYears: z.number().describe("총 경력 연차 (소수 첫째 자리)"),
  currentRole: z.string(),
  coreSkills: z.array(z.string()).describe("주력 기술"),
  otherSkills: z.array(z.string()).describe("구현 경험이 있는 기타 기술"),
  domains: z.array(z.string()).describe("경험한 도메인 (예: AI Agent, 리테일, 채용, B2B)"),
  strengths: z.array(z.string()).describe("일하는 방식/강점, 근거가 있는 것만"),
  projects: z.array(
    z.object({
      name: z.string(),
      period: z.string(),
      role: z.string(),
      stack: z.array(z.string()),
      highlights: z.array(z.string()).describe("수치/결과 중심 성과 2~4개"),
    }),
  ),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Flash 1차 선별 결과 */
export const ScreeningSchema = z.object({
  candidates: z.array(
    z.object({
      jobId: z.string(),
      score: z.number().min(0).max(100),
      reason: z.string().describe("한두 문장 선별 사유"),
      evidenceIds: z.array(z.string()).describe("관련 있는 근거 사례 ID (최대 5개)"),
    }),
  ),
});
export type Screening = z.infer<typeof ScreeningSchema>;

/** Pro 심층 분석 결과 (recommendations.analysis) */
export const AnalysisSchema = z.object({
  fitScore: z.number().min(0).max(100),
  headline: z.string().describe("이 공고가 나와 맞는 이유 한 줄 요약"),
  whyFit: z.string().describe("왜 잘 맞는지 3~5문장"),
  pros: z.array(z.string()).describe("이 회사/포지션의 장점 (지원자 관점)"),
  cons: z.array(z.string()).describe("단점/우려 사항 (지원자 관점)"),
  requirementMatches: z.array(
    z.object({
      requirement: z.string().describe("공고의 요구/우대 사항"),
      status: z.enum(["strong", "partial", "gap"]),
      evidence: z.string().describe("매칭되는 사례 (프로젝트명 + 사례 제목). gap이면 보완 방법"),
    }),
  ),
  resumeTips: z.array(z.string()).describe("이 공고에 맞춰 이력서에서 강조/수정할 점"),
  interviewQuestions: z.array(z.string()).describe("예상 면접 질문 3개"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export type RunStats = {
  collected: Partial<Record<Site, number>>;
  collectErrors: Partial<Record<Site, string>>;
  pool: number;
  afterFilter: number;
  afterDedupe: number;
  screened: number;
};
