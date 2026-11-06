/** 로그인 잠금 해제 (login_attempts 비우기):  npm run unlock-login */
import "dotenv/config";
import { db, schema } from "../lib/db/client";

const removed = await db().delete(schema.loginAttempts).returning({ ip: schema.loginAttempts.ip });
console.log(`✅ 잠금 기록 ${removed.length}건 삭제`);
