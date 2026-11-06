/** GitHub Actions workflow_dispatch로 파이프라인 실행 */
export async function dispatchPipeline() {
  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_REPO;
  const workflow = process.env.GH_WORKFLOW ?? "pipeline.yml";
  const ref = process.env.GH_REF ?? "main";
  if (!token || !repo) throw new Error("GH_DISPATCH_TOKEN / GH_REPO 환경변수가 설정되지 않았습니다.");

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "job-matcher-agent",
      },
      body: JSON.stringify({ ref }),
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub workflow 실행 요청 실패 (${res.status}): ${await res.text()}`);
  }
}
