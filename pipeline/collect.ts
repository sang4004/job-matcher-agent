/**
 * 로컬에서 특정 사이트만 수집해 DB(raw_jobs)에 넣는다.
 * 예) 잡코리아가 Actions에서 막힐 때:  npm run collect -- jobkorea
 * 그 다음 대시보드에서 분석 실행 (Actions에서 COLLECT_SITES를 조정하거나 그대로 둬도 됨)
 */
import "dotenv/config";
import { getSettings } from "../lib/db/client";
import { collect, parseSites } from "./collectors";

async function main() {
  const sites = parseSites(process.argv.slice(2).join(",") || undefined);
  const { search } = await getSettings();
  const windowDays = Number(process.env.RAW_JOB_WINDOW_DAYS || 7);
  console.log(`📥 수집 대상: ${sites.join(", ")}`);
  const result = await collect(sites, search, windowDays);
  console.log("결과:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
