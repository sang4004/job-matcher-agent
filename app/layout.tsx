import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Matcher",
  description: "내 경력과 맞는 채용 공고 추천",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
