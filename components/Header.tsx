"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * 酷嗑 全站頁首
 *
 * 桌機顯示橫向導覽；手機用漢堡選單（修 U6：手機也能進我的廚房/設定等）。
 * nav 以使用者任務為主，而非系統功能分類。
 * 語系切換（EN 預設／中文）供 AI Builder Cup 繳交材料需英文的要求。
 */
const NAV = [
  { href: "/#search", en: "What to eat", zh: "今天吃什麼" },
  { href: "/kitchen", en: "My Kitchen", zh: "我的廚房" },
  { href: "/setup", en: "Settings", zh: "設定" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const { locale, setLocale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-border/60 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-serif text-lg font-bold text-white">
            酷
          </span>
          <span className="font-serif text-lg font-bold text-ink">{t("Kuke", "酷嗑")}</span>
        </Link>

        {/* 桌機導覽 */}
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {t(n.en, n.zh)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* 語系切換 */}
          <div className="hidden items-center overflow-hidden rounded-full ring-1 ring-brand-border sm:flex">
            <button
              onClick={() => setLocale("en")}
              className={`px-2.5 py-1.5 text-xs font-semibold transition ${
                locale === "en" ? "bg-primary text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLocale("zh")}
              className={`px-2.5 py-1.5 text-xs font-semibold transition ${
                locale === "zh" ? "bg-primary text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              中文
            </button>
          </div>

          <Link
            href="/#search"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark"
          >
            {t("🍳 Cook with me", "🍳 帶我做一道菜")}
          </Link>
          {/* 手機漢堡鈕 */}
          <button
            aria-label={t("Menu", "選單")}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-brand-border md:hidden"
          >
            <span className="text-lg leading-none text-ink">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {/* 手機下拉選單 */}
      {open && (
        <nav className="border-t border-brand-border/60 bg-cream px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-3 text-ink hover:bg-surface"
            >
              {t(n.en, n.zh)}
            </Link>
          ))}
          <div className="flex items-center gap-2 px-2 py-3">
            <span className="text-xs text-ink-soft">{t("Language", "語言")}</span>
            <button
              onClick={() => setLocale("en")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-brand-border ${
                locale === "en" ? "bg-primary text-white" : "text-ink-soft"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLocale("zh")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-brand-border ${
                locale === "zh" ? "bg-primary text-white" : "text-ink-soft"
              }`}
            >
              中文
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
