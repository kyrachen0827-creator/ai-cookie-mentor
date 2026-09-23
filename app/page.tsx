"use client";

/**
 * 灶火 ZaoHuo 首頁 / Landing（product-spec 故事主線 + MVP 第 1 項入口）
 *
 * Hero 內含可用的食材搜尋（→ /recommend）。其餘區塊介紹三段 AI 與評分概念，
 * 對應 product-spec「三個 AI 角色」；陪做／評分／作品集為後續 Phase，此處為說明。
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function goSearch() {
    const ingredients = query
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
      <section id="select" className="grid gap-10 py-10 md:grid-cols-2 md:py-16">
        <div className="flex flex-col justify-center">
          <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-brand-border">
            <span className="h-1.5 w-1.5 rounded-full bg-herb" />
            AI 料理助手 · 專給料理新手
          </span>

          <h1 className="font-serif text-4xl font-black leading-tight text-ink md:text-5xl">
            想吃<span className="text-accent">番茄</span>，
            <br />
            卻不知道能做什麼？
          </h1>

          <p className="mt-5 max-w-md text-ink-soft">
            從「選菜」到「陪做」再「評分」，三位老師一路陪著你。做到一半沒人可問？做完不知道好不好？我們都幫你顧著。
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={goSearch}
              className="rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:opacity-90"
            >
              輸入食材，看食譜
            </button>
            <a
              href="#flow"
              className="rounded-full bg-surface px-6 py-3 font-semibold text-ink ring-1 ring-brand-border transition hover:bg-white"
            >
              看今天怎麼做
            </a>
          </div>

          <a
            href="/setup"
            className="mt-4 w-fit text-sm text-ink-soft underline hover:text-ink"
          >
            先設定廚房工具與飲食限制
          </a>

          <div className="mt-8 flex gap-10">
            <div>
              <div className="font-serif text-2xl font-bold text-accent">12k+</div>
              <div className="text-sm text-ink-soft">新手成功下鍋</div>
            </div>
            <div>
              <div className="font-serif text-2xl font-bold text-herb">4.8</div>
              <div className="text-sm text-ink-soft">菜色平均評分</div>
            </div>
          </div>
        </div>

        {/* 右側：選菜預覽卡（搜尋可用） */}
        <div className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-brand-border">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">選菜 · 食譜推薦</span>
            <span className="text-accent">AI 已為你挑好</span>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-cream px-3 py-2 ring-1 ring-brand-border">
            <SearchIcon className="h-4 w-4 text-ink-soft" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goSearch()}
              placeholder="番茄"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft/60"
            />
            <button
              onClick={goSearch}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              找菜
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewRecipe name="番茄蛋花湯" desc="酸甜開胃，新手零失敗第一道。" min="15 分" tags={["簡單", "低成本"]} />
            <PreviewRecipe name="番茄燜牛腩" desc="慢火燜煮，醬汁濃稠超下飯。" min="90 分" tags={["下飯", "宴客"]} />
          </div>

          {/* 料理老師預覽 */}
          <div className="mt-3 rounded-2xl bg-herb/10 p-4 ring-1 ring-herb/20">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-herb/20 text-herb">
                <ChefIcon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-ink">料理老師 · 正在陪做</span>
              <span className="ml-auto text-xs text-ink-soft">第 3 步 / 共 6 步</span>
            </div>
            <p className="text-sm text-ink-soft">
              「火轉中火，蛋液要邊倒邊攪，才能出細細的蛋花喔。」
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-herb/15">
              <div className="h-full w-1/2 rounded-full bg-herb" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 三段 AI ===== */}
      <section id="flow" className="py-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-ink">三位老師，陪你一路做完最佳美肴</h2>
          <span className="hidden text-sm text-ink-soft sm:block">選菜 → 陪做 → 評分</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<SearchIcon className="h-5 w-5" />}
            title="食譜推薦"
            desc="輸入手邊食材，AI 立刻列出你能做的菜，難度、時間、成本一次看懂。"
          />
          <div id="teach">
            <FeatureCard
              icon={<ChefIcon className="h-5 w-5" />}
              title="料理老師"
              desc="做到一半卡住？逐步驟陪做，隨時間、隨時答，像有人站在旁邊。"
            />
          </div>
          <FeatureCard
            icon={<StarIcon className="h-5 w-5" />}
            title="AI 評審"
            desc="拍一張成品照，AI 給分並告訴哪裡可以更好，做得好也幫你鼓掌。"
          />
        </div>
      </section>

      {/* ===== 評分預覽（深色） ===== */}
      <section id="judge" className="py-10">
        <div className="grid gap-8 rounded-3xl bg-dark-cook p-8 md:grid-cols-2 md:p-10">
          <div className="flex flex-col justify-center">
            <span className="mb-3 text-sm font-semibold text-primary">AI 評審</span>
            <h2 className="font-serif text-3xl font-bold leading-tight text-[#F5E9DC]">
              做完拍一張，
              <br />
              就知道好不好
            </h2>
            <p className="mt-4 max-w-sm text-[#C9B7A6]">
              上傳成品，AI 從色澤、火候、擺盤給出評分與具體建議，讓每一道菜都比上次更好吃。
            </p>
          </div>
          <div className="rounded-2xl bg-[#3A2A20] p-6">
            <div className="mb-5 flex items-baseline justify-between">
              <span className="font-semibold text-[#F5E9DC]">番茄蛋花湯</span>
              <span className="font-serif text-4xl font-bold text-primary">8.6</span>
            </div>
            <ScoreBar label="色澤" value={9} />
            <ScoreBar label="火候" value={8} />
            <ScoreBar label="擺盤" value={8} />
          </div>
        </div>
      </section>

      {/* ===== 我的廚房（作品集，Phase 4） ===== */}
      <section id="kitchen" className="py-10 text-center">
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

function PreviewRecipe({
  name,
  desc,
  min,
  tags,
}: {
  name: string;
  desc: string;
  min: string;
  tags: string[];
}) {
  return (
    <div className="rounded-2xl bg-cream p-4 ring-1 ring-brand-border">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-ink">{name}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-brand-border">
          {min}
        </span>
      </div>
      <p className="mb-3 text-sm text-ink-soft">{desc}</p>
      <div className="flex gap-2">
        {tags.map((t) => (
          <span key={t} className="rounded-md bg-surface px-2 py-0.5 text-xs text-ink-soft ring-1 ring-brand-border">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-6 ring-1 ring-brand-border">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <h3 className="mb-2 font-serif text-lg font-bold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-soft">{desc}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="w-10 text-sm text-[#C9B7A6]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#4A3A2F]">
        <div
          className="h-full rounded-full bg-[#E0A75B]"
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="w-4 text-right text-sm text-[#F5E9DC]">{value}</span>
    </div>
  );
}

/* ---------- 圖示 ---------- */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ChefIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 13a4 4 0 1 1 1.2-7.8A4 4 0 0 1 15 5a4 4 0 1 1 3 7.4" />
      <path d="M6 13v6h12v-6" />
      <path d="M9 19v-3M15 19v-3" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.9 1-5.8L3.5 9.2l5.9-.9z" />
    </svg>
  );
}
