"use client";

/**
 * 缺料清單頁（product-spec MVP 第 3 項）
 *
 * 讀取推薦頁交棒的「選定食譜」（sessionStorage），列出真實食材與器具，
 * 可勾「我有這個」即時扣除；備齊後進入料理（Phase 2 老師，目前鎖住）。
 *
 * UX 微調（2026/09/28）：從「單一打勾清單」改為「我有的／還需要準備」兩組，
 * checkbox 的意義是「我現在已經準備好這個材料」，而不是單純控制下一步按鈕；
 * 「還需要準備」加上一鍵複製清單，方便貼到 LINE／備忘錄／購物清單。
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/data/types";
import { notableTools } from "@/lib/recipe-tools";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { toolLabel } from "@/lib/i18n/labels";

const SELECTED_KEY = "zaohuo.selectedRecipe";

function ShoppingList() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ready, setReady] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SELECTED_KEY);
      if (raw) setRecipe(JSON.parse(raw) as Recipe);
    } catch {
      /* 忽略 */
    }
    setReady(true);
  }, []);

  // 清單只列食材需要準備；器具是推薦時已依「你擁有的工具」過濾過的，必定已有，
  // 故不列入待勾清單，改以資訊列提示（修 U4：避免要使用者把已有的爐具再勾一次）。
  const items = useMemo(() => {
    if (!recipe) return [] as { key: string; label: string }[];
    return recipe.ingredients.map((i) => ({
      key: `ing:${i.name}`,
      label: `${i.name} ${i.amount}`.trim(),
    }));
  }, [recipe]);

  function toggle(key: string) {
    setOwned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function checkAll() {
    setOwned(new Set(items.map((i) => i.key)));
  }

  const allReady = items.length > 0 && owned.size === items.length;
  const have = items.filter((i) => owned.has(i.key));
  const missing = items.filter((i) => !owned.has(i.key));

  async function copyMissingList() {
    const text = [`🛒 ${recipe?.recipe_name ?? ""}`, ...missing.map((i) => i.label)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪貼簿權限被拒時靜默失敗，使用者可自行選取文字 */
    }
  }

  if (!ready) {
    return <p className="px-4 py-8 text-ink-soft">Loading…</p>;
  }

  if (!recipe) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-ink-soft">{t("No recipe selected yet.", "還沒有選定的食譜。")}</p>
        <a href="/" className="mt-3 inline-block text-primary underline">
          {t("Back home to pick one", "回首頁挑一道")}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Home", "← 回首頁")}
        </a>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">{t("Shopping List", "缺料清單")}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {recipe.recipe_name} · {t("Check off what you have before you start.", "開煮前，先確認手邊有哪些材料。")}
        </p>
      </header>

      {/* 🧺 我有的：checkbox 代表「我現在已經準備好這個材料」 */}
      {have.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">
            🧺 {t("I Have", "我有的")}（{have.length} {t("items", "項")}）
          </h2>
          <ul className="flex flex-col gap-2">
            {have.map((item) => (
              <li key={item.key}>
                <label className="flex items-center gap-3 rounded-2xl bg-herb/10 px-4 py-3 ring-1 ring-brand-border">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggle(item.key)}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="text-ink-soft/70 line-through">{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 🛒 還需要準備 */}
      {missing.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              🛒 {t("Still Need", "還需要準備")}（{missing.length} {t("items", "項")}）
            </h2>
            <button
              onClick={checkAll}
              className="shrink-0 text-xs font-medium text-primary hover:text-primary-dark"
            >
              {t("✓ I have everything", "✓ 全部我都有")}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {missing.map((item) => (
              <li key={item.key}>
                <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-brand-border">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggle(item.key)}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="text-ink">{item.label}</span>
                </label>
              </li>
            ))}
          </ul>

          <button
            onClick={copyMissingList}
            className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-sm font-medium text-ink-soft ring-1 ring-brand-border transition hover:text-ink"
          >
            {copied ? t("Copied ✓", "已複製 ✓") : t("📋 Copy shopping list", "📋 複製缺料清單")}
          </button>
        </section>
      )}

      {notableTools(recipe.required_tools).length > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          {t("Tools you'll use (already have)", "會用到的器具（你已有）")}：
          {notableTools(recipe.required_tools).map((tool) => toolLabel(tool, locale)).join(t(", ", "、"))}
        </p>
      )}

      {allReady ? (
        <div className="mt-6 rounded-2xl bg-herb/10 p-4 text-center ring-1 ring-brand-border">
          <p className="font-semibold text-ink">{t("🎉 All ingredients ready!", "🎉 材料都準備好了！")}</p>
          <button
            onClick={() => router.push(`/cook?recipe=${recipe.id}`)}
            className="mt-3 w-full rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark"
          >
            {t("Start Cooking", "開始料理")}
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-surface p-4 text-center ring-1 ring-brand-border">
          <p className="text-sm text-ink-soft">
            {t(`${missing.length} item${missing.length === 1 ? "" : "s"} still needed`, `還有 ${missing.length} 樣材料需要準備`)}
          </p>
          <button
            disabled
            className="mt-3 w-full cursor-not-allowed rounded-full bg-primary px-4 py-3 font-semibold text-white opacity-40"
          >
            {t("Start Cooking", "開始料理")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShoppingListPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">Loading…</p>}>
      <ShoppingList />
    </Suspense>
  );
}
