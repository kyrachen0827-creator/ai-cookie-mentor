"use client";

/**
 * Food Profile 的前端暫存（Phase 1）
 *
 * 目前尚無帳號/後端 session，先以 localStorage 保存於使用者裝置，
 * 供推薦時帶入工具過濾與過敏排除。正式版改由 store.ts 接 Firestore/Supabase，
 * 這層再改為呼叫 API 即可，頁面不需大改。
 * 對照 data-model.md 的 Food Profile。
 */
import type { FoodProfile } from "./types";

const KEY = "zaohuo.foodProfile";

export const DEFAULT_PROFILE: FoodProfile = {
  kitchen_tools: [],
  dietary_restrictions: [],
  default_serving_size: 1,
};

export function getProfile(): FoodProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) } as FoodProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: FoodProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // 隱私模式/停用儲存時忽略；不影響流程
  }
}
