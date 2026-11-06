import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

let _ai: GoogleGenAI | null = null;

function ai() {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

export function model(kind: "screener" | "analyzer"): string {
  const name = kind === "screener" ? process.env.SCREENER_MODEL : process.env.ANALYZER_MODEL;
  if (!name) {
    throw new Error(
      `${kind === "screener" ? "SCREENER_MODEL" : "ANALYZER_MODEL"} 환경변수가 설정되지 않았습니다.`,
    );
  }
  return name;
}

/** Gemini responseJsonSchema가 지원하지 않는 키워드 제거 */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "output" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

/** 구조화 출력으로 JSON을 받고 zod로 검증 */
export async function generateJson<T extends z.ZodType>(opts: {
  model: string;
  schema: T;
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<z.infer<T>> {
  const res = await ai().models.generateContent({
    model: opts.model,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(opts.schema),
      temperature: opts.temperature ?? 0.2,
    },
  });
  const text = res.text;
  if (!text) throw new Error(`${opts.model} 모델이 빈 응답을 반환했습니다.`);
  return opts.schema.parse(JSON.parse(text));
}
