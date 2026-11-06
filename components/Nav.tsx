import Link from "next/link";

export function Nav({ current }: { current: "home" | "settings" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-neutral-200 font-medium dark:bg-neutral-800" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="mr-4 font-semibold">Job Matcher</span>
          {link("/", "추천 공고", current === "home")}
          {link("/settings", "설정 · 프로필", current === "settings")}
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">로그아웃</button>
        </form>
      </div>
    </header>
  );
}
