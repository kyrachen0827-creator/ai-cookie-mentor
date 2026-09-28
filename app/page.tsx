"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * 酷嗑 首頁 / Landing（product-spec 故事主線 + MVP 第 1 項入口）
 *
 * UX 重構（2026/09/27）：從「食譜搜尋」敘事改為「AI 陪你把一道菜做完」敘事。
 * 語系（2026/09/28）：AI Builder Cup 要求繳交材料英文，預設英文、可切中文，見 lib/i18n。
 * 圖片為 Gemini 生成的示意圖（public/landing/*），非抄取任何網站圖片。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { listInProgressSessions, type StoredCookingSession } from "@/lib/data/session-client";

const POPULAR = [
  { en: "Tomato", zh: "番茄", img: "/landing/tomato.png" },
  { en: "Broccoli", zh: "花椰菜", img: "/landing/broccoli.png" },
  { en: "Egg", zh: "雞蛋", img: "/landing/egg.png" },
  { en: "Chicken Breast", zh: "雞胸肉", img: "/landing/chicken.png" },
  { en: "Mushroom", zh: "菇類", img: "/landing/mushroom.png" },
  { en: "Leafy Greens", zh: "青菜", img: "/landing/greens.png" },
];

export default function HomePage() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumeSession, setResumeSession] = useState<StoredCookingSession | null>(null);

  // 中途離開的料理進度先前有存，但沒有任何入口能回去——首頁補上「繼續上次的料理」
  useEffect(() => {
    const [latest] = listInProgressSessions();
    setResumeSession(latest ?? null);
  }, []);

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
      {/* ===== 繼續上次的料理：中途離開的進度有存，但先前沒有入口回得去 ===== */}
      {resumeSession && (
        <a
          href={`/cook?recipe=${resumeSession.recipe_id}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/30 transition hover:bg-primary/15"
        >
          <span className="flex items-center gap-2 text-sm text-ink">
            <span className="text-lg">👨‍🍳</span>
            {t(
              `Pick up where you left off — ${resumeSession.recipe.recipe_name} (${resumeSession.current_step === 0 ? "prep" : `step ${resumeSession.current_step}/${resumeSession.recipe.steps.length}`})`,
              `繼續上次沒做完的「${resumeSession.recipe.recipe_name}」（${resumeSession.current_step === 0 ? "備料階段" : `第 ${resumeSession.current_step}/${resumeSession.recipe.steps.length} 步`}）`,
            )}
          </span>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">
            {t("Continue →", "繼續 →")}
          </span>
        </a>
      )}

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

        {/* 食材裝飾：讓 Hero 更有「廚房正在發生事情」的感覺，散落在外側邊緣、不整齊排列 */}
        <img
          src="/landing/mushroom.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -left-6 top-10 hidden h-24 w-24 -rotate-12 rounded-full object-cover opacity-90 shadow-lg md:block"
        />
        <img
          src="/landing/tomato.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -left-4 bottom-6 hidden h-20 w-20 rotate-6 rounded-full object-cover opacity-90 shadow-lg md:block"
        />
        <img
          src="/landing/egg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-4 top-4 hidden h-16 w-16 rotate-[14deg] rounded-full object-cover opacity-90 shadow-md lg:block"
        />

        <div className="relative grid gap-8 p-6 md:grid-cols-2 md:p-10">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-brand-border">
              <span className="h-1.5 w-1.5 rounded-full bg-herb" />
              {t("AI cooking companion · for beginners", "AI 料理助手 · 專給料理新手")}
            </span>

            <h1 className="font-serif text-4xl font-black leading-tight text-ink md:text-5xl">
              {t("Cook your first dish,", "第一次做菜，")}
              <br />
              {t("and actually ", "也可以")}
              <span className="text-accent">{t("finish it", "把它做完")}</span>
              {t(".", "。")}
            </h1>

            <p className="mt-4 max-w-md text-ink-soft">
              {t(
                "You don't need cooking know-how or a whole recipe memorized. AI guides you step by step, answers questions anytime, and tells you how it turned out.",
                "不用懂料理，不用一次看懂整份食譜。AI 會一步一步陪你做，卡住隨時可以問，做完還會告訴你做得怎麼樣。",
              )}
            </p>

            {/* 主要 CTA：單一、明確 */}
            <button
              onClick={focusSearch}
              className="mt-6 w-fit rounded-full bg-primary px-7 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-primary-dark"
            >
              {t("🍳 Cook a dish with me", "🍳 帶我做一道菜")}
            </button>

            {/* 次要行動：食材輸入（降級，但用語更像「跟 AI 說」而非「搜尋」） */}
            <div className="mt-6">
              <p className="text-sm font-medium text-ink">
                {t("🧺 Tell me what's in your fridge", "🧺 告訴我，你冰箱裡有什麼？")}
              </p>
              <p className="mb-2 text-xs text-ink-soft">
                {t("Even just one thing is fine.", "有一樣也可以，想到什麼就告訴我。")}
              </p>
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
                  placeholder={t(
                    "e.g. tomato, egg, chicken breast…",
                    "輸入食材，例如：番茄、雞蛋、雞胸肉…",
                  )}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-soft/60 md:text-base"
                />
                <button
                  onClick={() => search(query)}
                  aria-label={t("Search", "找菜")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {POPULAR.map((p) => (
                  <button
                    key={p.zh}
                    onClick={() => search(t(p.en, p.zh))}
                    className="flex items-center gap-1.5 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3 text-xs ring-1 ring-brand-border transition hover:bg-white"
                  >
                    <img
                      src={p.img}
                      alt={t(p.en, p.zh)}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    {t(p.en, p.zh)}
                  </button>
                ))}
              </div>
            </div>

            <a
              href="/setup"
              className="mt-5 w-fit text-sm text-ink-soft underline hover:text-ink"
            >
              {t("Set up kitchen tools & dietary needs first", "先設定廚房工具與飲食限制")}
            </a>
          </div>

          {/* 右側：番茄炒蛋成品大圖為主視覺，陪做 Demo 卡疊在圖片右上角 */}
          <div id="demo" className="flex items-center justify-center scroll-mt-24 md:justify-end">
            <div className="relative w-full max-w-md pt-8">
              <img
                src="/landing/dish.png"
                alt={t("Tomato scrambled eggs", "番茄炒蛋")}
                className="h-72 w-full rounded-3xl object-cover shadow-xl ring-1 ring-brand-border sm:h-80"
              />
              <span className="absolute bottom-3 left-4 z-10 rotate-[-4deg] rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-accent shadow-sm ring-1 ring-brand-border">
                {t("Easy & tasty ✨", "簡單又好吃 ✨")}
              </span>
              <img
                src="/landing/scallion.png"
                alt=""
                aria-hidden
                className="pointer-events-none absolute -bottom-5 -right-3 hidden h-16 w-16 rotate-6 rounded-full object-cover opacity-90 shadow-md sm:block"
              />
              <div className="absolute -top-4 right-0 w-[70%] max-w-[260px] sm:-right-8">
                <CookingDemo />
              </div>
              <p className="mt-3 text-center text-xs text-ink-soft">
                {t(
                  "Illustrative demo — the real walkthrough follows your actual recipe steps.",
                  "示範畫面，實際陪做以真實食譜步驟為準",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 完整旅程：從不知道吃什麼，到把菜做完 ===== */}
      <section
        id="journey"
        className="mt-6 rounded-3xl bg-surface/60 px-4 py-10 ring-1 ring-brand-border/60"
      >
        <h2 className="mb-8 text-center font-serif text-2xl font-bold text-ink">
          {t("From “not sure what to eat” to “dish is done”", "從「不知道吃什麼」到「把菜做完」")}
        </h2>
        {/* 冰箱走到餐桌的路徑感：食材/料理照取代部分 emoji、少量高低錯落，不做成六張一樣的資訊卡 */}
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <JourneyStep
            no="1"
            img="/landing/tomato.png"
            title={t("Tell me what you have", "告訴我你有什麼")}
            desc={t(
              "Type in what's on hand or what you feel like eating — one item or several, either way.",
              "輸入手邊或想吃的食材，一種或多種都可以。",
            )}
          />
          <JourneyStep
            no="2"
            img="/landing/dish-chicken-salad.png"
            title={t("I pick a dish for you", "我幫你挑一道")}
            desc={t(
              "Matched to your kitchen tools and dietary needs — dishes you can actually make.",
              "依你的廚房工具與飲食限制，推薦你做得到的菜。",
            )}
            offset
          />
          <JourneyStep
            no="3"
            img="/landing/dish.png"
            title={t("I guide you step by step", "我陪你一步一步做")}
            desc={t(
              "One action per step — heat, timing, and how to tell you got it right, all spelled out.",
              "每一步只給一個動作，火力、時間、怎麼看出做對了都寫清楚。",
            )}
          />
          <JourneyStep
            no="4"
            img="/landing/journey-ask.png"
            title={t("Stuck? Just ask", "卡住就問我")}
            desc={t(
              "Don't get a recipe term, not sure it's right — type anytime, and I'll answer using this step's recipe.",
              "看不懂食譜用語、不確定對不對，隨時打字問，我用這一步的食譜回答你。",
            )}
            offset
          />
          <JourneyStep
            no="5"
            img="/landing/dish-pepper-chicken.png"
            title={t("Show me when it's done", "做完告訴我")}
            desc={t(
              "Snap a photo of the finished dish and get feedback on color, plating, and doneness.",
              "拍張成品照，我從色彩、擺盤、完成度給你分項回饋。",
            )}
          />
          <JourneyStep
            no="6"
            img="/landing/journey-collect.png"
            title={t("Save it, see your progress", "收藏起來，看見進步")}
            desc={t(
              "Save dishes you love — every result and note stays in your portfolio.",
              "喜歡的菜存起來，每次的成品與評語都留在你的作品集裡。",
            )}
            offset
          />
        </div>
      </section>

      {/* ===== 安心感：不會做菜也沒關係 ===== */}
      <section className="mt-6 rounded-3xl bg-white/70 px-4 py-10 ring-1 ring-brand-border/60">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-2xl font-bold text-ink">
            {t("Never cooked before? That's fine.", "不會做菜？沒關係。")}
          </h2>
          <p className="mt-2 text-ink-soft">
            {t(
              "These worries are normal — we built “ask anytime” into every step of cooking together.",
              "這些擔心很正常——我們把「隨時可以問」做進了陪做的每一步。",
            )}
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-8 md:grid-cols-2 md:items-center">
          {/* 真實料理情境：切番茄照片 */}
          <div className="relative mx-auto w-full max-w-sm">
            <img
              src="/landing/prep-tomato.png"
              alt={t("Dicing a tomato", "切番茄示範")}
              className="h-56 w-full rounded-3xl object-cover shadow-lg ring-1 ring-brand-border sm:h-64"
            />
            <span className="absolute -bottom-3 left-4 rotate-[-3deg] rounded-full bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm ring-1 ring-brand-border">
              {t("Just cut it like this!", "番茄切這樣就可以！")}
            </span>
          </div>

          <div>
            {/* 情境展示：卡住時真的可以直接問，不是 FAQ */}
            <div className="flex flex-col gap-2">
              <div className="ml-auto flex max-w-[85%] items-end gap-2">
                <p className="rounded-2xl rounded-tr-sm bg-cream px-4 py-2 text-sm text-ink ring-1 ring-brand-border">
                  {t("How big should I cut the tomato?", "番茄到底要切多大？")}
                </p>
                <span className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs ring-1 ring-brand-border">
                  🙋
                </span>
              </div>
              <div className="mr-auto flex max-w-[85%] items-end gap-2">
                <span className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-white">
                  酷
                </span>
                <p className="rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-2 text-sm text-primary-dark">
                  {t(
                    "Bite-sized is fine — it doesn't need to look pretty 😊",
                    "大概一口大小就可以，不用切得很漂亮 😊",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <WorryCard worry={t("Not sure how to cut it", "不知道怎麼切")} />
              <WorryCard worry={t("Not sure how high the heat should be", "不知道火要開多大")} />
              <WorryCard worry={t("Not sure if it's time for the next step", "不知道該不該進行下一步")} />
              <WorryCard
                worry={t(
                  'Recipes say "to taste" or "until fragrant" — no idea what that means',
                  "看不懂食譜寫的「適量」「炒到香」",
                )}
              />
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center font-medium text-ink">
          {t(
            "💬 Whenever you're stuck, just type your question. I'll answer based on this exact step — you're never left mid-recipe.",
            "💬 卡住的當下，直接打字問我。我會照著這一步的食譜回答你，不會把你丟在半路。",
          )}
        </p>
      </section>

      {/* ===== 我的廚房：收藏與進步紀錄 ===== */}
      <section id="kitchen" className="py-12 text-center">
        <h2 className="font-serif text-2xl font-bold text-ink">
          {t("Every dish you finish, on record", "每做完一道，都留下紀錄")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          {t(
            "Save recipes you love, keep every finished photo and score in your portfolio, and watch yourself get better.",
            "收藏喜歡的食譜，把每次的成品照、分項評分都存進作品集，回頭看看自己越煮越上手。",
          )}
        </p>

        {/* 真的跟 AI 做完過這些料理，不是食譜推薦 */}
        <div className="mx-auto mt-6 flex max-w-md justify-center gap-4">
          <CompletedDish
            img="/landing/dish.png"
            name={t("Tomato Scrambled Eggs", "番茄炒蛋")}
            meta={t("⭐ 4.8 · 20 min", "⭐ 4.8 · 20 分鐘")}
            rotate="-rotate-3"
          />
          <CompletedDish
            img="/landing/dish-pepper-chicken.png"
            name={t("Pan-Seared Chicken", "香煎雞胸肉")}
            meta={t("⭐ 4.5 · 25 min", "⭐ 4.5 · 25 分鐘")}
            rotate="rotate-2"
          />
          <CompletedDish
            img="/landing/dish-chicken-salad.png"
            name={t("Chicken Veggie Salad", "蔬菜雞肉沙拉")}
            meta={t("⭐ 4.7 · 15 min", "⭐ 4.7 · 15 分鐘")}
            rotate="-rotate-2"
          />
        </div>

        <a
          href="/kitchen"
          className="mt-4 inline-block rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-brand-border transition hover:bg-white"
        >
          {t("See my portfolio", "看我的作品集")}
        </a>
      </section>

      <footer className="border-t border-brand-border py-8 text-center text-sm text-ink-soft">
        {t("Kuke · AI Cooking Companion · Demo", "酷嗑 · AI 料理助手 · Demo")}
      </footer>
    </div>
  );
}

/* ---------- 陪做 Demo（純前端狀態模擬，展示老師 A 版能力：一步一畫面＋隨時提問） ---------- */

type DemoStep = {
  title: { en: string; zh: string };
  body: { en: string; zh: string };
  primary: { en: string; zh: string };
  secondary?: { en: string; zh: string };
  reply?: { en: string; zh: string };
};

const DEMO_STEPS: DemoStep[] = [
  {
    title: { en: "Mise en place", zh: "備料確認" },
    body: {
      en: "Got the tomato, egg, and scallion ready?",
      zh: "番茄、雞蛋、蔥都準備好了嗎？",
    },
    primary: { en: "✅ All set", zh: "✅ 都準備好了" },
  },
  {
    title: { en: "Heat the pan", zh: "開火" },
    body: { en: "Medium-low heat — is the pan hot yet?", zh: "開中小火，鍋子熱了嗎？" },
    primary: { en: "🔥 It's hot", zh: "🔥 開好了" },
    secondary: { en: "💬 Not sure how hot", zh: "💬 我不知道火要多大" },
    reply: {
      en: "Teacher: medium-low is around the middle dial — a little smoke off the pan edge means it's ready.",
      zh: "老師：中小火大概是刻度置中，鍋緣冒出一點油煙就是夠熱了。",
    },
  },
  {
    title: { en: "Stir-fry", zh: "下鍋拌炒" },
    body: {
      en: "Add the tomato, cook until the edges soften.",
      zh: "番茄下鍋，炒到邊緣微微出水。",
    },
    primary: { en: "✅ Done", zh: "✅ 做好了" },
    secondary: { en: "💬 Does this look right?", zh: "💬 這樣對嗎？" },
    reply: {
      en: "Teacher: soft edges and a little liquid means it's ready — move on to the next step.",
      zh: "老師：番茄邊緣變軟、開始出水就是對的，可以接著下一步了。",
    },
  },
  {
    title: { en: "Finish", zh: "完成" },
    body: { en: "Pour in the egg, stir to combine, plate it!", zh: "淋入蛋液拌炒均勻，起鍋！" },
    primary: { en: "🎉 Dish complete", zh: "🎉 完成這道菜" },
  },
];

function CookingDemo() {
  const { locale } = useLocale();
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
    if (current.reply) setReply(current.reply[locale]);
  }

  function restart() {
    setStep(0);
    setReply(null);
    setDone(false);
  }

  return (
    <div className="w-full rounded-2xl bg-white/95 p-3.5 shadow-xl ring-1 ring-brand-border sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="font-serif text-sm font-bold text-ink sm:text-base">
          {locale === "en" ? "Tomato Eggs · In progress" : "番茄炒蛋 · 陪做中"}
        </span>
        <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink-soft ring-1 ring-brand-border sm:text-xs">
          {done ? (locale === "en" ? "Done" : "完成") : `Step ${step + 1} / ${DEMO_STEPS.length}`}
        </span>
      </div>

      {/* 這道菜用到的食材：小型真實食材照，強化「正在廚房裡一起做菜」的感覺 */}
      <div className="mb-2 flex items-center gap-1">
        <img src="/landing/tomato.png" alt="" className="h-5 w-5 rounded-full object-cover ring-2 ring-white" />
        <img src="/landing/egg.png" alt="" className="-ml-2 h-5 w-5 rounded-full object-cover ring-2 ring-white" />
        <img src="/landing/scallion.png" alt="" className="-ml-2 h-5 w-5 rounded-full object-cover ring-2 ring-white" />
        <span className="ml-1 text-[11px] text-ink-soft">
          {locale === "en" ? "Tomato, Egg, Scallion" : "番茄、雞蛋、蔥"}
        </span>
      </div>

      {done ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-cream p-4 text-center">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-semibold text-ink">
            {locale === "en" ? "Dish complete!" : "這道菜做完了！"}
          </p>
          <button
            onClick={restart}
            className="mt-1 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink ring-1 ring-brand-border hover:bg-white"
          >
            {locale === "en" ? "Watch the demo again" : "再看一次示範"}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-cream p-3">
            <p className="text-[11px] font-medium text-ink-soft">{current.title[locale]}</p>
            <p className="mt-0.5 text-sm font-medium text-ink sm:text-base">{current.body[locale]}</p>
          </div>

          {reply && (
            <p className="mt-2 rounded-xl bg-primary/10 p-2.5 text-xs text-primary-dark sm:text-sm">
              {reply}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={handlePrimary}
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark sm:text-sm"
            >
              {current.primary[locale]}
            </button>
            {current.secondary && (
              <button
                onClick={handleSecondary}
                className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft ring-1 ring-brand-border transition hover:text-ink sm:text-sm"
              >
                {current.secondary[locale]}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 小元件 ---------- */

function JourneyStep({
  no,
  title,
  img,
  desc,
  offset,
}: {
  no: string;
  title: string;
  img: string;
  desc: string;
  offset?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center md:flex-row md:items-start md:text-left ${offset ? "md:mt-6" : ""}`}
    >
      <div className="mb-3 h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-primary/10 md:mb-0 md:mr-4">
        <img src={img} alt="" className="h-full w-full object-cover" />
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
  meta,
  rotate,
}: {
  img: string;
  name: string;
  meta: string;
  rotate: string;
}) {
  return (
    <div className={`rounded-xl bg-white p-2 pb-3 shadow-md ring-1 ring-brand-border ${rotate}`}>
      <img src={img} alt={name} className="h-16 w-16 rounded-lg object-cover sm:h-20 sm:w-20" />
      <p className="mt-1.5 text-center text-xs font-medium text-ink">{name}</p>
      <p className="text-center text-[10px] text-ink-soft">{meta}</p>
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
