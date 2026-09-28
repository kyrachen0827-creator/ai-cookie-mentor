import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";

export const metadata: Metadata = {
  title: "Kuke — AI Cooking Companion",
  description:
    "Pick a dish, cook step by step, get feedback — three AI helpers guide cooking beginners through a whole dish.",
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
    <html lang="en">
      <body className="min-h-screen font-sans text-ink">
        <LocaleProvider>
          <Header />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
