/** 로컬에서 Notion 동기화 + 프로필 갱신:  npm run profile:refresh [-- --force] */
import "dotenv/config";
import { refreshProfile } from "../lib/profile/build";

refreshProfile({ force: process.argv.includes("--force") })
  .then((r) => {
    console.log(
      `✅ Notion 페이지 ${r.totalPages}개 중 ${r.changedPageIds.length}개 갱신, 근거 사례 ${r.evidenceRebuilt}개 재생성`,
    );
    console.log(JSON.stringify(r.profile, null, 2));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
