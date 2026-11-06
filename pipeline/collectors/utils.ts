/**
 * HTML 태그, 스크립트, 스타일 및 불필요한 공백을 제거하고 순수 텍스트만 정리합니다.
 */
export function cleanPureText(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 통짜 채용공고 본문 텍스트에서 주요업무 / 자격요건 / 우대사항 섹션을 휴리스틱하게 분리합니다.
 * 명확히 분리되지 않는 경우 본문 전체를 mainTasks에 담아 컨텍스트 유실을 방지합니다.
 */
export function splitJobSections(fullText: string): {
  mainTasks: string;
  requirements: string;
  preferredPoints: string;
} {
  const cleaned = cleanPureText(fullText);
  if (!cleaned) {
    return { mainTasks: "", requirements: "", preferredPoints: "" };
  }

  const reqRegex =
    /(?:자격\s*요건|지원\s*자격|필수\s*요건|필수\s*역량|이런\s*분을\s*찾습니다|Requirements|Qualifications)/i;
  const prefRegex =
    /(?:우대\s*사항|우대\s*조건|우대\s*역량|이런\s*분이면\s*더\s*좋습니다|Preferred|Plus)/i;
  const endSectionRegex =
    /(?:전형\s*절차|채용\s*절차|복리\s*후생|혜택\s*및\s*복지|근무\s*조건|제출\s*서류|기타\s*사항|Benefits)/i;

  const reqMatch = reqRegex.exec(cleaned);
  const prefMatch = prefRegex.exec(cleaned);

  if (!reqMatch && !prefMatch) {
    return {
      mainTasks: cleaned.slice(0, 3500),
      requirements: "(상세 본문 참조)",
      preferredPoints: "(상세 본문 참조)",
    };
  }

  const reqIdx = reqMatch ? reqMatch.index : -1;
  const prefIdx = prefMatch ? prefMatch.index : -1;

  let mainTasks = "";
  let requirements = "";
  let preferredPoints = "";

  if (reqIdx !== -1 && (prefIdx === -1 || reqIdx < prefIdx)) {
    mainTasks = cleaned.slice(0, reqIdx).trim();
    if (prefIdx !== -1) {
      requirements = cleaned.slice(reqIdx, prefIdx).trim();
      const rest = cleaned.slice(prefIdx);
      const endMatch = endSectionRegex.exec(rest.slice(10));
      preferredPoints = endMatch
        ? rest.slice(0, endMatch.index + 10).trim()
        : rest.trim();
    } else {
      const rest = cleaned.slice(reqIdx);
      const endMatch = endSectionRegex.exec(rest.slice(10));
      requirements = endMatch
        ? rest.slice(0, endMatch.index + 10).trim()
        : rest.trim();
      preferredPoints = "(우대사항 별도 표기 없음)";
    }
  } else if (prefIdx !== -1) {
    mainTasks = cleaned.slice(0, prefIdx).trim();
    requirements = "(상세 본문 내 포함)";
    const rest = cleaned.slice(prefIdx);
    const endMatch = endSectionRegex.exec(rest.slice(10));
    preferredPoints = endMatch
      ? rest.slice(0, endMatch.index + 10).trim()
      : rest.trim();
  }

  return {
    mainTasks: (mainTasks || cleaned).slice(0, 2500),
    requirements: (requirements || "(상세 본문 참조)").slice(0, 2000),
    preferredPoints: (preferredPoints || "(우대사항 별도 표기 없음)").slice(
      0,
      2000
    ),
  };
}

