import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "酷嗑 — AI 料理助手",
  description: "選菜 → 陪做 → 評分，三段 AI 一路陪料理新手完成一道菜",
};

// 手機優先（廚房情境）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF1E6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen font-sans text-ink">
        <Header />
        {children}
      </body>
    </html>
  );
}
