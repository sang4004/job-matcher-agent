import type { RawJob, SearchSettings } from "./types";

export function normalizeCompany(name: string): string {
  return name
    .replace(/\(주\)|㈜|주식회사|유한회사|\(유\)|inc\.?|corp\.?|co\.,?\s*ltd\.?|ltd\.?/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

export function normalizeTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, " ") // [회사명], (경력 3년 이상) 등 제거
    .replace(/채용|모집|구인|신입|경력|정규직|계약직|무관|\d+\s*년\s*(이상|↑)?/g, " ")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

/** 사이트가 달라도 같은 공고면 같은 키가 나오도록 */
export function dedupeKey(job: Pick<RawJob, "company" | "title">): string {
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}`;
}

/** "3~7년", "경력 3년↑", "신입·경력", "경력무관" 등에서 요구 경력 범위 추출 */
export function parseExperience(text?: string): {
  min: number | null;
  max: number | null;
  newcomerOnly: boolean;
} {
  if (!text) return { min: null, max: null, newcomerOnly: false };
  const nums = [...text.matchAll(/(\d+)\s*(?=년|~|-)/g)].map((m) => Number(m[1]));
  const range = text.match(/(\d+)\s*[~\-]\s*(\d+)/);
  const newcomerOnly = /신입/.test(text) && !/경력/.test(text);
  if (range) return { min: Number(range[1]), max: Number(range[2]), newcomerOnly };
  if (nums.length > 0) return { min: nums[0], max: null, newcomerOnly };
  return { min: null, max: null, newcomerOnly };
}

export type FilterReason =
  | "excluded_company"
  | "excluded_keyword"
  | "experience"
  | "location";

export function hardFilterReason(job: RawJob, s: SearchSettings): FilterReason | null {
  const company = normalizeCompany(job.company);
  if (s.excludeCompanies.some((c) => c.trim() && company.includes(normalizeCompany(c)))) {
    return "excluded_company";
  }

  const haystack = [job.company, job.title, job.mainTasks, job.requirements]
    .join("\n")
    .toLowerCase();
  if (s.excludeKeywords.some((k) => k.trim() && haystack.includes(k.trim().toLowerCase()))) {
    return "excluded_keyword";
  }

  const exp = parseExperience(job.experience);
  if (s.maxYears !== null && exp.min !== null && exp.min > s.maxYears) return "experience";
  if (s.minYears !== null) {
    if (exp.newcomerOnly) return "experience";
    if (exp.max !== null && exp.max < s.minYears) return "experience";
  }

  if (s.locations.length > 0 && job.location) {
    const ok = s.locations.some((loc) => loc.trim() && job.location!.includes(loc.trim()));
    if (!ok) return "location";
  }

  return null;
}

/**
 * 하드 필터 → 사이트 간 중복 병합 → 이전 추천 제외.
 * 같은 공고가 여러 사이트에 있으면 본문이 가장 긴 쪽을 남긴다.
 */
export function filterAndDedupe(
  jobs: RawJob[],
  settings: SearchSettings,
  seenKeys: Set<string>,
) {
  const passed = jobs.filter((j) => hardFilterReason(j, settings) === null);

  const byKey = new Map<string, RawJob>();
  for (const job of passed) {
    const key = dedupeKey(job);
    if (seenKeys.has(key)) continue;
    const prev = byKey.get(key);
    const len = (j: RawJob) => j.mainTasks.length + j.requirements.length + j.preferredPoints.length;
    if (!prev || len(job) > len(prev)) byKey.set(key, job);
  }

  return { afterFilter: passed.length, unique: [...byKey.values()] };
}

export function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
