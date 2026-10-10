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
import { checkRecipe, hasConflict } from "@/lib/safety/allergens";
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
  /** 輸出語系（比賽要求英文為主，預設 en）；required_tools 固定用中文 canonical 值，不受此影響 */
  locale?: "en" | "zh";
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
  const en = input.locale === "en";
  return [
    "你是台灣料理新手的食譜推薦助手。根據使用者食材，推薦 3 道新手做得到的家常菜。",
    `做法請參考台灣常見可靠來源的風格：${TRUSTED_SOURCES.join("、")}；只推薦真實存在的家常做法，不要杜撰。`,
    "",
    `使用者食材：${ingredients.join("、")}`,
    `擁有的廚房工具：${profile.kitchen_tools.join("、") || "（未提供，請只推薦免特殊工具或用一般鍋具即可的菜）"}`,
    `過敏／飲食限制（食材務必完全避開）：${profile.dietary_restrictions.join("、") || "無"}`,
    `預設人數：${profile.default_serving_size}`,
    "",
    "步驟描述避免『適量』『炒到有香氣』這類需經驗才懂的說法，一律用可觀察的判斷（外觀、聲音、氣味）。",
    en
      ? "IMPORTANT: Write recipe_name, ingredient names/amounts, step actions/doneness_cue, and finished_dish_standard all in English (translate the dish itself into natural English home-cooking language, don't just romanize it). But required_tools MUST stay exactly as the Chinese strings from this fixed list (do not translate them): 電磁爐、電子鍋、快煮鍋、氣炸鍋、烤箱、微波爐 — pick only from ones the user actually owns, listed above in Chinese."
      : "",
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
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 產生推薦。有 key 時呼叫 Gemini 生成並經規則把關；
 * 無 key 或生成失敗時退回範例資料，讓流程始終可跑（Demo 友善）。
 */
export async function recommendRecipes(
  input: RecommendInput,
): Promise<RecommendResult> {
  const en = input.locale === "en";
  if (input.ingredients.length === 0) {
    return { recipes: [], note: en ? "Please enter at least one ingredient" : "請先輸入食材" };
  }

  let candidates: Recipe[];
  let sourceNote: string | undefined;

  if (hasGeminiKey()) {
    try {
      candidates = await generateFromGemini(input);
      if (candidates.length === 0) throw new Error(en ? "AI returned no usable recipe" : "AI 未回傳可用食譜");
    } catch (e) {
      candidates = mockRecipes(input.ingredients, en);
      // 原始錯誤（可能含 Gemini 回應內容）只寫 server log，不回給使用者
      console.error("[recipe] Gemini generation failed, falling back to sample data", e);
      sourceNote = en
        ? "AI generation is temporarily unavailable — showing sample data for now."
        : "AI 生成暫時無法使用，先以範例資料展示。";
    }
  } else {
    candidates = mockRecipes(input.ingredients, en);
    sourceNote = en
      ? "Dev mode: GEMINI_API_KEY not set — showing sample data to demonstrate the flow."
      : "開發模式：未設定 GEMINI_API_KEY，先以範例資料展示流程。";
  }

  // 硬性過濾：沒有的工具不推薦（不 fallback，避免推薦到使用者做不了的菜）；
  // 過敏／飲食限制食材必須排除。兩者皆為硬性把關，過濾後為空就回「找不到」。
  const byTools = filterByTools(candidates, input.profile.kitchen_tools);
  const usable = filterByRestrictions(byTools, input.profile.dietary_restrictions);

  if (usable.length === 0) {
    return {
      recipes: [],
      note: en
        ? "No suitable dish found with your current ingredients and restrictions — try adding one more ingredient or relaxing the restrictions."
        : "以目前的食材與限制找不到合適的菜，試著多加一項食材，或放寬限制。",
    };
  }

  return {
    recipes: sortBeginnerFriendly(usable).slice(0, 5),
    note: sourceNote,
  };
}

/** 呼叫 Gemini 生成食譜，並以規則判斷難易度/時間、做合理性檢查 */
async function generateFromGemini(input: RecommendInput): Promise<Recipe[]> {
  // 關閉思考模式加速（推薦不需深度推理）
  const raw = await generateText(buildPrompt(input), undefined, {
    thinkingBudget: 0,
  });
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
      heat: normalizeHeat(s.heat),
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
    // 以內容雜湊產生 id：同一份食譜穩定、不同食譜不撞（避免 localStorage 收藏/進度/作品集串味）
    id: `ai-${slug(name)}-${hashString(name + JSON.stringify(ingredients) + JSON.stringify(steps))}`,
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

/** 簡易字串雜湊（產生穩定、碰撞率低的 id 後綴） */
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** 火力正規化：AI 對免開火步驟常回「無/免」等，統一轉為無（不顯示火力標籤） */
function normalizeHeat(heat?: string): string | undefined {
  const h = heat?.trim();
  if (
    !h ||
    ["無", "免", "不需要", "無需", "不用", "-", "—", "常溫"].includes(h) ||
    ["none", "no heat", "n/a", "room temperature"].includes(h.toLowerCase())
  ) {
    return undefined;
  }
  return h;
}

/**
 * 過敏／飲食限制：排除與限制明確衝突的食譜（食材名稱與步驟文字都檢查）。
 * 比對規則（類別詞、中英文、大小寫）見 lib/safety/allergens.ts。
 * 「無法確認」的複合食材（例：醬油）不在此排除，改由備料與老師階段提醒使用者確認成分標示。
 */
function filterByRestrictions(recipes: Recipe[], restrictions: string[]): Recipe[] {
  if (restrictions.length === 0) return recipes;
  return recipes.filter((r) => !hasConflict(checkRecipe(r, restrictions)));
}

/** 開發用範例資料（無 key 或生成失敗時的 fallback，示範難易度排序與工具過濾） */
function mockRecipes(ingredients: string[], en: boolean): Recipe[] {
  if (en) return mockRecipesEn(ingredients);

  const main = ingredients[0] ?? "食材";
  return [
    {
      id: `mock-${main}-egg`,
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
      id: `mock-${main}-soup`,
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
      id: `mock-${main}-salad`,
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
      id: `mock-${main}-airfry`,
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
      id: `mock-${main}-bake`,
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

/** 英文版開發用範例資料。難易度／required_tools 仍用資料模型的中文 canonical 值。 */
function mockRecipesEn(ingredients: string[]): Recipe[] {
  const main = ingredients[0] ?? "your ingredient";
  return [
    {
      id: `mock-en-${main}-egg`,
      recipe_name: `${main} Scrambled Eggs`,
      difficulty_level: "新手",
      estimated_time_minutes: 12,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 piece" },
        { name: "Egg", amount: "2" },
        { name: "Salt", amount: "pinch" },
        { name: "Cooking oil", amount: "a little" },
      ],
      steps: [
        { action: `Slice the ${main}`, minutes: 3, doneness_cue: "Cut into ~0.5cm thick slices" },
        { action: "Beat eggs with salt", minutes: 1, doneness_cue: "Evenly mixed, no visible egg white chunks" },
        { action: "Heat oil, scramble eggs", heat: "Medium heat", minutes: 2, doneness_cue: "Edges of the egg set, then remove" },
        { action: `Add ${main}, stir-fry together`, heat: "Medium heat", minutes: 4, doneness_cue: `${main} turns translucent, edges soften` },
      ],
      finished_dish_standard: `Golden, fluffy eggs; ${main} fully cooked but still colorful; no excess liquid, not burnt.`,
    },
    {
      id: `mock-en-${main}-soup`,
      recipe_name: `${main} Egg Drop Soup`,
      difficulty_level: "新手",
      estimated_time_minutes: 15,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 piece" },
        { name: "Egg", amount: "1" },
        { name: "Water", amount: "500ml" },
        { name: "Salt", amount: "pinch" },
      ],
      steps: [
        { action: `Chop ${main} and bring to a boil`, heat: "Medium heat", minutes: 6, doneness_cue: `${main} softens, broth turns rich` },
        { action: "Drizzle beaten egg in a slow circle", heat: "Low heat", minutes: 1, doneness_cue: "Egg forms fine ribbons, then turn off heat" },
        { action: "Season with salt", minutes: 1, doneness_cue: "Taste — seasoning balanced" },
      ],
      finished_dish_standard: `Clear, lightly reddish broth; fine, unclumped egg ribbons; ${main} soft but not mushy.`,
    },
    {
      id: `mock-en-${main}-salad`,
      recipe_name: `${main} Cold Salad`,
      difficulty_level: "新手",
      estimated_time_minutes: 10,
      required_tools: [],
      ingredients: [
        { name: main, amount: "1 piece" },
        { name: "Minced garlic", amount: "1 tsp" },
        { name: "Soy sauce", amount: "1 tbsp" },
        { name: "Sesame oil", amount: "a little" },
      ],
      steps: [
        { action: `Cut ${main} into thin strips`, minutes: 4, doneness_cue: "Even, thin strips" },
        { action: "Salt and let sit", minutes: 5, doneness_cue: "Squeeze out released liquid" },
        { action: "Toss with garlic, soy sauce, sesame oil", minutes: 1, doneness_cue: "Every strip evenly coated" },
      ],
      finished_dish_standard: `Bright color, crisp texture, sauce evenly coating with no pooling.`,
    },
    {
      id: `mock-en-${main}-airfry`,
      recipe_name: `Air-Fried ${main}`,
      difficulty_level: "普通",
      estimated_time_minutes: 20,
      required_tools: ["氣炸鍋"],
      ingredients: [
        { name: main, amount: "1 piece" },
        { name: "Olive oil", amount: "1 tsp" },
        { name: "Salt", amount: "pinch" },
        { name: "Black pepper", amount: "pinch" },
      ],
      steps: [
        { action: `Cut ${main} into pieces, toss with oil and seasoning`, minutes: 4, doneness_cue: "Every piece lightly coated in oil" },
        { action: "Air fry at 180°C", heat: "180°C", minutes: 12, doneness_cue: "Golden surface, edges slightly crisp" },
        { action: "Rest before serving", minutes: 2, doneness_cue: "Cool enough to eat comfortably" },
      ],
      finished_dish_standard: `Golden, slightly caramelized surface; tender and juicy inside; not overly wet.`,
    },
    {
      id: `mock-en-${main}-bake`,
      recipe_name: `Baked Cheesy ${main}`,
      difficulty_level: "需要經驗",
      estimated_time_minutes: 40,
      required_tools: ["烤箱"],
      ingredients: [
        { name: main, amount: "2 pieces" },
        { name: "Shredded cheese", amount: "as needed" },
        { name: "Heavy cream", amount: "50ml" },
        { name: "Salt", amount: "pinch" },
      ],
      steps: [
        { action: `Slice ${main} and layer in a dish`, minutes: 6, doneness_cue: "Slices overlapping, not pressed down" },
        { action: "Pour cream, sprinkle cheese", minutes: 3, doneness_cue: "Cheese evenly covers the surface" },
        { action: "Bake at 200°C", heat: "200°C", minutes: 25, doneness_cue: "Golden top, cheese bubbling" },
      ],
      finished_dish_standard: `Golden, stretchy melted cheese on top; tender inside; sauce thick, not watery.`,
    },
  ];
}
