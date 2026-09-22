/**
 * 食譜推薦 agent —— 難易度與預估時間的「規則判斷」
 *
 * 對照 docs/spec/agents/recipe-agent.md 業務規則：
 * 難易度與時間依規則判斷，非 AI 自由估算，確保同一道菜每次結果一致。
 * 判斷因子：步驟數、是否需提前處理、是否需憑感覺判斷、是否需特殊技巧/工具、食材數量。
 */
import type { DifficultyLevel, Recipe } from "@/lib/data/types";

/** 規則判斷的輸入因子（由 AI 產出食譜草稿後，抽取這些客觀因子再套規則） */
export interface DifficultyFactors {
  /** 步驟數量 */
  stepCount: number;
  /** 是否需提前處理（醃製過夜、退冰、發酵） */
  needsAdvancePrep: boolean;
  /** 是否需要判斷「感覺」而非明確數字的動作 */
  needsFeelJudgement: boolean;
  /** 是否需要特殊技巧或工具 */
  needsSpecialSkillOrTool: boolean;
  /** 食材項目數量 */
  ingredientCount: number;
}

/**
 * 依規則計算難易度。
 * 以加權分數落點決定「新手／普通／需要經驗」，規則固定 → 同一道菜結果一致。
 */
export function judgeDifficulty(f: DifficultyFactors): DifficultyLevel {
  let score = 0;
  if (f.stepCount > 8) score += 2;
  else if (f.stepCount > 5) score += 1;
  if (f.ingredientCount > 8) score += 1;
  if (f.needsAdvancePrep) score += 1;
  if (f.needsFeelJudgement) score += 2;
  if (f.needsSpecialSkillOrTool) score += 2;

  if (score >= 4) return "需要經驗";
  if (score >= 2) return "普通";
  return "新手";
}

/**
 * 依步驟時間加總計算預估時間（分鐘）。
 * 時間預估依步驟數＋等待時間計算，確保一致。
 */
export function estimateTimeMinutes(steps: Recipe["steps"]): number {
  const total = steps.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  // 每步固定加 1 分鐘操作緩衝，避免只算等待時間而低估
  return total + steps.length;
}

/** 排序：新手友善優先（難易度低、時間短在前） */
const DIFFICULTY_ORDER: Record<DifficultyLevel, number> = {
  新手: 0,
  普通: 1,
  需要經驗: 2,
};

export function sortBeginnerFriendly(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
    const d =
      DIFFICULTY_ORDER[a.difficulty_level] - DIFFICULTY_ORDER[b.difficulty_level];
    if (d !== 0) return d;
    return a.estimated_time_minutes - b.estimated_time_minutes;
  });
}

/**
 * 推薦前過濾：依廚房工具過濾（沒有的工具，不推薦需要該工具的菜）。
 * 過敏／飲食限制的排除在 prompt 階段就要求 AI 排除，這裡再做一次工具硬性把關。
 */
export function filterByTools(recipes: Recipe[], ownedTools: string[]): Recipe[] {
  return recipes.filter((r) =>
    r.required_tools.every((t) => ownedTools.includes(t)),
  );
}
