"use client";

/**
 * 我的廚房 / 作品集（product-spec MVP 第 6 項）
 *
 * - 完成作品：成品照＋分項分數＋評語，回顧進步（對應 data-model 完成作品）
 * - 收藏食譜：下次想再煮可快速找到並再煮一次（對應 data-model 收藏食譜）
 * Phase 4 讀取 localStorage（portfolio-client）。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/data/types";
import {
  listCompleted,
  listFavorites,
  toggleFavorite,
  type CompletedWork,
} from "@/lib/data/portfolio-client";
import { notableTools } from "@/lib/recipe-tools";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { difficultyLabel, toolLabel } from "@/lib/i18n/labels";

const SELECTED_KEY = "zaohuo.selectedRecipe";

export default function KitchenPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [completed, setCompleted] = useState<CompletedWork[]>([]);
  const [favorites, setFavorites] = useState<Recipe[]>([]);

  useEffect(() => {
    setCompleted(listCompleted());
    setFavorites(listFavorites());
  }, []);

  function cookAgain(recipe: Recipe) {
    try {
      sessionStorage.setItem(SELECTED_KEY, JSON.stringify(recipe));
    } catch {
      /* 忽略 */
    }
    router.push(`/shopping-list?recipe=${recipe.id}`);
  }

  function removeFav(recipe: Recipe) {
    toggleFavorite(recipe);
    setFavorites(listFavorites());
  }

  const empty = completed.length === 0 && favorites.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Home", "← 回首頁")}
        </a>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">{t("My Kitchen", "我的廚房")}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            "Save dishes you want to cook, look back at what you've finished, and watch yourself improve.",
            "收藏想煮的菜，回顧煮過的成品，看著自己越煮越好。",
          )}
        </p>
      </header>

      {empty && (
        <div className="rounded-2xl bg-surface p-8 text-center ring-1 ring-brand-border">
          <p className="text-ink-soft">{t("No dishes yet.", "還沒有作品。")}</p>
          <a
            href="/"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t("Pick a dish", "去選一道菜")}
          </a>
        </div>
      )}

      {/* 完成作品 */}
      {completed.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-serif text-xl font-bold text-ink">
            {t("Finished Dishes", "完成作品")} <span className="text-sm font-normal text-ink-soft">（{completed.length}）</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {completed.map((w, i) => (
              <article key={i} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-brand-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.score.dish_photo} alt={w.recipe.recipe_name} className="h-40 w-full object-cover" />
                <div className="p-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-serif text-lg font-bold text-ink">{w.recipe.recipe_name}</h3>
                    <span className="font-serif text-2xl font-bold text-primary">
                      {w.score.total_score}
                      <span className="text-xs text-ink-soft">/15</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t("Color", "色彩")} {w.score.color_score} · {t("Plating", "擺盤")} {w.score.plating_score} ·{" "}
                    {t("Doneness", "完成度")} {w.score.doneness_score}
                    　·　{formatDate(w.at, locale)}
                  </p>
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold text-herb">{t("Nice work ", "做得好 ")}</span>
                    {w.score.strength_comment}
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-semibold text-primary-dark">{t("Next time ", "下次 ")}</span>
                    {w.score.improvement_comment}
                  </p>
                  <button
                    onClick={() => cookAgain(w.recipe)}
                    className="mt-3 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink ring-1 ring-brand-border hover:bg-cream"
                  >
                    {t("Cook it again", "再煮一次")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 收藏食譜 */}
      {favorites.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-xl font-bold text-ink">
            {t("Saved Recipes", "收藏食譜")} <span className="text-sm font-normal text-ink-soft">（{favorites.length}）</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {favorites.map((r) => (
              <li key={r.id} className="rounded-2xl bg-surface p-4 ring-1 ring-brand-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-ink">{r.recipe_name}</h3>
                  <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-accent ring-1 ring-brand-border">
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
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => cookAgain(r)}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
                  >
                    {t("Cook this", "來煮這道")}
                  </button>
                  <button
                    onClick={() => removeFav(r)}
                    className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-brand-border hover:text-ink"
                  >
                    {t("Unsave", "取消收藏")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function formatDate(iso: string, locale: "en" | "zh"): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "zh-TW", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
