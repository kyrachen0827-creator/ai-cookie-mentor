"use client";

/**
 * 推薦結果頁（product-spec MVP 第 2 項）
 *
 * 帶入 localStorage 的 Food Profile（工具過濾＋過敏排除由後端 agent 處理），
 * 呼叫 /api/agents/recipe。選定食譜時把完整 Recipe 暫存 sessionStorage，
 * 交棒給缺料清單頁顯示真實食材（Phase 1 先不落 DB）。
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/data/types";
import { getProfile } from "@/lib/data/profile-client";
import { isFavorite, toggleFavorite } from "@/lib/data/portfolio-client";
import { notableTools } from "@/lib/recipe-tools";

const SELECTED_KEY = "zaohuo.selectedRecipe";

function RecommendList() {
  const router = useRouter();
  const params = useSearchParams();
  const ingredients = (params.get("ingredients") ?? "").split(",").filter(Boolean);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [note, setNote] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const fetchedFor = useRef<string>("");

  useEffect(() => {
    const key = ingredients.join(",");
    // 同一組食材只抓一次（避免 React StrictMode 開發模式重複呼叫 API）
    if (key && fetchedFor.current === key) return;
    fetchedFor.current = key;

    async function run() {
      setLoading(true);
      setError(undefined);
      try {
        const res = await fetch("/api/agents/recipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients, profile: getProfile() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "推薦失敗");
        const list: Recipe[] = data.recipes ?? [];
        setRecipes(list);
        setFavs(new Set(list.filter((r) => isFavorite(r.id)).map((r) => r.id)));
        setNote(data.note);
      } catch (e) {
        setError(e instanceof Error ? e.message : "推薦失敗");
      } finally {
        setLoading(false);
      }
    }
    if (ingredients.length > 0) run();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
          ← 回首頁
        </a>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">推薦給你</h1>
        <p className="mt-1 text-sm text-ink-soft">
          食材：{ingredients.join("、") || "（未提供）"}
        </p>
      </header>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-border border-t-primary" />
          <p className="font-medium text-ink">AI 正在為你想菜…</p>
          <p className="text-sm text-ink-soft">依食材現想食譜，大約 10–20 秒，請稍候</p>
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
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-ink">
                {r.recipe_name}
              </h2>
              <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-accent ring-1 ring-brand-border">
                {r.difficulty_level}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              約 {r.estimated_time_minutes} 分鐘
              {notableTools(r.required_tools).length > 0 &&
                `　·　需要：${notableTools(r.required_tools).join("、")}`}
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              食材：{r.ingredients.map((i) => i.name).join("、")}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => choose(r)}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
              >
                就煮這道
              </button>
              <button
                onClick={() => toggleFav(r)}
                aria-label="收藏"
                className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 transition ${
                  favs.has(r.id)
                    ? "bg-accent/10 text-accent ring-accent/30"
                    : "bg-surface text-ink-soft ring-brand-border hover:text-ink"
                }`}
              >
                {favs.has(r.id) ? "★ 已收藏" : "☆ 收藏"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && recipes.length === 0 && !error && (
        <p className="text-ink-soft">沒有找到菜色，回首頁換個食材試試。</p>
      )}
    </div>
  );
}

export default function RecommendPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">載入中…</p>}>
      <RecommendList />
    </Suspense>
  );
}
