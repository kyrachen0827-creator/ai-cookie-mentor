"use client";

/**
 * Cooking Session 的前端保存（Phase 2）
 *
 * 對照 data-model.md 的 Cooking Session（採完整版：記錄 session_log）。
 * Phase 2 先以 localStorage 保存於裝置，支援「中途離開可回到原本進度」；
 * 正式版改由 store.ts 接 Firestore/Supabase。
 *
 * current_step 語意：0 = 備料確認；1..N = 第 N 步；N+1 = 完成。
 */
import type { CookingSession, Recipe, SessionLogEntry } from "./types";

/** 存進 localStorage 的完整快照（含 recipe，確保重開也能還原） */
export interface StoredCookingSession extends CookingSession {
  recipe: Recipe;
}

const keyOf = (recipeId: string) => `zaohuo.session.${recipeId}`;

export function getSession(recipeId: string): StoredCookingSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyOf(recipeId));
    return raw ? (JSON.parse(raw) as StoredCookingSession) : null;
  } catch {
    return null;
  }
}

/** 建立或取得既有 session（已存在則沿用其進度） */
export function startOrResume(recipe: Recipe): StoredCookingSession {
  const existing = getSession(recipe.id);
  if (existing) return existing;
  const fresh: StoredCookingSession = {
    id: `session-${recipe.id}`,
    recipe_id: recipe.id,
    recipe,
    current_step: 0,
    missing_ingredients: [],
    session_log: [],
    session_status: "進行中",
  };
  save(fresh);
  return fresh;
}

function save(session: StoredCookingSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyOf(session.recipe_id), JSON.stringify(session));
  } catch {
    /* 忽略儲存失敗 */
  }
}

export function setCurrentStep(recipe: Recipe, step: number): void {
  const s = getSession(recipe.id) ?? startOrResume(recipe);
  s.current_step = step;
  save(s);
}

export function setStatus(
  recipe: Recipe,
  status: CookingSession["session_status"],
): void {
  const s = getSession(recipe.id) ?? startOrResume(recipe);
  s.session_status = status;
  save(s);
}

/** 追加一筆過程紀錄（老師提醒 / 使用者狀態 / 中途照片） */
export function appendLog(
  recipe: Recipe,
  entry: Omit<SessionLogEntry, "at">,
): void {
  const s = getSession(recipe.id) ?? startOrResume(recipe);
  s.session_log.push({ at: new Date().toISOString(), ...entry });
  save(s);
}
