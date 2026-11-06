import { extractText, getDocumentProxy } from "unpdf";

export const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".txt"];

/** PDF/Markdown/텍스트 파일에서 텍스트 추출 (Google Docs·Slides는 PDF로 내보내서 업로드) */
export async function extractFileText(fileName: string, bytes: Uint8Array): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    return new TextDecoder().decode(bytes).trim();
  }
  throw new Error(`지원하지 않는 파일 형식입니다: ${fileName} (${ACCEPTED_EXTENSIONS.join(", ")}만 가능)`);
}
