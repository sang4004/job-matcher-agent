import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { PasswordConfigError, readPasswordHash } from "@/lib/password";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

function back(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // 해시 설정이 깨져 있으면 "틀린 비밀번호"와 구분해서 알리고, 실패 횟수도 올리지 않는다
  let hash: string;
  try {
    hash = readPasswordHash();
  } catch (e) {
    if (e instanceof PasswordConfigError) {
      console.error(`[login] ${e.message}`);
      return back(request, "config");
    }
    throw e;
  }

  const [attempt] = await db().select().from(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip));

  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    return back(request, "locked");
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const ok = password.length > 0 && (await bcrypt.compare(password, hash));

  if (!ok) {
    const failures = (attempt?.lockedUntil && attempt.lockedUntil <= new Date() ? 0 : (attempt?.failures ?? 0)) + 1;
    const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await db()
      .insert(schema.loginAttempts)
      .values({ ip, failures, lockedUntil, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.loginAttempts.ip, set: { failures, lockedUntil, updatedAt: new Date() } });
    return back(request, lockedUntil ? "locked" : "invalid");
  }

  if (attempt) await db().delete(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip));

  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
