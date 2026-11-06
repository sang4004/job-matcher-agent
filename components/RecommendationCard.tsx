import { SITE_LABEL, type Analysis, type Site } from "@/lib/types";

type Rec = {
  rank: number;
  site: string;
  company: string;
  title: string;
  url: string;
  location: string | null;
  experience: string | null;
  analysis: Analysis;
};

const STATUS_STYLE: Record<Analysis["requirementMatches"][number]["status"], string> = {
  strong: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  gap: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};
const STATUS_LABEL = { strong: "충족", partial: "부분", gap: "부족" } as const;

function List({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className={`mb-1 text-sm font-semibold ${tone ?? ""}`}>{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RecommendationCard({ rec }: { rec: Rec }) {
  const a = rec.analysis;
  return (
    <article className="card space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-neutral-500">
            #{rec.rank} · {SITE_LABEL[rec.site as Site] ?? rec.site}
            {rec.experience && ` · ${rec.experience}`}
            {rec.location && ` · ${rec.location}`}
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            <a href={rec.url} target="_blank" rel="noreferrer" className="hover:underline">
              {rec.company} — {rec.title}
            </a>
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{a.headline}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-bold tabular-nums">{a.fitScore}</div>
          <div className="text-xs text-neutral-500">적합도</div>
        </div>
      </header>

      <p className="text-sm leading-relaxed">{a.whyFit}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <List title="장점" items={a.pros} tone="text-emerald-700 dark:text-emerald-400" />
        <List title="단점 · 우려" items={a.cons} tone="text-rose-700 dark:text-rose-400" />
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold">요구사항 ↔ 내 경험 ({a.requirementMatches.length})</summary>
        <ul className="mt-2 space-y-2">
          {a.requirementMatches.map((m, i) => (
            <li key={i} className="text-sm">
              <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
              <span className="font-medium">{m.requirement}</span>
              <p className="ml-1 mt-0.5 text-neutral-600 dark:text-neutral-400">→ {m.evidence}</p>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-semibold">이력서 팁 · 예상 질문</summary>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <List title="이력서에서 강조할 점" items={a.resumeTips} />
          <List title="예상 면접 질문" items={a.interviewQuestions} />
        </div>
      </details>
    </article>
  );
}
