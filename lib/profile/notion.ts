import { Client, isFullBlock, isFullPage } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { inArray } from "drizzle-orm";
import { db, schema } from "../db/client";

type NotionPage = typeof schema.notionPages.$inferInsert;

function client() {
  const auth = process.env.NOTION_TOKEN;
  if (!auth) throw new Error("NOTION_TOKEN 환경변수가 설정되지 않았습니다.");
  return new Client({ auth });
}

function rt(items: RichTextItemResponse[]): string {
  return items
    .map((t) => {
      const text = t.plain_text;
      if (!text.trim()) return text;
      if (t.annotations.code) return `\`${text}\``;
      if (t.annotations.bold) return `**${text}**`;
      return text;
    })
    .join("");
}

function pageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  }
  return "(제목 없음)";
}

function propText(page: PageObjectResponse, name: string): string | null {
  const prop = page.properties[name];
  if (!prop) return null;
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("") || null;
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("") || null;
  if (prop.type === "date") return [prop.date?.start, prop.date?.end].filter(Boolean).join(" ~ ") || null;
  if (prop.type === "multi_select") return prop.multi_select.map((o) => o.name).join(", ") || null;
  if (prop.type === "select") return prop.select?.name ?? null;
  return null;
}

async function listChildren(notion: Client, blockId: string): Promise<BlockObjectResponse[]> {
  const out: BlockObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    out.push(...res.results.filter(isFullBlock));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

/** 블록 트리를 Markdown으로 변환. child_database는 id를 수집만 한다. */
async function blocksToMarkdown(
  notion: Client,
  blockId: string,
  databases: string[],
  depth = 0,
): Promise<string> {
  if (depth > 6) return "";
  const blocks = await listChildren(notion, blockId);
  const indent = "  ".repeat(Math.max(0, depth - 1));
  const lines: string[] = [];
  let numbered = 0;

  for (const b of blocks) {
    numbered = b.type === "numbered_list_item" ? numbered + 1 : 0;
    const children = async (d = depth + 1) =>
      b.has_children ? await blocksToMarkdown(notion, b.id, databases, d) : "";

    switch (b.type) {
      case "paragraph":
        lines.push(indent + rt(b.paragraph.rich_text), await children());
        break;
      case "heading_1":
        lines.push(`\n# ${rt(b.heading_1.rich_text)}`, await children());
        break;
      case "heading_2":
        lines.push(`\n## ${rt(b.heading_2.rich_text)}`, await children());
        break;
      case "heading_3":
        lines.push(`\n### ${rt(b.heading_3.rich_text)}`, await children());
        break;
      case "bulleted_list_item":
        lines.push(`${indent}- ${rt(b.bulleted_list_item.rich_text)}`, await children());
        break;
      case "numbered_list_item":
        lines.push(`${indent}${numbered}. ${rt(b.numbered_list_item.rich_text)}`, await children());
        break;
      case "to_do":
        lines.push(`${indent}- [${b.to_do.checked ? "x" : " "}] ${rt(b.to_do.rich_text)}`, await children());
        break;
      case "toggle":
        lines.push(`${indent}- ${rt(b.toggle.rich_text)}`, await children());
        break;
      case "quote":
        lines.push(`> ${rt(b.quote.rich_text)}`, await children());
        break;
      case "callout":
        lines.push(`> ${rt(b.callout.rich_text)}`, await children());
        break;
      case "code":
        lines.push("```" + b.code.language, rt(b.code.rich_text), "```");
        break;
      case "divider":
        lines.push("---");
        break;
      case "table": {
        const rows = await listChildren(notion, b.id);
        rows.forEach((row, i) => {
          if (row.type !== "table_row") return;
          lines.push(`| ${row.table_row.cells.map((c) => rt(c).replace(/\n/g, " ")).join(" | ")} |`);
          if (i === 0) lines.push(`|${" --- |".repeat(row.table_row.cells.length)}`);
        });
        break;
      }
      case "column_list":
      case "column":
      case "synced_block":
        lines.push(await blocksToMarkdown(notion, b.id, databases, depth));
        break;
      case "child_database":
        databases.push(b.id);
        lines.push(`[데이터베이스: ${b.child_database.title}]`);
        break;
      case "child_page":
        lines.push(`[하위 페이지: ${b.child_page.title}]`);
        break;
      case "image": {
        const caption = rt(b.image.caption);
        if (caption) lines.push(`[이미지: ${caption}]`);
        break;
      }
      case "bookmark":
        lines.push(b.bookmark.url);
        break;
      default:
        break;
    }
  }

  return lines.filter((l) => l !== "").join("\n");
}

async function queryDatabaseRows(notion: Client, databaseId: string): Promise<PageObjectResponse[]> {
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const sources = "data_sources" in database ? database.data_sources : [];
  const rows: PageObjectResponse[] = [];
  for (const source of sources) {
    let cursor: string | undefined;
    do {
      const res = await notion.dataSources.query({
        data_source_id: source.id,
        start_cursor: cursor,
        page_size: 100,
      });
      rows.push(...res.results.filter((r): r is PageObjectResponse => r.object === "page" && isFullPage(r)));
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }
  return rows;
}

/**
 * 최상위 페이지와 하위 프로젝트 DB를 동기화한다.
 * last_edited_time이 바뀐 페이지만 블록을 다시 받아온다.
 */
export async function syncNotion(opts: { force?: boolean } = {}) {
  const rootId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootId) throw new Error("NOTION_ROOT_PAGE_ID 환경변수가 설정되지 않았습니다.");

  const notion = client();
  const cached = new Map(
    (await db().select().from(schema.notionPages)).map((p) => [p.pageId, p]),
  );
  const isStale = (id: string, edited: string) =>
    opts.force || cached.get(id)?.lastEditedTime !== edited;

  const changed: NotionPage[] = [];
  const keepIds: string[] = [];

  // 1) 최상위 페이지
  const root = await notion.pages.retrieve({ page_id: rootId });
  if (!isFullPage(root)) throw new Error("Notion 최상위 페이지에 접근할 수 없습니다. integration 연결을 확인하세요.");
  keepIds.push(root.id);

  const databases: string[] = [];
  // DB id 수집을 위해 루트 블록은 항상 순회 (블록 수가 적어 비용이 작음)
  const rootMarkdown = await blocksToMarkdown(notion, root.id, databases);
  if (isStale(root.id, root.last_edited_time)) {
    changed.push({
      pageId: root.id,
      kind: "root",
      title: pageTitle(root),
      lastEditedTime: root.last_edited_time,
      markdown: rootMarkdown,
    });
  }

  // 2) 프로젝트 DB 행들
  for (const dbId of databases) {
    for (const row of await queryDatabaseRows(notion, dbId)) {
      keepIds.push(row.id);
      if (!isStale(row.id, row.last_edited_time)) continue;
      const markdown = await blocksToMarkdown(notion, row.id, []);
      changed.push({
        pageId: row.id,
        kind: "project",
        title: pageTitle(row),
        period: propText(row, "참여 기간"),
        highlight: propText(row, "대표 성과"),
        lastEditedTime: row.last_edited_time,
        markdown,
      });
    }
  }

  // 3) 저장
  for (const page of changed) {
    await db()
      .insert(schema.notionPages)
      .values(page)
      .onConflictDoUpdate({
        target: schema.notionPages.pageId,
        set: { ...page, syncedAt: new Date() },
      });
  }
  const removed = [...cached.keys()].filter((id) => !keepIds.includes(id));
  if (removed.length > 0) {
    await db().delete(schema.notionPages).where(inArray(schema.notionPages.pageId, removed));
    await db().delete(schema.evidenceUnits).where(inArray(schema.evidenceUnits.pageId, removed));
  }

  return {
    changedPageIds: changed.map((p) => p.pageId),
    removedPageIds: removed,
    totalPages: keepIds.length,
  };
}
