/**
 * API 請求驗證：把前端傳來的 unknown 轉成型別正確、大小受限的資料。
 *
 * 原則：
 * - 驗證失敗丟 ApiError(400)，訊息由我們撰寫，不回顯使用者輸入
 * - 輸出是「重建的新物件」，只保留已知欄位，多餘欄位直接丟棄
 *   （縮小 prompt 注入面：模型只會看到我們認得的欄位）
 * - 對應 lib/data/types.ts 的欄位；不新增資料欄位
 */
import { ApiError } from "./guard";
import { COACH_LIMITS, trimHistory, type CoachHistoryItem } from "@/lib/agents/teacher/coach-types";
import type {
  DifficultyLevel,
  FoodProfile,
  Ingredient,
  Recipe,
  RecipeStep,
  SessionLogEntry,
} from "@/lib/data/types";

// ---- 上限（集中管理，調整時只改這裡） ----
export const LIMITS = {
  ingredientsInput: 20,
  ingredientNameChars: 40,
  // 設定頁的內容不拒絕、而是截斷（見 clampedStringList），所以上限放寬
  profileItems: 30,
  profileItemChars: 100,
  servingMax: 20,
  recipeIdChars: 120,
  recipeNameChars: 100,
  recipeIngredients: 40,
  recipeSteps: 30,
  shortTextChars: 100,
  longTextChars: 1000,
  // 一週。食譜 agent 會產出醃過夜、退冰、發酵這類「需提前處理」的食譜，等待時間可能很長
  stepMinutesMax: 10_080,
  recipeMinutesMax: 100_000,
  questionChars: 500,
  sessionLogEntries: 30,
  sessionLogContentChars: 500,
  imageBase64Chars: 3_000_000,
  dishNameChars: 100,
  dishStandardChars: 1000,
} as const;

const DIFFICULTIES: readonly DifficultyLevel[] = ["新手", "普通", "需要經驗"];
const LOG_SOURCES: readonly SessionLogEntry["source"][] = [
  "老師提醒",
  "使用者狀態",
  "中途照片",
];
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function invalid(field: string): ApiError {
  return new ApiError(400, {
    en: `That input isn't valid or is too long (${field}). Please shorten it and try again.`,
    zh: `輸入內容不正確或太長（欄位：${field}），請縮短後再試。`,
  });
}

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown, field: string): Rec {
  if (!isRecord(v)) throw invalid(field);
  return v;
}

function text(
  v: unknown,
  field: string,
  maxChars: number,
  opts: { allowEmpty?: boolean } = {},
): string {
  if (typeof v !== "string") throw invalid(field);
  const s = v.trim();
  if (s.length > maxChars) throw invalid(field);
  if (!opts.allowEmpty && s.length === 0) throw invalid(field);
  return s;
}

function optionalText(v: unknown, field: string, maxChars: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = text(v, field, maxChars, { allowEmpty: true });
  return s === "" ? undefined : s;
}

function array(v: unknown, field: string, maxItems: number): unknown[] {
  if (!Array.isArray(v) || v.length > maxItems) throw invalid(field);
  return v;
}

function stringList(v: unknown, field: string, maxItems: number, maxChars: number): string[] {
  return array(v, field, maxItems).map((item) => text(item, field, maxChars));
}

/**
 * 使用者自己輸入的清單（過敏、器具）：型別錯誤才拒絕，過長或過多就截斷。
 * 如果一條過長的限制就讓整個請求失敗，使用者在改設定之前會一直收到錯誤。
 */
function clampedStringList(v: unknown, field: string, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(v)) throw invalid(field);
  return v
    .map((item) => {
      if (typeof item !== "string") throw invalid(field);
      return item.trim().slice(0, maxChars);
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// 共用結構
// ---------------------------------------------------------------------------

export function parseProfile(v: unknown): FoodProfile {
  if (v === undefined || v === null) {
    return { kitchen_tools: [], dietary_restrictions: [], default_serving_size: 1 };
  }
  const r = asRecord(v, "profile");
  const serving = r.default_serving_size;
  const servingSize =
    typeof serving === "number" &&
    Number.isInteger(serving) &&
    serving >= 1 &&
    serving <= LIMITS.servingMax
      ? serving
      : 1;

  return {
    kitchen_tools: clampedStringList(
      r.kitchen_tools ?? [],
      "profile.kitchen_tools",
      LIMITS.profileItems,
      LIMITS.profileItemChars,
    ),
    dietary_restrictions: clampedStringList(
      r.dietary_restrictions ?? [],
      "profile.dietary_restrictions",
      LIMITS.profileItems,
      LIMITS.profileItemChars,
    ),
    default_serving_size: servingSize,
  };
}

function parseIngredient(v: unknown): Ingredient {
  const r = asRecord(v, "recipe.ingredients");
  return {
    name: text(r.name, "recipe.ingredients.name", LIMITS.shortTextChars),
    amount: text(r.amount ?? "", "recipe.ingredients.amount", LIMITS.shortTextChars, {
      allowEmpty: true,
    }),
  };
}

function parseStep(v: unknown): RecipeStep {
  const r = asRecord(v, "recipe.steps");
  const minutes = r.minutes;
  if (
    minutes !== undefined &&
    minutes !== null &&
    (typeof minutes !== "number" || !(minutes >= 0 && minutes <= LIMITS.stepMinutesMax))
  ) {
    throw invalid("recipe.steps.minutes");
  }
  return {
    action: text(r.action, "recipe.steps.action", LIMITS.longTextChars),
    heat: optionalText(r.heat, "recipe.steps.heat", LIMITS.shortTextChars),
    minutes: typeof minutes === "number" ? minutes : undefined,
    // AI 偶爾會回空字串，既有流程允許，這裡維持相容
    doneness_cue: text(r.doneness_cue ?? "", "recipe.steps.doneness_cue", LIMITS.longTextChars, {
      allowEmpty: true,
    }),
  };
}

export function parseRecipe(v: unknown): Recipe {
  const r = asRecord(v, "recipe");
  const difficulty = r.difficulty_level;
  if (!DIFFICULTIES.includes(difficulty as DifficultyLevel)) {
    throw invalid("recipe.difficulty_level");
  }
  const minutes = r.estimated_time_minutes;
  if (typeof minutes !== "number" || !(minutes >= 0 && minutes <= LIMITS.recipeMinutesMax)) {
    throw invalid("recipe.estimated_time_minutes");
  }

  const steps = array(r.steps, "recipe.steps", LIMITS.recipeSteps).map(parseStep);
  if (steps.length === 0) throw invalid("recipe.steps");

  return {
    id: text(r.id, "recipe.id", LIMITS.recipeIdChars),
    recipe_name: text(r.recipe_name, "recipe.recipe_name", LIMITS.recipeNameChars),
    difficulty_level: difficulty as DifficultyLevel,
    estimated_time_minutes: minutes,
    required_tools: stringList(
      r.required_tools ?? [],
      "recipe.required_tools",
      LIMITS.profileItems,
      LIMITS.profileItemChars,
    ),
    ingredients: array(r.ingredients, "recipe.ingredients", LIMITS.recipeIngredients).map(
      parseIngredient,
    ),
    steps,
    finished_dish_standard: text(
      r.finished_dish_standard ?? "",
      "recipe.finished_dish_standard",
      LIMITS.longTextChars,
      { allowEmpty: true },
    ),
  };
}

/**
 * 過程紀錄會隨使用越長越多，所以不整包拒絕：
 * 只取最新 N 筆、截斷內容、丟棄格式不符的項目。
 */
export function parseSessionLog(v: unknown): SessionLogEntry[] {
  if (!Array.isArray(v)) return [];
  const entries: SessionLogEntry[] = [];
  for (const item of v.slice(-LIMITS.sessionLogEntries)) {
    if (!isRecord(item)) continue;
    const source = item.source as SessionLogEntry["source"];
    if (!LOG_SOURCES.includes(source)) continue;
    if (typeof item.at !== "string" || typeof item.content !== "string") continue;
    entries.push({
      at: item.at.slice(0, 40),
      source,
      content: item.content.slice(0, LIMITS.sessionLogContentChars),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// 各路由的請求
// ---------------------------------------------------------------------------

export interface RecipeRequest {
  ingredients: string[];
  profile: FoodProfile;
}

export function parseRecipeRequest(body: unknown): RecipeRequest {
  const r = asRecord(body, "body");
  const ingredients = array(r.ingredients, "ingredients", LIMITS.ingredientsInput)
    .map((item) => text(item, "ingredients", LIMITS.ingredientNameChars, { allowEmpty: true }))
    .filter(Boolean);
  if (ingredients.length === 0) {
    throw new ApiError(400, {
      en: "Please enter at least one ingredient",
      zh: "請輸入至少一種食材",
    });
  }
  return { ingredients, profile: parseProfile(r.profile) };
}

/**
 * 同一步驟的對話歷史。和過程紀錄一樣不整包拒絕：只取最新幾筆（保留澄清問題那段）、截斷長度、丟掉格式不符的項目。
 * 注意 coach 那一側是前端自己帶的，不可信；它只影響「要不要再問澄清問題」和提示詞內容。
 */
export function parseHistory(v: unknown): CoachHistoryItem[] {
  if (!Array.isArray(v)) return [];
  const items = v.flatMap((item): CoachHistoryItem[] => {
    if (!isRecord(item)) return [];
    const { role, text, kind } = item;
    if ((role !== "user" && role !== "coach") || typeof text !== "string") return [];
    const clipped = text.trim().slice(0, COACH_LIMITS.historyTextChars);
    if (!clipped) return [];
    const coachKind = kind === "clarify" || kind === "advise" ? kind : undefined;
    return [
      role === "coach" && coachKind
        ? { role, text: clipped, kind: coachKind }
        : { role, text: clipped },
    ];
  });
  return trimHistory(items);
}

export interface TeacherRequest {
  recipe: Recipe;
  stepIndex: number | null;
  question: string;
  /** 選填；沒帶時視為沒有限制（舊版前端相容） */
  profile: FoodProfile;
  /** 選填；同一步驟內的對話。沒帶視為第一次提問 */
  history: CoachHistoryItem[];
}

export function parseTeacherRequest(body: unknown): TeacherRequest {
  const r = asRecord(body, "body");
  const recipe = parseRecipe(r.recipe);

  let stepIndex: number | null = null;
  if (r.stepIndex !== undefined && r.stepIndex !== null) {
    const idx = r.stepIndex;
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= recipe.steps.length) {
      throw invalid("stepIndex");
    }
    stepIndex = idx;
  }

  return {
    recipe,
    stepIndex,
    question: text(r.question, "question", LIMITS.questionChars),
    profile: parseProfile(r.profile),
    history: parseHistory(r.history),
  };
}

export interface JudgeRequest {
  recipe: Recipe;
  sessionLog: SessionLogEntry[];
  image: { mimeType: string; dataBase64: string };
}

export function parseJudgeRequest(body: unknown): JudgeRequest {
  const r = asRecord(body, "body");
  const image = asRecord(r.image, "image");

  const mimeType = image.mimeType;
  if (!IMAGE_MIME_TYPES.includes(mimeType as (typeof IMAGE_MIME_TYPES)[number])) {
    throw invalid("image.mimeType");
  }
  const data = image.dataBase64;
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    data.length > LIMITS.imageBase64Chars ||
    !BASE64_PATTERN.test(data)
  ) {
    throw invalid("image.dataBase64");
  }

  return {
    recipe: parseRecipe(r.recipe),
    sessionLog: parseSessionLog(r.sessionLog),
    image: { mimeType: mimeType as string, dataBase64: data },
  };
}

export interface ImageRequest {
  name: string;
  standard?: string;
}

export function parseImageRequest(body: unknown): ImageRequest {
  const r = asRecord(body, "body");
  return {
    name: text(r.name, "name", LIMITS.dishNameChars),
    standard: optionalText(r.standard, "standard", LIMITS.dishStandardChars),
  };
}
