import { PasswordInput } from "@/components/PasswordInput";

const ERRORS: Record<string, string> = {
  invalid: "비밀번호가 올바르지 않습니다.",
  locked: "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action="/api/login" method="post" className="card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Job Matcher</h1>
        <div>
          <label htmlFor="password" className="label">
            비밀번호
          </label>
          <PasswordInput id="password" name="password" />
        </div>
        {error && <p className="text-sm text-red-600">{ERRORS[error] ?? "로그인에 실패했습니다."}</p>}
        <button type="submit" className="btn-primary w-full">
          들어가기
        </button>
      </form>
    </main>
  );
}
