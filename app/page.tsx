"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * 酷嗑 首頁 / Landing（product-spec 故事主線 + MVP 第 1 項入口）
 *
 * UX 重構（2026/09/27）：從「食譜搜尋」敘事改為「AI 陪你把一道菜做完」敘事。
 * - Hero 主 CTA 改為單一行動「帶我做一道菜」，食材輸入降級為次要行動
 * - 右側改成「陪做 Demo」互動模擬（純前端狀態機，非真實呼叫老師 agent）
 * - 六步驟旅程敘事取代「選菜/陪做/評分」功能三欄
 * - 安心感區塊：僅呈現老師 A 版已完成的「隨時文字提問」能力，不展示尚未完工的拍照救援（B 版）
 * - 我的廚房區塊改寫為「收藏＋進步紀錄」，不承諾口味個人化學習（out-of-scope 明確排除）
 * 圖片為 Gemini 生成的示意圖（public/landing/*），非抄取任何網站圖片。
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

  function focusSearch() {
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "center" });
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      {/* ===== Hero ===== */}
      <section className="relative mt-4 overflow-hidden rounded-3xl">
        <img
          src="/landing/hero-bg.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/90 to-cream/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-cream/80 to-transparent md:hidden" />

        {/* 食材裝飾：讓 Hero 更有「廚房正在發生事情」的感覺，不整齊排列、部分露出邊緣 */}
        <img
          src="/landing/mushroom.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-5 top-8 hidden h-24 w-24 rotate-[14deg] rounded-full object-cover opacity-90 shadow-lg md:block"
        />
        <img
          src="/landing/scallion.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-16 top-1 hidden h-16 w-16 -rotate-12 rounded-full object-cover opacity-90 shadow-md lg:block"
        />
        <img
          src="/landing/tomato.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-4 right-6 hidden h-20 w-20 rotate-6 rounded-full object-cover opacity-90 shadow-lg md:block"
        />

        <div className="relative grid gap-8 p-6 md:grid-cols-2 md:p-10">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-brand-border">
              <span className="h-1.5 w-1.5 rounded-full bg-herb" />
              AI 料理助手 · 專給料理新手
            </span>

            <h1 className="font-serif text-4xl font-black leading-tight text-ink md:text-5xl">
              第一次做菜，
              <br />
              也可以<span className="text-accent">把它做完</span>。
            </h1>

            <p className="mt-4 max-w-md text-ink-soft">
              不用懂料理，不用一次看懂整份食譜。AI
              會一步一步陪你做，卡住隨時可以問，做完還會告訴你做得怎麼樣。
            </p>

            {/* 主要 CTA：單一、明確 */}
            <button
              onClick={focusSearch}
              className="mt-6 w-fit rounded-full bg-primary px-7 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-primary-dark"
            >
              🍳 帶我做一道菜
            </button>

            {/* 次要行動：食材輸入（降級，但用語更像「跟 AI 說」而非「搜尋」） */}
            <div className="mt-6">
              <p className="text-sm font-medium text-ink">🧺 告訴我，你冰箱裡有什麼？</p>
              <p className="mb-2 text-xs text-ink-soft">有一樣也可以，想到什麼就告訴我。</p>
              <div
                id="search"
                className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-sm ring-1 ring-brand-border scroll-mt-24"
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

              <div className="mt-3 flex flex-wrap gap-2">
                {POPULAR.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => search(p.label)}
                    className="flex items-center gap-1.5 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3 text-xs ring-1 ring-brand-border transition hover:bg-white"
                  >
                    <img
                      src={p.img}
                      alt={p.label}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    {p.label}
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

          {/* 右側：陪做 Demo（產品最重要的展示，取代原本的食譜預覽卡） */}
          <div id="demo" className="flex items-center justify-center scroll-mt-24">
            <CookingDemo />
          </div>
        </div>
      </section>

      {/* ===== 完整旅程：從不知道吃什麼，到把菜做完 ===== */}
      <section
        id="journey"
        className="mt-6 rounded-3xl bg-surface/60 px-4 py-10 ring-1 ring-brand-border/60"
      >
        <h2 className="mb-8 text-center font-serif text-2xl font-bold text-ink">
          從「不知道吃什麼」到「把菜做完」
        </h2>
        {/* 冰箱走到餐桌的路徑感：食材/料理照取代部分 emoji、少量高低錯落，不做成六張一樣的資訊卡 */}
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <JourneyStep no="1" img="/landing/tomato.png" title="告訴我你有什麼" desc="輸入手邊或想吃的食材，一種或多種都可以。" />
          <JourneyStep no="2" emoji="🍽️" title="我幫你挑一道" desc="依你的廚房工具與飲食限制，推薦你做得到的菜。" offset />
          <JourneyStep no="3" img="/landing/dish.png" title="我陪你一步一步做" desc="每一步只給一個動作，火力、時間、怎麼看出做對了都寫清楚。" />
          <JourneyStep no="4" emoji="💬" title="卡住就問我" desc="看不懂食譜用語、不確定對不對，隨時打字問，我用這一步的食譜回答你。" offset />
          <JourneyStep no="5" emoji="📷" title="做完告訴我" desc="拍張成品照，我從色彩、擺盤、完成度給你分項回饋。" />
          <JourneyStep no="6" img="/landing/dish-pepper-chicken.png" title="收藏起來，看見進步" desc="喜歡的菜存起來，每次的成品與評語都留在你的作品集裡。" offset />
        </div>
      </section>

      {/* ===== 安心感：不會做菜也沒關係 ===== */}
      <section className="mt-6 rounded-3xl bg-white/70 px-4 py-10 ring-1 ring-brand-border/60">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-2xl font-bold text-ink">不會做菜？沒關係。</h2>
          <p className="mt-2 text-ink-soft">
            這些擔心很正常——我們把「隨時可以問」做進了陪做的每一步。
          </p>
        </div>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          <WorryCard worry="不知道怎麼切" />
          <WorryCard worry="不知道火要開多大" />
          <WorryCard worry="不知道該不該進行下一步" />
          <WorryCard worry="看不懂食譜寫的「適量」「炒到香」" />
        </div>

        {/* 情境展示：卡住時真的可以直接問，不是 FAQ */}
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-2">
          <p className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-cream px-4 py-2 text-sm text-ink ring-1 ring-brand-border">
            番茄到底要切多大？
          </p>
          <p className="mr-auto max-w-[80%] rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-2 text-sm text-primary-dark">
            大概一口大小就可以，不用切得很漂亮 😊
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center font-medium text-ink">
          💬 卡住的當下，直接打字問我。我會照著這一步的食譜回答你，不會把你丟在半路。
        </p>
      </section>

      {/* ===== 我的廚房：收藏與進步紀錄 ===== */}
      <section id="kitchen" className="py-12 text-center">
        <h2 className="font-serif text-2xl font-bold text-ink">每做完一道，都留下紀錄</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          收藏喜歡的食譜，把每次的成品照、分項評分都存進作品集，回頭看看自己越煮越上手。
        </p>

        {/* 真的跟 AI 做完過這些料理，不是食譜推薦 */}
        <div className="mx-auto mt-6 flex max-w-md justify-center gap-4">
          <CompletedDish img="/landing/dish.png" name="番茄炒蛋" rotate="-rotate-3" />
          <CompletedDish img="/landing/dish-pepper-chicken.png" name="黑胡椒雞" rotate="rotate-2" />
          <CompletedDish img="/landing/dish-chicken-salad.png" name="雞肉沙拉" rotate="-rotate-2" />
        </div>

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

/* ---------- 陪做 Demo（純前端狀態模擬，展示老師 A 版能力：一步一畫面＋隨時提問） ---------- */

type DemoStep = {
  title: string;
  body: string;
  primary: string;
  secondary?: string;
  reply?: string;
};

const DEMO_STEPS: DemoStep[] = [
  {
    title: "備料確認",
    body: "番茄、雞蛋、蔥都準備好了嗎？",
    primary: "✅ 都準備好了",
  },
  {
    title: "開火",
    body: "開中小火，鍋子熱了嗎？",
    primary: "🔥 開好了",
    secondary: "💬 我不知道火要多大",
    reply: "老師：中小火大概是刻度置中，鍋緣冒出一點油煙就是夠熱了。",
  },
  {
    title: "下鍋拌炒",
    body: "番茄下鍋，炒到邊緣微微出水。",
    primary: "✅ 做好了",
    secondary: "💬 這樣對嗎？",
    reply: "老師：番茄邊緣變軟、開始出水就是對的，可以接著下一步了。",
  },
  {
    title: "完成",
    body: "淋入蛋液拌炒均勻，起鍋！",
    primary: "🎉 完成這道菜",
  },
];

function CookingDemo() {
  const [step, setStep] = useState(0);
  const [reply, setReply] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const current = DEMO_STEPS[step];

  function handlePrimary() {
    if (step === DEMO_STEPS.length - 1) {
      setDone(true);
      return;
    }
    setStep((s) => s + 1);
    setReply(null);
  }

  function handleSecondary() {
    if (current.reply) setReply(current.reply);
  }

  function restart() {
    setStep(0);
    setReply(null);
    setDone(false);
  }

  return (
    <div className="w-full max-w-sm rounded-3xl bg-white/95 p-5 shadow-xl ring-1 ring-brand-border">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-serif text-lg font-bold text-ink">番茄炒蛋 · 陪做中</span>
        <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-brand-border">
          {done ? "完成" : `Step ${step + 1} / ${DEMO_STEPS.length}`}
        </span>
      </div>

      {/* 這道菜用到的食材：小型真實食材照，強化「正在廚房裡一起做菜」的感覺 */}
      <div className="mb-3 flex items-center gap-1.5">
        <img src="/landing/tomato.png" alt="番茄" className="h-6 w-6 rounded-full object-cover ring-2 ring-white" />
        <img src="/landing/egg.png" alt="雞蛋" className="-ml-2 h-6 w-6 rounded-full object-cover ring-2 ring-white" />
        <img src="/landing/scallion.png" alt="蔥" className="-ml-2 h-6 w-6 rounded-full object-cover ring-2 ring-white" />
        <span className="ml-1 text-xs text-ink-soft">番茄、雞蛋、蔥</span>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-cream p-6 text-center">
          <span className="text-4xl">🎉</span>
          <p className="font-semibold text-ink">這道菜做完了！</p>
          <p className="text-sm text-ink-soft">
            接下來拍照給評審看看，就能拿到色彩、擺盤、完成度的回饋。
          </p>
          <button
            onClick={restart}
            className="mt-1 rounded-full bg-surface px-4 py-1.5 text-sm font-medium text-ink ring-1 ring-brand-border hover:bg-white"
          >
            再看一次示範
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-xs font-medium text-ink-soft">{current.title}</p>
            <p className="mt-1 text-base font-medium text-ink">{current.body}</p>
          </div>

          {reply && (
            <p className="mt-3 rounded-2xl bg-primary/10 p-3 text-sm text-primary-dark">
              {reply}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handlePrimary}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              {current.primary}
            </button>
            {current.secondary && (
              <button
                onClick={handleSecondary}
                className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink-soft ring-1 ring-brand-border transition hover:text-ink"
              >
                {current.secondary}
              </button>
            )}
          </div>
        </>
      )}

      <p className="mt-4 text-center text-xs text-ink-soft">
        示範畫面，實際陪做以真實食譜步驟為準
      </p>
    </div>
  );
}

/* ---------- 小元件 ---------- */

function JourneyStep({
  no,
  title,
  emoji,
  img,
  desc,
  offset,
}: {
  no: string;
  title: string;
  emoji?: string;
  img?: string;
  desc: string;
  offset?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center md:flex-row md:items-start md:text-left ${offset ? "md:mt-6" : ""}`}
    >
      <div className="mb-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl md:mb-0 md:mr-4">
        {img ? (
          <img src={img} alt="" className="h-full w-full rounded-2xl object-cover" />
        ) : (
          emoji
        )}
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

function CompletedDish({
  img,
  name,
  rotate,
}: {
  img: string;
  name: string;
  rotate: string;
}) {
  return (
    <div className={`rounded-xl bg-white p-2 pb-3 shadow-md ring-1 ring-brand-border ${rotate}`}>
      <img src={img} alt={name} className="h-16 w-16 rounded-lg object-cover sm:h-20 sm:w-20" />
      <p className="mt-1.5 text-center text-xs text-ink-soft">{name}</p>
    </div>
  );
}

function WorryCard({ worry }: { worry: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 text-sm ring-1 ring-brand-border">
      <span className="text-lg">😥</span>
      <span className="text-ink">{worry}</span>
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
