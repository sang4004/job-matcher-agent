import { NextResponse } from "next/server";
import { getLatestRun } from "@/lib/db/client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const run = await getLatestRun();
  return NextResponse.json({ status: run?.status ?? null, message: run?.message ?? null });
}
