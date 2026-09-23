"use client";

/**
 * 成品評分的前端保存（Phase 3）
 *
 * 對照 data-model.md 的 Score。dish_photo 保存於作品集直到使用者刪除（定案）；
 * Phase 3 先存 localStorage（縮圖後的 JPEG dataURL，控制容量），正式版改接資料庫。
 * 每道 recipe 保留最近一次評分，供作品集（Phase 4）回顧。
 */
import type { Score } from "./types";

const keyOf = (recipeId: string) => `zaohuo.score.${recipeId}`;

export function saveScore(recipeId: string, score: Score): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyOf(recipeId), JSON.stringify(score));
  } catch {
    /* 容量不足等情況忽略，不影響當次顯示 */
  }
}

export function getScore(recipeId: string): Score | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyOf(recipeId));
    return raw ? (JSON.parse(raw) as Score) : null;
  } catch {
    return null;
  }
}
