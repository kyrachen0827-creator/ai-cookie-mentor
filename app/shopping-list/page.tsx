"use client";

/**
 * 缺料清單頁（product-spec MVP 第 3 項）
 *
 * 讀取推薦頁交棒的「選定食譜」（sessionStorage），列出真實食材與器具，
 * 可勾「我有這個」即時扣除；備齊後進入料理（Phase 2 老師，目前鎖住）。
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/data/types";

const SELECTED_KEY = "zaohuo.selectedRecipe";

function ShoppingList() {
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SELECTED_KEY);
      if (raw) setRecipe(JSON.parse(raw) as Recipe);
    } catch {
      /* 忽略 */
    }
  }, []);

  // 清單 = 食材 + 器具（器具來自 required_tools）
  const items = useMemo(() => {
    if (!recipe) return [] as { key: string; label: string; kind: "食材" | "器具" }[];
    const ing = recipe.ingredients.map((i) => ({
      key: `ing:${i.name}`,
      label: `${i.name} ${i.amount}`.trim(),
      kind: "食材" as const,
    }));
    const tools = recipe.required_tools.map((t) => ({
      key: `tool:${t}`,
      label: t,
      kind: "器具" as const,
    }));
    return [...ing, ...tools];
  }, [recipe]);

  function toggle(key: string) {
    setOwned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allReady = items.length > 0 && owned.size === items.length;
  const missing = items.filter((i) => !owned.has(i.key));

  if (!recipe) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-ink-soft">還沒有選定的食譜。</p>
        <a href="/" className="mt-3 inline-block text-primary underline">
          回首頁挑一道
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          ← 回首頁
        </a>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">缺料清單</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {recipe.recipe_name} · 有的先勾起來，剩下 {missing.length} 項要準備。
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-brand-border">
              <input
                type="checkbox"
                checked={owned.has(item.key)}
                onChange={() => toggle(item.key)}
                className="h-5 w-5 accent-primary"
              />
              <span
                className={
                  owned.has(item.key)
                    ? "text-ink-soft/50 line-through"
                    : "text-ink"
                }
              >
                {item.label}
              </span>
              <span className="ml-auto text-xs text-ink-soft">{item.kind}</span>
            </label>
          </li>
        ))}
      </ul>

      <button
        disabled={!allReady}
        onClick={() => router.push(`/cook?recipe=${recipe.id}`)}
        className="mt-6 w-full rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {allReady ? "備齊了，開始料理" : `還差 ${missing.length} 項就能開始`}
      </button>
    </div>
  );
}

export default function ShoppingListPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">載入中…</p>}>
      <ShoppingList />
    </Suspense>
  );
}
