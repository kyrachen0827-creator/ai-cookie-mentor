import "server-only";

/**
 * AI agent ①：食譜推薦
 *
 * 對應 docs/spec/agents/recipe-agent.md（product-spec MVP 第 2 項）。
 * 職責獨立：只負責「選不出來」痛點；不硬編碼呼叫其他 agent。
 * 產出的 Recipe（含 finished_dish_standard）之後由老師、評審透過料理脈絡讀取。
 *
 * 定案要點（2026/09/22）：
 * - 推薦 3–5 道，新手友善優先
 * - 食譜來源：AI 生成，鎖定台灣可靠來源（iCook / Cookpad 台灣 / 楊桃 / 下廚房）以降低幻覺
 * - 難易度、時間走 rules.ts 的規則判斷，非 AI 自由估算（AI 只給客觀因子，難易度由程式算）
 */
import type { FoodProfile, Recipe } from "@/lib/data/types";
import { generateText, hasGeminiKey } from "@/lib/ai/gemini";
import {
  estimateTimeMinutes,
  filterByTools,
  judgeDifficulty,
  sortBeginnerFriendly,
} from "./rules";

/** 鎖定的台灣可靠食譜來源（寫進 prompt，要求 AI 以其風格與常見做法為根據，降低幻覺） */
const TRUSTED_SOURCES = ["愛料理 iCook", "Cookpad 台灣", "楊桃美食網", "下廚房"];

export interface RecommendInput {
  /** 使用者輸入的食材（一種或多種） */
  ingredients: string[];
  profile: FoodProfile;
}

export interface RecommendResult {
  recipes: Recipe[];
  /** 找不到合適菜色或來源說明（邊界情況／開發提示） */
  note?: string;
}

/** AI 回傳的單筆食譜原始結構（難易度與時間交由程式規則判斷，不由 AI 決定） */
interface RawRecipe {
  recipe_name?: string;
  required_tools?: string[];
  ingredients?: { name?: string; amount?: string }[];
  steps?: { action?: string; heat?: string; minutes?: number; doneness_cue?: string }[];
  finished_dish_standard?: string;
  // 規則判斷用的客觀因子（由 AI 標註）
  needs_advance_prep?: boolean;
  needs_feel_judgement?: boolean;
  needs_special_skill_or_tool?: boolean;
}

function buildPrompt(input: RecommendInput): string {
  const { ingredients, profile } = input;
  return [
    "你是台灣料理新手的食譜推薦助手。根據使用者食材，推薦 3–5 道新手做得到的家常菜。",
    `做法請參考台灣常見可靠來源的風格：${TRUSTED_SOURCES.join("、")}；只推薦真實存在的家常做法，不要杜撰。`,
    "",
    `使用者食材：${ingredients.join("、")}`,
    `擁有的廚房工具：${profile.kitchen_tools.join("、") || "（未提供，請只推薦免特殊工具或用一般鍋具即可的菜）"}`,
    `過敏／飲食限制（食材務必完全避開）：${profile.dietary_restrictions.join("、") || "無"}`,
    `預設人數：${profile.default_serving_size}`,
    "",
    "步驟描述避免『適量』『炒到有香氣』這類需經驗才懂的說法，一律用可觀察的判斷（外觀、聲音、氣味）。",
    "只輸出 JSON 陣列，不要有任何多餘文字或 markdown。每個元素格式：",
    `{
  "recipe_name": "菜名",
  "required_tools": ["只能從使用者工具清單挑，用不到就給空陣列"],
  "ingredients": [{"name": "食材", "amount": "份量，如 2 顆 / 100g"}],
  "steps": [{"action": "動作", "heat": "火力，如 中火", "minutes": 3, "doneness_cue": "怎麼看出做對了"}],
  "finished_dish_standard": "成品該有的樣子：顏色、質地、外觀",
  "needs_advance_prep": false,
  "needs_feel_judgement": false,
  "needs_special_skill_or_tool": false
}`,
  ].join("\n");
}

/**
 * 產生推薦。有 key 時呼叫 Gemini 生成並經規則把關；
 * 無 key 或生成失敗時退回範例資料，讓流程始終可跑（Demo 友善）。
 */
export async function recommendRecipes(
  input: RecommendInput,
): Promise<RecommendResult> {
  if (input.ingredients.length === 0) {
    return { recipes: [], note: "請先輸入食材" };
  }

  let candidates: Recipe[];
  let sourceNote: string | undefined;

  if (hasGeminiKey()) {
    try {
      candidates = await generateFromGemini(input);
      if (candidates.length === 0) throw new Error("AI 未回傳可用食譜");
    } catch (e) {
      candidates = mockRecipes(input.ingredients);
      const msg = e instanceof Error ? e.message : "未知錯誤";
      sourceNote = `AI 生成暫時無法使用（${msg}），先以範例資料展示。`;
    }
  } else {
    candidates = mockRecipes(input.ingredients);
    sourceNote = "開發模式：未設定 GEMINI_API_KEY，先以範例資料展示流程。";
  }

  // 硬性過濾：沒有的工具不推薦；過敏／飲食限制食材必須排除
  const byTools = filterByTools(candidates, input.profile.kitchen_tools);
  const usable = filterByRestrictions(
    byTools.length > 0 ? byTools : candidates,
    input.profile.dietary_restrictions,
  );

  if (usable.length === 0) {
    return {
      recipes: [],
      note: "以目前的食材與限制找不到合適的菜，試著多加一項食材，或放寬限制。",
    };
  }

  return {
    recipes: sortBeginnerFriendly(usable).slice(0, 5),
    note: sourceNote,
  };
}

/** 呼叫 Gemini 生成食譜，並以規則判斷難易度/時間、做合理性檢查 */
async function generateFromGemini(input: RecommendInput): Promise<Recipe[]> {
  const raw = await generateText(buildPrompt(input));
  const parsed = extractJsonArray(raw);

  return parsed
    .map((r, i) => toRecipe(r, i))
    .filter((r): r is Recipe => r !== null);
}

/** 從模型輸出中抽出 JSON 陣列（容忍 ```json 圍欄與前後雜訊） */
function extractJsonArray(raw: string): RawRecipe[] {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("AI 回傳格式無法解析");
  }
  const data = JSON.parse(s.slice(start, end + 1));
  return Array.isArray(data) ? (data as RawRecipe[]) : [];
}

/**
 * 原始資料 → Recipe，含合理性檢查與規則判斷。
 * 難易度、時間由程式依規則產出（非 AI 自由估算），確保同一道菜結果一致。
 * 不合格（缺名稱／無食材／無步驟）者回傳 null 被濾除，降低幻覺影響。
 */
function toRecipe(r: RawRecipe, index: number): Recipe | null {
  const name = r.recipe_name?.trim();
  const ingredients = (r.ingredients ?? [])
    .filter((i) => i?.name?.trim())
    .map((i) => ({ name: i.name!.trim(), amount: (i.amount ?? "").trim() }));
  const steps = (r.steps ?? [])
    .filter((s) => s?.action?.trim())
    .map((s) => ({
      action: s.action!.trim(),
      heat: s.heat?.trim() || undefined,
      minutes: typeof s.minutes === "number" ? s.minutes : undefined,
      doneness_cue: (s.doneness_cue ?? "").trim(),
    }));

  if (!name || ingredients.length === 0 || steps.length === 0) return null;

  const difficulty_level = judgeDifficulty({
    stepCount: steps.length,
    needsAdvancePrep: Boolean(r.needs_advance_prep),
    needsFeelJudgement: Boolean(r.needs_feel_judgement),
    needsSpecialSkillOrTool: Boolean(r.needs_special_skill_or_tool),
    ingredientCount: ingredients.length,
  });

  return {
    id: `ai-${index}-${slug(name)}`,
    recipe_name: name,
    difficulty_level,
    estimated_time_minutes: estimateTimeMinutes(steps),
    required_tools: (r.required_tools ?? []).filter(Boolean),
    ingredients,
    steps,
    finished_dish_standard: (r.finished_dish_standard ?? "").trim(),
  };
}

function slug(name: string): string {
  return name.replace(/\s+/g, "-").slice(0, 12);
}

/** 過敏／飲食限制：排除食材命中任一限制字詞的食譜 */
function filterByRestrictions(recipes: Recipe[], restrictions: string[]): Recipe[] {
  if (restrictions.length === 0) return recipes;
  return recipes.filter(
    (r) =>
      !r.ingredients.some((ing) =>
        restrictions.some((bad) => ing.name.includes(bad)),
      ),
  );
}

/** 開發用範例資料（無 key 或生成失敗時的 fallback，示範難易度排序與工具過濾） */
function mockRecipes(ingredients: string[]): Recipe[] {
  const main = ingredients[0] ?? "食材";
  return [
    {
      id: "mock-egg",
      recipe_name: `${main}炒蛋`,
      difficulty_level: "新手",
      estimated_time_minutes: 12,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 條" },
        { name: "雞蛋", amount: "2 顆" },
        { name: "鹽", amount: "少許" },
        { name: "食用油", amount: "少許" },
      ],
      steps: [
        { action: `${main}切片`, minutes: 3, doneness_cue: "切成約 0.5 公分厚的片" },
        { action: "打蛋加鹽拌勻", minutes: 1, doneness_cue: "蛋液均勻無明顯蛋白塊" },
        { action: "熱鍋下油炒蛋", heat: "中火", minutes: 2, doneness_cue: "蛋液邊緣凝固即可盛起" },
        { action: `下${main}拌炒`, heat: "中火", minutes: 4, doneness_cue: `${main}轉透亮、邊緣微軟` },
      ],
      finished_dish_standard: `蛋色金黃蓬鬆，${main}熟透但仍保有色澤，整體不出水、不焦黑。`,
    },
    {
      id: "mock-soup",
      recipe_name: `${main}蛋花湯`,
      difficulty_level: "新手",
      estimated_time_minutes: 15,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 顆" },
        { name: "雞蛋", amount: "1 顆" },
        { name: "水", amount: "500ml" },
        { name: "鹽", amount: "少許" },
      ],
      steps: [
        { action: `${main}切塊下水煮滾`, heat: "中火", minutes: 6, doneness_cue: `${main}變軟、湯色轉濃` },
        { action: "蛋液沿邊繞圈倒入", heat: "小火", minutes: 1, doneness_cue: "蛋液成細緻蛋花即熄火" },
        { action: "加鹽調味", minutes: 1, doneness_cue: "嘗一口鹹淡適中" },
      ],
      finished_dish_standard: `湯色清澈微紅，蛋花細緻不結塊，${main}軟而不爛。`,
    },
    {
      id: "mock-salad",
      recipe_name: `涼拌${main}`,
      difficulty_level: "新手",
      estimated_time_minutes: 10,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 條" },
        { name: "蒜末", amount: "1 小匙" },
        { name: "醬油", amount: "1 大匙" },
        { name: "香油", amount: "少許" },
      ],
      steps: [
        { action: `${main}切絲`, minutes: 4, doneness_cue: "切成細絲、粗細一致" },
        { action: "加鹽抓醃靜置", minutes: 5, doneness_cue: "出水後擠乾" },
        { action: "拌入蒜末醬油香油", minutes: 1, doneness_cue: "每根都均勻裹上醬汁" },
      ],
      finished_dish_standard: `色澤鮮綠、口感爽脆，醬汁均勻不積水。`,
    },
    {
      id: "mock-airfry",
      recipe_name: `氣炸${main}`,
      difficulty_level: "普通",
      estimated_time_minutes: 20,
      required_tools: ["氣炸鍋"],
      ingredients: [
        { name: main, amount: "1 條" },
        { name: "橄欖油", amount: "1 小匙" },
        { name: "鹽", amount: "少許" },
        { name: "黑胡椒", amount: "少許" },
      ],
      steps: [
        { action: `${main}切段拌油與調味`, minutes: 4, doneness_cue: "每塊都沾到薄薄一層油" },
        { action: "氣炸鍋 180°C", heat: "180°C", minutes: 12, doneness_cue: "表面金黃、邊緣微焦" },
        { action: "取出靜置", minutes: 2, doneness_cue: "不燙口即可享用" },
      ],
      finished_dish_standard: `表面金黃帶焦香，內部軟熟多汁，不出過多水分。`,
    },
    {
      id: "mock-bake",
      recipe_name: `烤箱焗${main}`,
      difficulty_level: "需要經驗",
      estimated_time_minutes: 40,
      required_tools: ["烤箱"],
      ingredients: [
        { name: main, amount: "2 條" },
        { name: "起司絲", amount: "適量" },
        { name: "鮮奶油", amount: "50ml" },
        { name: "鹽", amount: "少許" },
      ],
      steps: [
        { action: `${main}切片鋪盤`, minutes: 6, doneness_cue: "片片相疊、不重壓" },
        { action: "淋鮮奶油撒起司", minutes: 3, doneness_cue: "起司均勻覆蓋表面" },
        { action: "烤箱 200°C 焗烤", heat: "200°C", minutes: 25, doneness_cue: "表面金黃、起司冒泡" },
      ],
      finished_dish_standard: `表面金黃起司牽絲，內部軟嫩，醬汁濃稠不出水。`,
    },
  ];
}
