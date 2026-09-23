import "server-only";

/**
 * AI agent ②：料理老師（A 版：基礎陪伴）
 *
 * 對應 docs/spec/agents/cooking-teacher-agent.md（product-spec MVP 第 4 項）。
 * 職責獨立於食譜推薦與評審；只透過料理脈絡（選定 Recipe、Cooking Session）互通，
 * 不硬編碼呼叫其他 agent。
 *
 * 本檔負責「隨時提問」：以目前步驟為上下文回答，答案以食譜為準，
 * 食譜沒涵蓋或不確定 → 明說不確定、不亂編（呼應核心原則「新手安全感」「不越權」）。
 */
import type { Recipe } from "@/lib/data/types";
import { generateText, hasGeminiKey } from "@/lib/ai/gemini";

export interface TeacherQuestionInput {
  recipe: Recipe;
  /** 目前步驟索引（0-based）；備料階段或未進入步驟時為 null */
  stepIndex: number | null;
  question: string;
}

function buildPrompt(input: TeacherQuestionInput): string {
  const { recipe, stepIndex, question } = input;
  const step =
    stepIndex !== null && recipe.steps[stepIndex]
      ? recipe.steps[stepIndex]
      : null;

  const recipeContext = [
    `料理：${recipe.recipe_name}`,
    `成品標準：${recipe.finished_dish_standard}`,
    `完整步驟：`,
    ...recipe.steps.map(
      (s, i) =>
        `  ${i + 1}. ${s.action}${s.heat ? `（${s.heat}）` : ""}${s.minutes ? ` 約${s.minutes}分` : ""}——${s.doneness_cue}`,
    ),
  ].join("\n");

  return [
    "你是陪料理新手做菜的料理老師，語氣鼓勵、具體、簡短（2–4 句）。",
    "回答規則：",
    "- 只依下面這份食譜回答，不要自行加入食譜沒有的做法。",
    "- 用可觀察的描述（外觀、聲音、氣味），不要用『適量』『炒到有香氣』這種要經驗才懂的說法。",
    "- 若食譜沒涵蓋、或你不確定，直接說「這份食譜沒有特別說明」並給安全、保守的一般建議，不要編造。",
    "- 熟度、食安相關別只憑猜測，一律給時間、溫度或切開檢查的判斷方式。",
    "",
    recipeContext,
    "",
    step
      ? `使用者目前在第 ${stepIndex! + 1} 步：${step.action}——${step.doneness_cue}`
      : "使用者還在備料階段，尚未開始步驟。",
    `使用者的問題：${question}`,
  ].join("\n");
}

/** 回答使用者在料理過程中的提問。無 key 時回傳保守提示。 */
export async function answerQuestion(
  input: TeacherQuestionInput,
): Promise<string> {
  const q = input.question.trim();
  if (!q) return "想問什麼都可以，例如「火要多大」「怎麼看有沒有熟」。";

  if (!hasGeminiKey()) {
    return "（目前未設定 AI 金鑰，老師暫時無法即時回答。可先照這一步的「怎麼看出做對了」判斷。）";
  }

  const answer = await generateText(buildPrompt(input));
  return answer.trim() || "這份食譜沒有特別說明，建議照目前這一步的判斷方式操作即可。";
}
