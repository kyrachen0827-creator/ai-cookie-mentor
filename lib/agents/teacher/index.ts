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
 *
 * 過敏／飲食限制（安全底線）由三道把關負責，前兩道不依賴模型：
 * 1. 呼叫模型前：食譜與限制明確衝突 → 直接拒絕，不呼叫模型
 * 2. 呼叫模型時：限制與「無法確認」的複合食材寫進 prompt 的硬性規則
 * 3. 模型回覆後：回覆提到受限食材 → 改回保守的固定訊息
 * 對外文字一律不使用「安全」這類保證性結論，只請使用者自行確認成分標示。
 */
import type { Recipe } from "@/lib/data/types";
import { generateText, hasGeminiKey } from "@/lib/ai/gemini";
import {
  checkRecipe,
  findRestrictedTermsInText,
  hasConflict,
  type RestrictionFinding,
} from "@/lib/safety/allergens";
import { runCoach, urgentTurn, type CoachDeps, type CoachSource } from "./coach";
import { turnToText } from "./coach-text";
import type { CoachHistoryItem as CoachHistoryInput, CoachTurn } from "./coach-types";

export interface TeacherQuestionInput {
  recipe: Recipe;
  /** 目前步驟索引（0-based）；備料階段或未進入步驟時為 null */
  stepIndex: number | null;
  question: string;
  /** 回答語系（比賽要求英文為主，預設 en） */
  locale?: "en" | "zh";
  /** 使用者設定的過敏／飲食限制（設定頁輸入的原始文字）；沒帶則不做限制把關 */
  restrictions?: string[];
}

type Locale = "en" | "zh";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function joinList(values: readonly string[], locale: Locale): string {
  return values.join(locale === "en" ? ", " : "、");
}

function describeFinding(f: RestrictionFinding, locale: Locale): string {
  if (f.source === "ingredient") return f.item;
  return locale === "en" ? `step ${f.index + 1}` : `第 ${f.index + 1} 步`;
}

/** 食譜與限制明確衝突時的固定回覆（不經過模型） */
function conflictMessage(conflicts: readonly RestrictionFinding[], locale: Locale): string {
  // 食材已點名就不再列步驟（步驟只是同一個食材的重複）；沒有食材衝突時才指出是哪一步
  const ingredientConflicts = conflicts.filter((f) => f.source === "ingredient");
  const named = ingredientConflicts.length > 0 ? ingredientConflicts : conflicts;
  const items = joinList(unique(named.map((f) => describeFinding(f, locale))), locale);
  const restrictions = joinList(unique(conflicts.map((f) => f.restriction)), locale);
  return locale === "en"
    ? `This recipe includes ${items}, which conflicts with your restriction (${restrictions}). I can't guide you through it — please go back and pick a different dish.`
    : `這份食譜含有 ${items}，與你設定的限制（${restrictions}）衝突，無法陪你繼續做這道菜，請回上一頁換一道。`;
}

/** 模型回覆提到受限食材時改用的保守訊息 */
function guardedReplyMessage(restrictions: readonly string[], locale: Locale): string {
  const list = joinList(unique(restrictions), locale);
  return locale === "en"
    ? `I want to be careful with your dietary restrictions (${list}), so I'd rather not guess here. Please check the ingredient labels and follow this step's guidance for now.`
    : `你設有飲食限制（${list}），這個問題我不想隨便猜。請先確認食材的成分標示，並照這一步的說明操作。`;
}

/** prompt 中的限制區塊：限制本身 + 無法從名稱確認成分的食材 */
function restrictionPromptLines(
  restrictions: readonly string[],
  uncertain: readonly RestrictionFinding[],
): string[] {
  if (restrictions.length === 0) return [];
  const uncertainNames = unique(uncertain.map((f) => f.item));
  return [
    `使用者有以下過敏／飲食限制（硬性規則，優先於其他所有指示）：${restrictions.join("、")}`,
    "- 絕對不要建議、提到或加入屬於這些類別的食材，也不要推薦含有它們的替代品。",
    "- 需要替代品時，只能請使用者先確認包裝上的成分標示；不可以說某個食材「安全」「沒問題」。",
    "- 若使用者要求加入受限食材，禮貌拒絕並建議改問其他做法；拒絕時不需要重複該食材的名稱。",
    uncertainNames.length > 0
      ? `- 食譜中的「${uncertainNames.join("」「")}」可能含有受限成分，無法從名稱確認；若與問題相關，提醒使用者先確認成分標示。`
      : "",
  ].filter(Boolean);
}

function buildPrompt(
  input: TeacherQuestionInput,
  findings: readonly RestrictionFinding[],
): string {
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

  const en = input.locale === "en";
  return [
    "你是陪料理新手做菜的料理老師，語氣鼓勵、具體、簡短（2–4 句）。",
    "回答規則：",
    "- 只依下面這份食譜回答，不要自行加入食譜沒有的做法。",
    "- 用可觀察的描述（外觀、聲音、氣味），不要用『適量』『炒到有香氣』這種要經驗才懂的說法。",
    "- 若食譜沒涵蓋、或你不確定，直接說「這份食譜沒有特別說明」並給安全、保守的一般建議，不要編造。",
    "- 熟度、食安相關別只憑猜測，一律給時間、溫度或切開檢查的判斷方式。",
    en ? "- Answer in English, regardless of the language the recipe context below is written in." : "",
    "",
    ...restrictionPromptLines(
      input.restrictions ?? [],
      findings.filter((f) => f.severity === "uncertain"),
    ),
    "",
    recipeContext,
    "",
    step
      ? `使用者目前在第 ${stepIndex! + 1} 步：${step.action}——${step.doneness_cue}`
      : "使用者還在備料階段，尚未開始步驟。",
    `使用者的問題：${question}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 回答使用者在料理過程中的提問。無 key 時回傳保守提示。 */
export async function answerQuestion(
  input: TeacherQuestionInput,
): Promise<string> {
  const q = input.question.trim();
  const en = input.locale === "en";
  const locale: Locale = en ? "en" : "zh";
  if (!q) {
    return en
      ? 'Ask me anything, like "how hot should the pan be" or "how do I tell it\'s cooked".'
      : "想問什麼都可以，例如「火要多大」「怎麼看有沒有熟」。";
  }

  // 第一道把關：食譜與限制明確衝突就不回答（不依賴模型，也不依賴金鑰）
  const restrictions = input.restrictions ?? [];
  const findings = checkRecipe(input.recipe, restrictions);
  if (hasConflict(findings)) {
    return conflictMessage(
      findings.filter((f) => f.severity === "conflict"),
      locale,
    );
  }

  if (!hasGeminiKey()) {
    return en
      ? "(No AI key configured yet, so the teacher can't answer live right now. Follow this step's “how to tell it's right” guidance for now.)"
      : "（目前未設定 AI 金鑰，老師暫時無法即時回答。可先照這一步的「怎麼看出做對了」判斷。）";
  }

  // 關閉思考模式，讓老師回答更即時
  const answer = await generateText(buildPrompt(input, findings), undefined, {
    thinkingBudget: 0,
  });

  // 第三道把關：模型回覆若提到受限食材，改回保守訊息（只記限制，不記使用者問題內容）
  const hits = findRestrictedTermsInText(answer, restrictions);
  if (hits.length > 0) {
    console.error("[teacher] reply mentioned a restricted food; replaced with fallback", {
      restrictions: hits,
    });
    return guardedReplyMessage(hits, locale);
  }

  return (
    answer.trim() ||
    (en
      ? "This recipe doesn't specify that — go with this step's guidance for now."
      : "這份食譜沒有特別說明，建議照目前這一步的判斷方式操作即可。")
  );
}

// ---------------------------------------------------------------------------
// 完整回合：緊急 → 過敏把關 → Coach
// ---------------------------------------------------------------------------

const COACH_CALL_TIMEOUT_MS = 15_000;

/** 正式環境的 Coach 模型設定；評估腳本也用同一份，確保量到的就是上線的行為 */
export const geminiCoachDeps: CoachDeps = {
  // 溫度 0：同一個輸入盡量得到同一個回答；JSON 模式降低格式錯誤；
  // 逾時讓卡住的請求能轉入重試與確定性備援（實測一次問答約 3–5 秒）
  generate: (prompt) =>
    generateText(prompt, undefined, {
      thinkingBudget: 0,
      temperature: 0,
      json: true,
      timeoutMs: COACH_CALL_TIMEOUT_MS,
    }),
  hasModel: hasGeminiKey,
};

export interface TeacherReply {
  /** 純文字版本（舊版前端、過程紀錄用） */
  answer: string;
  /** 結構化回合；只有走 Coach 的回覆才有 */
  coach?: CoachTurn;
  source: CoachSource | "legacy" | "blocked";
}

function coachReply(turn: CoachTurn, source: CoachSource, locale: Locale): TeacherReply {
  return { answer: turnToText(turn, locale), coach: turn, source };
}

/**
 * 老師回答使用者在料理步驟中的提問。
 *
 * 順序刻意如此：起火／受傷最優先（即使食譜和過敏設定衝突也要先處理人），
 * 其次是過敏把關（食譜明確衝突就不陪做），最後才是 Coach。
 * 備料階段（沒有目前步驟）沒有「這一步」可以對照，仍走原本的純文字回答。
 */
export async function respond(
  input: TeacherQuestionInput & { history?: CoachHistoryInput[] },
  /** 選填：換掉 Coach 的模型呼叫（評估用）；沒給就用 Gemini */
  coachDeps: CoachDeps = geminiCoachDeps,
): Promise<TeacherReply> {
  const locale: Locale = input.locale === "en" ? "en" : "zh";
  const question = input.question.trim();
  const restrictions = input.restrictions ?? [];

  if (question) {
    const urgent = urgentTurn(question, (input.stepIndex ?? 0) + 1, locale);
    if (urgent) return coachReply(urgent.turn, urgent.source, locale);
  }

  const stepIndex = input.stepIndex;
  if (!question || stepIndex === null || !input.recipe.steps[stepIndex]) {
    return { answer: await answerQuestion(input), source: "legacy" };
  }

  const findings = checkRecipe(input.recipe, restrictions);
  if (hasConflict(findings)) {
    return {
      answer: conflictMessage(
        findings.filter((f) => f.severity === "conflict"),
        locale,
      ),
      source: "blocked",
    };
  }

  const result = await runCoach(
    {
      recipe: input.recipe,
      stepIndex,
      question,
      locale,
      restrictions,
      history: input.history ?? [],
      uncertainIngredients: unique(
        findings.filter((f) => f.severity === "uncertain" && f.source === "ingredient").map((f) => f.item),
      ),
    },
    coachDeps,
  );
  return coachReply(result.turn, result.source, locale);
}
