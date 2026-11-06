import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 크롤러(Playwright)는 GitHub Actions 전용이라 Vercel 번들에서 제외
  serverExternalPackages: ["playwright"],
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
