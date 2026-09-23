"use client";

/**
 * 作品集（我的廚房）的前端保存（Phase 4）
 *
 * 對照 data-model.md 的 Portfolio Entry（entry_type：收藏食譜／完成作品）與 Score。
 * Phase 4 先以 localStorage 保存於裝置；為顯示方便，完成作品記錄直接內嵌 Recipe 與 Score
 * 快照（技術上的反正規化），業務實體本身仍依 data-model；正式版改接資料庫。
 */
import type { Recipe, Score } from "./types";

const FAV_KEY = "zaohuo.portfolio.favorites";
const DONE_KEY = "zaohuo.portfolio.completed";

/** 完成作品一筆（entry_type = 完成作品） */
export interface CompletedWork {
  recipe: Recipe;
  score: Score;
  at: string; // ISO 時間
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量不足等情況忽略 */
  }
}

/* ---------- 收藏食譜 ---------- */

export function listFavorites(): Recipe[] {
  return read<Recipe[]>(FAV_KEY, []);
}

export function isFavorite(recipeId: string): boolean {
  return listFavorites().some((r) => r.id === recipeId);
}

/** 切換收藏，回傳切換後是否為已收藏 */
export function toggleFavorite(recipe: Recipe): boolean {
  const list = listFavorites();
  const exists = list.some((r) => r.id === recipe.id);
  const next = exists
    ? list.filter((r) => r.id !== recipe.id)
    : [recipe, ...list];
  write(FAV_KEY, next);
  return !exists;
}

/* ---------- 完成作品 ---------- */

export function listCompleted(): CompletedWork[] {
  return read<CompletedWork[]>(DONE_KEY, []);
}

/** 新增一筆完成作品（評審評分後呼叫），最新在前 */
export function addCompleted(recipe: Recipe, score: Score): void {
  const list = listCompleted();
  write(DONE_KEY, [{ recipe, score, at: new Date().toISOString() }, ...list]);
}
