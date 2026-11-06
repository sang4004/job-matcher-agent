"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, getSettings, schema } from "@/lib/db/client";
import { splitList } from "@/lib/filters";
import { extractFileText } from "@/lib/profile/sources";
import { requireAuth } from "@/lib/session";
import { SearchSettingsSchema } from "@/lib/types";

const toYears = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

export async function saveSearchSettings(form: FormData) {
  await requireAuth();
  const search = SearchSettingsSchema.parse({
    searchKeyword: String(form.get("searchKeyword") ?? "").trim() || "프론트엔드",
    excludeCompanies: splitList(String(form.get("excludeCompanies") ?? "")),
    excludeKeywords: splitList(String(form.get("excludeKeywords") ?? "")),
    minYears: toYears(form.get("minYears")),
    maxYears: toYears(form.get("maxYears")),
    locations: splitList(String(form.get("locations") ?? "")),
    preferenceNote: String(form.get("preferenceNote") ?? "").trim(),
  });
  await getSettings();
  await db().update(schema.settings).set({ search, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
  revalidatePath("/settings");
}

export async function uploadSource(form: FormData) {
  await requireAuth();
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) throw new Error("파일을 선택해주세요.");
  const text = await extractFileText(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!text) throw new Error("파일에서 텍스트를 추출하지 못했습니다. (스캔 이미지 PDF일 수 있음)");
  await db().insert(schema.profileSources).values({ label: label || file.name, fileName: file.name, text });
  revalidatePath("/settings");
}

export async function deleteSource(form: FormData) {
  await requireAuth();
  const id = Number(form.get("id"));
  await db().delete(schema.profileSources).where(eq(schema.profileSources.id, id));
  revalidatePath("/settings");
}

export async function clearSeenJobs() {
  await requireAuth();
  await db().delete(schema.seenJobs);
  revalidatePath("/settings");
}
