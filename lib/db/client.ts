import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { SearchSettingsSchema, type SearchSettings } from "../types";

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  return drizzle(neon(url), { schema });
}

export function db() {
  if (!_db) _db = createDb();
  return _db;
}

export { schema };

export const DEFAULT_SEARCH: SearchSettings = SearchSettingsSchema.parse({});

/** settings 단일 행을 읽고, 없으면 기본값으로 생성 */
export async function getSettings() {
  const select = () => db().select().from(schema.settings).where(eq(schema.settings.id, 1));
  let [row] = await select();
  if (!row) {
    await db().insert(schema.settings).values({ id: 1, search: DEFAULT_SEARCH }).onConflictDoNothing();
    [row] = await select();
  }
  return { ...row, search: SearchSettingsSchema.parse(row.search) };
}

export async function getLatestRun() {
  const rows = await db().select().from(schema.latestRun).where(eq(schema.latestRun.id, 1));
  return rows[0] ?? null;
}

export async function setLatestRun(
  values: Omit<typeof schema.latestRun.$inferInsert, "id">,
) {
  await db()
    .insert(schema.latestRun)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: schema.latestRun.id, set: values });
}
