/**
 * 비밀번호가 로컬 .env의 AUTH_PASSWORD_HASH_B64와 맞는지 확인
 *   npm run -s check-password
 * (Vercel에 넣은 값이 로컬 .env와 같을 때만 의미가 있음)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { readPasswordHash } from "../lib/password";

async function readLine(question: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  // 입력값이 화면에 보이지 않게
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.startsWith(question)) process.stderr.write(question);
  };
  const answer = await rl.question(question);
  rl.close();
  process.stderr.write("\n");
  return answer;
}

async function main() {
  const hash = readPasswordHash(); // 형식이 깨졌으면 여기서 이유와 함께 실패
  const password = process.argv[2] ?? (await readLine("비밀번호: "));
  console.log(bcrypt.compareSync(password, hash) ? "✅ 일치합니다" : "❌ 일치하지 않습니다");
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
