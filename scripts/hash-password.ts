/**
 * 대시보드 비밀번호 해시 만들기
 *   npm run -s hash-password
 * 비밀번호는 화면에 표시되지 않게 입력받고, Vercel/.env에 넣을 값 한 줄만 출력한다.
 * (인자로 넘기면 셸 기록과 npm 안내 줄에 비밀번호가 남으므로 권장하지 않음)
 */
import bcrypt from "bcryptjs";
import { readPasswordHash } from "../lib/password";

async function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    // 파이프 입력 (예: echo pw | npm run -s hash-password)
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130); // Ctrl+C
        if (c === "\u007f") value = value.slice(0, -1); // Backspace
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = process.argv[2] ?? (await promptHidden("비밀번호: "));
  if (password.length < 8) {
    console.error("8자 이상이어야 합니다.");
    process.exit(1);
  }
  if (!process.argv[2] && process.stdin.isTTY) {
    const again = await promptHidden("한 번 더: ");
    if (again !== password) {
      console.error("두 입력이 다릅니다.");
      process.exit(1);
    }
  }

  // .env에서 '$'가 변수 확장으로 해석되지 않도록 base64로 인코딩
  const value = Buffer.from(bcrypt.hashSync(password, 12)).toString("base64");
  // 자체 검증: 대시보드가 읽는 방식 그대로 다시 읽어 비교
  if (!bcrypt.compareSync(password, readPasswordHash(value))) throw new Error("자체 검증 실패");

  process.stderr.write("\n아래 값 한 줄만 Vercel의 AUTH_PASSWORD_HASH_B64와 로컬 .env에 넣으세요 (80자):\n\n");
  console.log(value);
}

main();
