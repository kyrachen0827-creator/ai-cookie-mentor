"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * 酷嗑 首頁 / Landing（product-spec 故事主線 + MVP 第 1 項入口）
 *
 * Hero：廚房背景照 + 大搜尋列 + 熱門食材快選（→ /recommend）+ 番茄炒蛋成品預覽卡。
 * 下方以 1 選菜 → 2 陪做 → 3 評分 的使用流程呈現（不用「N 段 AI」框架）。
 * 圖片為 Gemini 生成的示意圖（public/landing/*），非抄取任何網站圖片。
 * 註：拍照辨識食材屬 out-of-scope，故搜尋列不放拍照辨識功能。
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POPULAR = [
  { label: "番茄", img: "/landing/tomato.png" },
  { label: "花椰菜", img: "/landing/broccoli.png" },
  { label: "雞蛋", img: "/landing/egg.png" },
  { label: "雞胸肉", img: "/landing/chicken.png" },
  { label: "菇類", img: "/landing/mushroom.png" },
  { label: "青菜", img: "/landing/greens.png" },
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function search(text: string) {
    const ingredients = text
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ingredients.length === 0) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/recommend?ingredients=${encodeURIComponent(ingredients.join(","))}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      {/* ===== Hero ===== */}
      <section className="relative mt-4 overflow-hidden rounded-3xl">
        {/* 背景廚房照 + 讓左側文字可讀的漸層遮罩 */}
        <img
          src="/landing/hero-bg.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/90 to-cream/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-cream/80 to-transparent md:hidden" />

        <div className="relative grid gap-8 p-6 md:grid-cols-2 md:p-10">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-brand-border">
              <span className="h-1.5 w-1.5 rounded-full bg-herb" />
              AI 料理助手 · 專給料理新手
            </span>

            <h1 className="font-serif text-4xl font-black leading-tight text-ink md:text-5xl">
              想吃<span className="text-accent">番茄</span>，
              <br />
              卻不知道能做什麼？
            </h1>

            <p className="mt-4 max-w-md text-ink-soft">
              從「選菜」到「陪做」再「評分」，三位老師一路陪著你。做到一半沒人可問？做完不知道好不好？我們都幫你顧著。
            </p>

            {/* 主搜尋列 */}
            <div
              id="search"
              className="mt-6 flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-md ring-1 ring-brand-border scroll-mt-24"
            >
              <SearchIcon className="h-5 w-5 shrink-0 text-ink-soft" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search(query)}
                placeholder="輸入食材，例如：番茄、雞蛋、雞胸肉…"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-soft/60 md:text-base"
              />
              <button
                onClick={() => search(query)}
                aria-label="找菜"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark"
              >
                <SearchIcon className="h-5 w-5" />
              </button>
            </div>

            {/* 熱門食材快選 */}
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-ink-soft">熱門食材</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => search(p.label)}
                    className="flex flex-col items-center gap-1 rounded-2xl bg-white/90 p-2 ring-1 ring-brand-border transition hover:bg-white"
                  >
                    <img
                      src={p.img}
                      alt={p.label}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                    <span className="text-xs text-ink">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <a
              href="/setup"
              className="mt-5 w-fit text-sm text-ink-soft underline hover:text-ink"
            >
              先設定廚房工具與飲食限制
            </a>
          </div>

          {/* 右側：番茄炒蛋預覽卡 */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-sm rounded-3xl bg-white/95 p-4 shadow-xl ring-1 ring-brand-border">
              <div className="relative">
                <img
                  src="/landing/dish.png"
                  alt="番茄炒蛋"
                  className="h-44 w-full rounded-2xl object-cover"
                />
                <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-accent shadow-sm">
                  ♥
                </span>
              </div>
              <h3 className="mt-3 font-serif text-xl font-bold text-ink">番茄炒蛋</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-soft">
                <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-brand-border">
                  ⏱ 20 分鐘
                </span>
                <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-brand-border">
                  難度 簡單
                </span>
                <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-brand-border">
                  👥 2 人份
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-cream p-3 text-sm">
                <IngredientRow img="/landing/tomato.png" name="番茄" amount="2 顆" />
                <IngredientRow img="/landing/egg.png" name="雞蛋" amount="3 顆" />
                <IngredientRow img="/landing/scallion.png" name="青蔥" amount="1 根" />
                <IngredientRow emoji="🧂" name="鹽" amount="適量" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 使用流程：1 選菜 → 2 陪做 → 3 評分 ===== */}
      <section
        id="flow"
        className="mt-6 rounded-3xl bg-surface/60 px-4 py-10 ring-1 ring-brand-border/60"
      >
        <div className="grid gap-8 md:grid-cols-3">
          <FlowStep
            no="1"
            title="選菜"
            emoji="🧊"
            desc="輸入手邊食材，AI 立刻列出你做得到的菜，難度、時間一次看懂。"
          />
          <FlowStep
            no="2"
            title="陪做"
            emoji="🍲"
            desc="步驟清楚、圖文並茂，火力時間與「怎麼看出做對了」都寫給你，新手也不慌。"
          />
          <FlowStep
            no="3"
            title="評分"
            emoji="📷"
            desc="做完拍一張，AI 從色澤、擺盤、完成度給分與建議，累積你的料理成就。"
          />
        </div>
      </section>

      {/* ===== 我的廚房 ===== */}
      <section id="kitchen" className="py-12 text-center">
        <h2 className="font-serif text-2xl font-bold text-ink">我的廚房</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          收藏喜歡的食譜、把每次的成品與評分存進作品集，看著自己越煮越好。
        </p>
        <a
          href="/kitchen"
          className="mt-4 inline-block rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-brand-border transition hover:bg-white"
        >
          看我的作品集
        </a>
      </section>

      <footer className="border-t border-brand-border py-8 text-center text-sm text-ink-soft">
        酷嗑 · AI 料理助手 · Demo
      </footer>
    </div>
  );
}

/* ---------- 小元件 ---------- */

function IngredientRow({
  img,
  emoji,
  name,
  amount,
}: {
  img?: string;
  emoji?: string;
  name: string;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {img ? (
        <img src={img} alt={name} className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center text-base">{emoji}</span>
      )}
      <span className="text-ink">{name}</span>
      <span className="ml-auto text-ink-soft">{amount}</span>
    </div>
  );
}

function FlowStep({
  no,
  title,
  emoji,
  desc,
}: {
  no: string;
  title: string;
  emoji: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center text-center md:flex-row md:items-start md:text-left">
      <div className="mb-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl md:mb-0 md:mr-4">
        {emoji}
      </div>
      <div>
        <h3 className="font-serif text-lg font-bold text-ink">
          <span className="text-accent">{no}.</span> {title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{desc}</p>
      </div>
    </div>
  );
}

/* ---------- 圖示 ---------- */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
