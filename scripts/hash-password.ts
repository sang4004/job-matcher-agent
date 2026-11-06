/** 사용법: npm run hash-password -- '내비밀번호'  → AUTH_PASSWORD_HASH_B64 값 출력 */
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("8자 이상 비밀번호를 인자로 넣어주세요: npm run hash-password -- 'password'");
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
// .env에서 '$'가 변수 확장으로 해석되지 않도록 base64로 인코딩
console.log(Buffer.from(hash).toString("base64"));
