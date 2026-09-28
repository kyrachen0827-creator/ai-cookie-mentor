"use client";

/**
 * 推薦結果頁（product-spec MVP 第 2 項）
 *
 * 帶入 localStorage 的 Food Profile（工具過濾＋過敏排除由後端 agent 處理），
 * 呼叫 /api/agents/recipe。選定食譜時把完整 Recipe 暫存 sessionStorage，
 * 交棒給缺料清單頁顯示真實食材（Phase 1 先不落 DB）。
 * 語系：locale 隨請求送到後端，AI 直接以該語系生成食譜內容（見 recipe agent）。
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/data/types";
import { getProfile } from "@/lib/data/profile-client";
import { isFavorite, toggleFavorite } from "@/lib/data/portfolio-client";
import { notableTools } from "@/lib/recipe-tools";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { difficultyLabel, toolLabel } from "@/lib/i18n/labels";

const SELECTED_KEY = "zaohuo.selectedRecipe";

/** 依菜名挑一個代表性餐點圖示（成品圖 placeholder；真圖可日後接圖片生成） */
function dishEmoji(name: string): string {
  const rules: [string[], string][] = [
    [["湯", "羹", "soup"], "🍲"],
    [["沙拉", "涼拌", "salad"], "🥗"],
    [["麵", "義大利", "noodle", "pasta"], "🍜"],
    [["飯", "丼", "燴飯", "rice"], "🍚"],
    [["粥", "congee"], "🥣"],
    [["餅", "煎餅", "蛋餅", "pancake"], "🥞"],
    [["焗", "起司", "起士", "cheese"], "🧀"],
    [["氣炸", "炸", "酥", "fried", "crispy"], "🍤"],
    [["蛋", "egg"], "🍳"],
    [["雞", "chicken"], "🍗"],
    [["蝦", "海鮮", "花枝", "透抽", "shrimp", "seafood"], "🦐"],
    [["魚", "fish"], "🐟"],
    [["豬", "牛", "排", "肉", "pork", "beef", "steak"], "🥩"],
    [["豆腐", "tofu"], "🍢"],
    [["菜", "蔬", "瓜", "veg", "greens"], "🥬"],
  ];
  for (const [keys, emoji] of rules) {
    if (keys.some((k) => name.toLowerCase().includes(k))) return emoji;
  }
  return "🍽️";
}

function RecommendList() {
  const router = useRouter();
  const params = useSearchParams();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const ingredients = (params.get("ingredients") ?? "").split(",").filter(Boolean);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [note, setNote] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Record<string, string>>({});
  const fetchedFor = useRef<string>("");
  const imgRequested = useRef<Set<string>>(new Set());

  // 逐張延遲生成成品圖（不阻塞推薦；失敗就維持 emoji placeholder）
  useEffect(() => {
    recipes.forEach((r) => {
      if (imgRequested.current.has(r.id)) return;
      imgRequested.current.add(r.id);
      fetch("/api/agents/recipe/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.recipe_name,
          standard: r.finished_dish_standard,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => {
          if (d?.dataUrl) setImages((prev) => ({ ...prev, [r.id]: d.dataUrl }));
        })
        .catch(() => {});
    });
  }, [recipes]);

  useEffect(() => {
    const key = `${ingredients.join(",")}|${locale}`;
    // 同一組食材＋語系只抓一次（避免 React StrictMode 開發模式重複呼叫 API）
    if (key && fetchedFor.current === key) return;
    fetchedFor.current = key;

    async function run() {
      setLoading(true);
      setError(undefined);
      try {
        const res = await fetch("/api/agents/recipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients, profile: getProfile(), locale }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("Recommendation failed", "推薦失敗"));
        const list: Recipe[] = data.recipes ?? [];
        setRecipes(list);
        setFavs(new Set(list.filter((r) => isFavorite(r.id)).map((r) => r.id)));
        setNote(data.note);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Recommendation failed", "推薦失敗"));
      } finally {
        setLoading(false);
      }
    }
    if (ingredients.length > 0) run();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, locale]);

  function choose(recipe: Recipe) {
    try {
      sessionStorage.setItem(SELECTED_KEY, JSON.stringify(recipe));
    } catch {
      /* 忽略儲存失敗 */
    }
    router.push(`/shopping-list?recipe=${recipe.id}`);
  }

  function toggleFav(recipe: Recipe) {
    const nowFav = toggleFavorite(recipe);
    setFavs((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(recipe.id);
      else next.delete(recipe.id);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Home", "← 回首頁")}
        </a>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">
          {t("Recommended for you", "推薦給你")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t("Ingredients", "食材")}：{ingredients.join(t(", ", "、")) || t("(none provided)", "（未提供）")}
        </p>
      </header>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-border border-t-primary" />
          <p className="font-medium text-ink">{t("AI is thinking of dishes…", "AI 正在為你想菜…")}</p>
          <p className="text-sm text-ink-soft">
            {t("Recipes are generated from your ingredients, ~10–20s, hang tight", "依食材現想食譜，大約 10–20 秒，請稍候")}
          </p>
        </div>
      )}
      {error && <p className="text-accent">{error}</p>}
      {note && (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary-dark">
          {note}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {recipes.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl bg-surface p-5 ring-1 ring-brand-border"
          >
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-serif text-xl font-bold text-ink">
                    {r.recipe_name}
                  </h2>
                  <span className="shrink-0 rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-accent ring-1 ring-brand-border">
                    {difficultyLabel(r.difficulty_level, locale)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {t(`~${r.estimated_time_minutes} min`, `約 ${r.estimated_time_minutes} 分鐘`)}
                  {notableTools(r.required_tools).length > 0 &&
                    `　·　${t("Needs", "需要")}：${notableTools(r.required_tools)
                      .map((tool) => toolLabel(tool, locale))
                      .join(t(", ", "、"))}`}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {t("Ingredients", "食材")}：{r.ingredients.map((i) => i.name).join(t(", ", "、"))}
                </p>
              </div>
              {/* 成品圖（風格化縮圖） */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/15 to-herb/15 text-4xl ring-1 ring-brand-border">
                {images[r.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={images[r.id]}
                    alt={r.recipe_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  dishEmoji(r.recipe_name)
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => choose(r)}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
              >
                {t("Cook this one", "就煮這道")}
              </button>
              <button
                onClick={() => toggleFav(r)}
                aria-label={t("Favorite", "收藏")}
                className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 transition ${
                  favs.has(r.id)
                    ? "bg-accent/10 text-accent ring-accent/30"
                    : "bg-surface text-ink-soft ring-brand-border hover:text-ink"
                }`}
              >
                {favs.has(r.id) ? t("★ Saved", "★ 已收藏") : t("☆ Save", "☆ 收藏")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && recipes.length === 0 && !error && (
        <p className="text-ink-soft">
          {t("No dishes found — try different ingredients from the home page.", "沒有找到菜色，回首頁換個食材試試。")}
        </p>
      )}
    </div>
  );
}

export default function RecommendPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">Loading…</p>}>
      <RecommendList />
    </Suspense>
  );
}
