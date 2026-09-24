"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 酷嗑 全站頁首
 *
 * 桌機顯示橫向導覽；手機用漢堡選單（修 U6：手機也能進我的廚房/設定等）。
 * nav 對應三段 AI 與作品集、設定。
 */
const NAV = [
  { href: "/#search", label: "選菜" },
  { href: "/#teach", label: "陪做" },
  { href: "/#judge", label: "評分" },
  { href: "/kitchen", label: "我的廚房" },
  { href: "/setup", label: "設定" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-border/60 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-serif text-lg font-bold text-white">
            酷
          </span>
          <span className="font-serif text-lg font-bold text-ink">酷嗑</span>
        </Link>

        {/* 桌機導覽 */}
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/#search"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark"
          >
            開始做菜
          </Link>
          {/* 手機漢堡鈕 */}
          <button
            aria-label="選單"
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
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
