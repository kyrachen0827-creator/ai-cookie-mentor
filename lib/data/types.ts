/**
 * 料理脈絡型別定義
 *
 * 嚴格對照 docs/spec/data-model.md 的 Logical Name。
 * 若要新增/更名欄位，先回 data-model.md 確認並更新，不要在這裡先斬後奏（見 CLAUDE.md）。
 * 採「完整版」料理脈絡（product-spec 待討論事項 2 定案）。
 */

/** 難易度（difficulty_level）：規則判斷產出 */
export type DifficultyLevel = "新手" | "普通" | "需要經驗";

/** Cooking Session 狀態（session_status） */
export type SessionStatus = "進行中" | "已完成" | "中止";

/** Portfolio Entry 類型（entry_type） */
export type PortfolioEntryType = "收藏食譜" | "完成作品";

/** Food Profile（food_profile）：使用者基礎設定，跨次料理沿用 */
export interface FoodProfile {
  /** 廚房工具 kitchen_tools：多選，如氣炸鍋、烤箱 */
  kitchen_tools: string[];
  /** 過敏／飲食限制 dietary_restrictions：安全底線，推薦前必須排除 */
  dietary_restrictions: string[];
  /** 預設人數 default_serving_size */
  default_serving_size: number;
}

/** 食材項目（含份量） */
export interface Ingredient {
  name: string;
  /** 份量描述，例：2 顆、100g */
  amount: string;
}

/** 料理步驟：每步含動作、火力、時間、「怎麼看出做對了」 */
export interface RecipeStep {
  /** 動作 */
  action: string;
  /** 火力，例：中火 */
  heat?: string;
  /** 時間（分鐘） */
  minutes?: number;
  /** 怎麼看出做對了（外觀、聲音、氣味的具體描述，不用「適量」「炒到有香氣」） */
  doneness_cue: string;
}

/** Recipe（recipe）：一道菜的完整定義 */
export interface Recipe {
  id: string;
  /** 菜名 recipe_name */
  recipe_name: string;
  /** 難易度 difficulty_level：規則判斷產出 */
  difficulty_level: DifficultyLevel;
  /** 預估時間 estimated_time_minutes：規則判斷產出 */
  estimated_time_minutes: number;
  /** 所需廚房工具 required_tools：對照 Food Profile 過濾用 */
  required_tools: string[];
  /** 食材清單 ingredients：含份量 */
  ingredients: Ingredient[];
  /** 步驟 steps */
  steps: RecipeStep[];
  /** 成品標準 finished_dish_standard：老師與評審共用對照，v2 新增的關鍵欄位 */
  finished_dish_standard: string;
}

/** 過程紀錄一筆（session_log 的元素，完整版必記錄） */
export interface SessionLogEntry {
  at: string; // ISO 時間
  /** 來源：老師提醒 / 使用者拍照問狀態 / 中途照片 */
  source: "老師提醒" | "使用者狀態" | "中途照片";
  content: string;
}

/** Cooking Session（cooking_session）：三個 agent 共用料理脈絡的核心 */
export interface CookingSession {
  id: string;
  /** 關聯食譜 recipe_id */
  recipe_id: string;
  /** 目前步驟 current_step：老師用來記錄進度 */
  current_step: number;
  /** 缺料清單 missing_ingredients：動態扣除 */
  missing_ingredients: Ingredient[];
  /** 過程紀錄 session_log：完整版必記錄 */
  session_log: SessionLogEntry[];
  /** 狀態 session_status */
  session_status: SessionStatus;
}

/** Score（score）：評審結果。分數制＝各項 1–5、總分 1–15（待討論事項 5 定案） */
export interface Score {
  id: string;
  /** 關聯 Session session_id */
  session_id: string;
  /** 成品照片 dish_photo：保存於作品集，直到使用者刪除 */
  dish_photo: string;
  /** 色彩搭配分數 color_score：整數 1–5 */
  color_score: number;
  /** 擺盤造型分數 plating_score：整數 1–5 */
  plating_score: number;
  /** 烹調完成度分數 doneness_score：整數 1–5 */
  doneness_score: number;
  /** 總分 total_score：三項加總 1–15 */
  total_score: number;
  /** 做得好的點 strength_comment */
  strength_comment: string;
  /** 下次改進點 improvement_comment */
  improvement_comment: string;
}

/** Portfolio Entry（portfolio_entry）：收藏與作品集 */
export interface PortfolioEntry {
  id: string;
  /** 類型 entry_type */
  entry_type: PortfolioEntryType;
  /** 關聯食譜或 Session ref_id */
  ref_id: string;
}
