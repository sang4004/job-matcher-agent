const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export class PasswordConfigError extends Error {}

/**
 * AUTH_PASSWORD_HASH_B64를 bcrypt 해시로 해석한다.
 * - 앞뒤 공백/따옴표 제거
 * - base64 값이 기본이지만, 원본 bcrypt 해시($2b$...)를 넣어도 허용
 * - 형식이 깨졌으면(복사 실수 등) PasswordConfigError
 */
export function readPasswordHash(raw = process.env.AUTH_PASSWORD_HASH_B64): string {
  if (!raw) throw new PasswordConfigError("AUTH_PASSWORD_HASH_B64가 설정되지 않았습니다.");
  const value = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  const hash = value.startsWith("$2") ? value : Buffer.from(value, "base64").toString("utf8");
  if (!BCRYPT_RE.test(hash)) {
    throw new PasswordConfigError(
      `AUTH_PASSWORD_HASH_B64 형식이 올바르지 않습니다 (길이 ${value.length}자, 정상은 80자). 출력값 한 줄만 복사했는지 확인하세요.`,
    );
  }
  return hash;
}
