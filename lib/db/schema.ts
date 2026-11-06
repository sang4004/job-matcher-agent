import {
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Analysis, Profile, RunStats, SearchSettings } from "../types";

/** 단일 행(id=1): 검색 조건 + 정제된 프로필 */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  search: jsonb("search").$type<SearchSettings>().notNull(),
  profile: jsonb("profile").$type<Profile | null>(),
  profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 단일 행(id=1): 마지막 실행 상태 */
export const latestRun = pgTable("latest_run", {
  id: integer("id").primaryKey().default(1),
  status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull(),
  message: text("message"),
  stats: jsonb("stats").$type<RunStats | null>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** 최신 추천 5건 (분석할 때마다 통째로 교체) */
export const recommendations = pgTable("recommendations", {
  rank: integer("rank").primaryKey(),
  jobId: text("job_id").notNull(),
  site: text("site").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  location: text("location"),
  experience: text("experience"),
  screenScore: real("screen_score").notNull(),
  analysis: jsonb("analysis").$type<Analysis>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 이미 추천했던 공고 (중복 추천 방지) */
export const seenJobs = pgTable("seen_jobs", {
  dedupeKey: text("dedupe_key").primaryKey(),
  jobId: text("job_id").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 수집된 공고 원본 (어디서 수집했든 분석기는 여기서 읽음) */
export const rawJobs = pgTable("raw_jobs", {
  id: text("id").primaryKey(),
  site: text("site").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  location: text("location"),
  experience: text("experience"),
  mainTasks: text("main_tasks").notNull(),
  requirements: text("requirements").notNull(),
  preferredPoints: text("preferred_points").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Notion 페이지 캐시 (last_edited_time 비교로 바뀐 페이지만 다시 받음) */
export const notionPages = pgTable("notion_pages", {
  pageId: text("page_id").primaryKey(),
  kind: text("kind").$type<"root" | "project">().notNull(),
  title: text("title").notNull(),
  period: text("period"),
  highlight: text("highlight"),
  lastEditedTime: text("last_edited_time").notNull(),
  markdown: text("markdown").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 매칭 근거 단위 (프로젝트 "개발 내용" 항목, "일하는 방식" 사례 등) */
export const evidenceUnits = pgTable("evidence_units", {
  id: text("id").primaryKey(), // e.g. hsad-ai-agent#6
  pageId: text("page_id").notNull(),
  project: text("project").notNull(),
  heading: text("heading").notNull(),
  body: text("body").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
});

/** 업로드한 보조 자료 (PDF 이력서, 경력기술서, 포트폴리오 슬라이드 내보내기) */
export const profileSources = pgTable("profile_sources", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  fileName: text("file_name").notNull(),
  text: text("text").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 로그인 실패 카운터 (IP별) */
export const loginAttempts = pgTable("login_attempts", {
  ip: text("ip").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
