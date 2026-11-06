/**
 * 비밀번호가 로컬 .env의 AUTH_PASSWORD_HASH_B64와 맞는지 확인
 * 사용법: npm run check-password -- '비밀번호'
 * (Vercel에 넣은 값이 로컬 .env와 같을 때만 의미가 있음)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

const password = process.argv[2];
const b64 = process.env.AUTH_PASSWORD_HASH_B64;
if (!password) {
  console.error("비밀번호를 인자로 넣어주세요: npm run check-password -- 'password'");
  process.exit(1);
}
if (!b64) {
  console.error("로컬 .env에 AUTH_PASSWORD_HASH_B64가 없습니다.");
  process.exit(1);
}
const ok = bcrypt.compareSync(password, Buffer.from(b64, "base64").toString("utf8"));
console.log(ok ? "✅ 일치합니다" : "❌ 일치하지 않습니다");
