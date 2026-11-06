import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** 페이지/Server Action용: 미인증이면 로그인 페이지로 */
export async function requireAuth() {
  if (!(await isAuthenticated())) redirect("/login");
}
