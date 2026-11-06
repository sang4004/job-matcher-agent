import { chromium, type BrowserContext } from "playwright";
import path from "node:path";
import fs from "node:fs";

export interface LaunchBrowserOptions {
  headless?: boolean;
  sessionDir?: string;
}

/**
 * 로컬 `.chrome-session` 디렉토리에 쿠키, 로컬 스토리지 등 로그인 세션을 유지하는
 * Playwright Persistent Context 생성 헬퍼 함수
 */
export async function launchPersistentBrowser(
  options: LaunchBrowserOptions = {}
): Promise<BrowserContext> {
  const sessionDir =
    options.sessionDir ?? path.resolve(process.cwd(), ".chrome-session");
  const headless =
    options.headless ?? process.env.HEADLESS !== "false";

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless,
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  return context;
}

