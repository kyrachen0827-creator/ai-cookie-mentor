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
 * - 難易度、時間走 rules.ts 的規則判斷，非 AI 自由估算
 */
import type { FoodProfile, Recipe } from "@/lib/data/types";
import { generateText, hasGeminiKey } from "@/lib/ai/gemini";
import { filterByTools, sortBeginnerFriendly } from "./rules";

/** 鎖定的台灣可靠食譜來源（寫進 prompt，要求 AI 以其風格與常見做法為根據，降低幻覺） */
const TRUSTED_SOURCES = ["愛料理 iCook", "Cookpad 台灣", "楊桃美食網", "下廚房"];

export interface RecommendInput {
  /** 使用者輸入的食材（一種或多種） */
  ingredients: string[];
  profile: FoodProfile;
}

export interface RecommendResult {
  recipes: Recipe[];
  /** 找不到合適菜色時的坦白說明與建議（邊界情況） */
  note?: string;
}

function buildPrompt(input: RecommendInput): string {
  const { ingredients, profile } = input;
  return [
    "你是料理新手的食譜推薦助手。請根據使用者食材推薦 3–5 道新手做得到的菜。",
    `參考台灣常見可靠來源的做法風格：${TRUSTED_SOURCES.join("、")}；不要杜撰不存在的做法。`,
    `使用者食材：${ingredients.join("、")}`,
    `擁有的廚房工具：${profile.kitchen_tools.join("、") || "（未提供）"}`,
    `過敏／飲食限制（務必完全排除）：${profile.dietary_restrictions.join("、") || "無"}`,
    `預設人數：${profile.default_serving_size}`,
    "每道菜需包含：菜名、所需工具、食材(含份量)、步驟(每步含動作/火力/時間/怎麼看出做對了)、成品標準。",
    "步驟避免『適量』『炒到有香氣』這類需經驗才懂的說法，一律用可觀察的描述。",
    "請以 JSON 陣列輸出，不要多餘文字。",
  ].join("\n");
}

/**
 * 產生推薦。
 * 目前為骨架：有 key 時呼叫 Gemini（回傳後仍需 parse + 規則把關 + 合理性檢查，標 TODO）；
 * 無 key 時回傳範例資料，讓 Phase 1 流程可先跑通。
 */
export async function recommendRecipes(
  input: RecommendInput,
): Promise<RecommendResult> {
  if (input.ingredients.length === 0) {
    return { recipes: [], note: "請先輸入食材" };
  }

  if (hasGeminiKey()) {
    const raw = await generateText(buildPrompt(input));
    // TODO(Phase 1): 解析 raw JSON → 套 rules.ts 規則判斷難易度/時間 → 合理性檢查（避免幻覺）
    //                → filterByTools 過濾 → sortBeginnerFriendly 排序。
    //                目前先讓有 key 時也走範例，待解析與把關實作完成後移除。
    void raw;
  }

  const mock = mockRecipes(input.ingredients);
  // 硬性過濾：沒有的工具不推薦；過敏／飲食限制食材必須排除
  const byTools = filterByTools(mock, input.profile.kitchen_tools);
  const usable = filterByRestrictions(
    byTools.length > 0 ? byTools : mock,
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
    note: hasGeminiKey()
      ? undefined
      : "開發模式：未設定 GEMINI_API_KEY，先以範例資料展示流程。",
  };
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

/** 開發用範例資料（骨架階段，示範難易度排序與工具過濾） */
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
