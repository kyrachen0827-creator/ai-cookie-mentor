/**
 * Cooking Coach 的回合流程。
 *
 * 一個回合的處理順序（越前面越不依賴模型）：
 * 1. 緊急（起火）／受傷 → 固定的標準處置，不呼叫模型
 * 2. 問題分流：命中補救知識卡且缺關鍵資訊、還沒問過 → 由程式直接產生那一個澄清問題
 * 3. 呼叫模型，要求回結構化 JSON（帶入目前步驟、同步驟的對話、知識卡、熟度依據、過敏限制）
 * 4. 驗證格式 + 確定性護欄；不合格就帶著原因重試一次
 * 5. 仍不合格或模型不可用 → 用食譜本身與知識卡組成的確定性備援，並如實說明限制
 *
 * 這個檔案只負責流程；模型呼叫以 deps 注入，所以可以用假的模型做完整測試。
 * 不需要伺服器環境，沒有 server-only 相依。
 */
import type { Recipe } from "@/lib/data/types";
import { findRestrictedTermsInText } from "@/lib/safety/allergens";
import {
  extractJsonObject,
  parseCoachTurn,
  type CoachAction,
  type CoachHistoryItem,
  type CoachTurn,
  type ParseResult,
} from "./coach-types";
import { isDonenessQuestion, relevantDonenessClasses, type DonenessClass } from "./doneness";
import {
  checkCoachTurn,
  describeViolations,
  type GuardContext,
  type ViolationCode,
} from "./guardrails";
import {
  clarifyTurn,
  detectEmergency,
  detectInjury,
  emergencyTurn,
  hasAskedToClarify,
  injuryTurn,
  triage,
  type TriageResult,
} from "./triage";

type Locale = "en" | "zh";

export interface CoachInput {
  recipe: Recipe;
  /** 目前步驟（0-based），必須是有效的步驟 */
  stepIndex: number;
  question: string;
  locale: Locale;
  /** 使用者設定的過敏／飲食限制（原始文字） */
  restrictions: readonly string[];
  /** 同一步驟內的對話（最舊在前） */
  history: readonly CoachHistoryItem[];
  /** 食譜中「無法從名稱確認成分」的食材，提醒使用者確認標示 */
  uncertainIngredients?: readonly string[];
}

export interface CoachDeps {
  /** 呼叫模型，回傳原始文字。失敗請丟錯誤。 */
  generate: (prompt: string) => Promise<string>;
  hasModel: () => boolean;
  /** 選填：每次呼叫模型後回報結果（評估用；raw 為 null 表示呼叫本身失敗） */
  onAttempt?: (attempt: CoachAttempt) => void;
}

export interface CoachAttempt {
  raw: string | null;
  formatOk: boolean;
  violations: ViolationCode[];
}

export type CoachSource = "emergency" | "injury" | "triage" | "model" | "fallback";

export interface CoachResult {
  turn: CoachTurn;
  source: CoachSource;
  /** 呼叫模型的次數（0 表示沒有呼叫） */
  attempts: number;
  /** source=fallback 時，最後一次嘗試被拒絕的原因（沒有使用者內容，可安全記錄） */
  rejectedFor: string[];
}

const MAX_ATTEMPTS = 2;
const FALLBACK_PLAYBOOK_LINES = 4;
const MAX_ACTIONS = 5;

const FALLBACK_NOTE: Record<Locale, string> = {
  en: "I couldn't prepare a tailored answer right now, so this is general guidance from the recipe for this step.",
  zh: "我現在沒辦法針對你的狀況客製回答，以下是這一步的一般性指引。",
};

const CHECK_LABELS_NOTE: Record<Locale, string> = {
  en: "Please check the ingredient labels against your dietary restrictions.",
  zh: "請對照你的飲食限制，確認食材的成分標示。",
};

/** 起火或受傷：回固定的處置（呼叫端必須在其他任何處理之前先檢查） */
export function urgentTurn(
  question: string,
  stepNumber: number,
  locale: Locale,
): { turn: CoachTurn; source: "emergency" | "injury" } | null {
  if (detectEmergency(question)) {
    return { turn: emergencyTurn(stepNumber, locale), source: "emergency" };
  }
  if (detectInjury(question)) {
    return { turn: injuryTurn(stepNumber, locale), source: "injury" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SCHEMA = `{
  "kind": "clarify" | "advise",
  "step_ref": <number, the step the user is on>,
  "known": [<short strings: what you know from the recipe or from what the user said>],
  "unknown": [<short strings: what you would need to know but were not told; never guess these>],
  "clarifying_question": <string for kind "clarify", otherwise null>,
  "actions": [{"instruction": <one concrete thing to do>, "look_for": <what the user can see, hear or smell when it worked>, "heat": <optional>, "minutes": <optional number>}],
  "safety_note": <string or null>,
  "uncertainty_note": <string or null: say plainly what you cannot be sure about>
}`;

function recipeBlock(recipe: Recipe): string {
  return [
    `Recipe: ${recipe.recipe_name}`,
    `Ingredients: ${recipe.ingredients.map((i) => `${i.name} ${i.amount}`.trim()).join(", ")}`,
    `Finished dish: ${recipe.finished_dish_standard}`,
    "Steps:",
    ...recipe.steps.map(
      (s, i) =>
        `  ${i + 1}. ${s.action}${s.heat ? ` (${s.heat})` : ""}${s.minutes ? `, about ${s.minutes} min` : ""} — how to tell it's right: ${s.doneness_cue || "not specified"}`,
    ),
  ].join("\n");
}

function historyBlock(history: readonly CoachHistoryItem[]): string[] {
  if (history.length === 0) return [];
  return [
    "Conversation on this step so far:",
    ...history.map((h) => `${h.role === "user" ? "User" : "Coach"}: ${h.text}`),
    "",
  ];
}

function restrictionBlock(input: CoachInput): string[] {
  if (input.restrictions.length === 0) return [];
  return [
    `The user avoids these foods (hard rule, overrides everything else): ${input.restrictions.join(", ")}.`,
    "Never mention, suggest or add such a food or a substitute that contains it. Never say any ingredient is safe for them; if it matters, tell them to check the package label.",
    ...(input.uncertainIngredients && input.uncertainIngredients.length > 0
      ? [
          `These recipe ingredients may contain something they avoid and cannot be confirmed from the name: ${input.uncertainIngredients.join(", ")}. Remind them to check the label if it is relevant.`,
        ]
      : []),
    "",
  ];
}

/** 知識卡的內容中，不含使用者要避開的食物的那些行 */
function allowedPlaybook(
  found: TriageResult | null,
  locale: Locale,
  restrictions: readonly string[],
): string[] {
  if (!found) return [];
  return found.card.playbook[locale].filter(
    (line) => findRestrictedTermsInText(line, restrictions).length === 0,
  );
}

export function buildCoachPrompt(
  input: CoachInput,
  options: {
    found: TriageResult | null;
    clarifyAllowed: boolean;
    donenessClasses: readonly DonenessClass[];
    feedback: string;
  },
): string {
  const stepNumber = input.stepIndex + 1;
  const step = input.recipe.steps[input.stepIndex];
  // 提示詞用英文寫規則，知識卡也用英文（回答語言另外指定）
  const playbook = allowedPlaybook(options.found, "en", input.restrictions);

  return [
    "You are a patient cooking coach helping a beginner who is cooking right now.",
    `Return ONLY one JSON object, with no markdown and no extra text, in exactly this shape:\n${SCHEMA}`,
    "",
    "Rules:",
    "- You cannot see the user's pan or food. Never say you can see anything. Use only what the user told you and what the recipe says. List what you would need to know but were not told in \"unknown\" and do not guess it.",
    options.clarifyAllowed
      ? '- Use kind "clarify" only if one missing fact would change your advice. Ask exactly one question and give no actions. Otherwise use kind "advise".'
      : '- You have already asked a clarifying question on this step. Do not ask another one: use kind "advise", give your best advice now, and say in uncertainty_note what you could not confirm.',
    '- For kind "advise": give 1 to 5 concrete actions in order, each a single thing to do. At least one action needs look_for (what the user can see, hear or smell when it worked). Add heat or minutes only when you are confident.',
    `- Stay on the current step. The user is on step ${stepNumber} of ${input.recipe.steps.length}; set step_ref to ${stepNumber}, and never tell them to skip ahead to a later step.`,
    "- Never promise that food is or will be safe, fine or done. Give the check (a temperature, or a texture or color change) and let the user verify it themselves.",
    "- Use only the recipe and the reference notes below. If they do not cover the question, say so in uncertainty_note and give a conservative, general suggestion. Do not invent ingredients (plain cooking oil is fine).",
    input.locale === "en"
      ? "- Write every user-facing string in English."
      : "- Write every user-facing string in Traditional Chinese (繁體中文).",
    "",
    ...restrictionBlock(input),
    ...(options.donenessClasses.length > 0
      ? [
          "The user is asking about doneness or whether the food is safe to eat. Do not rely on color alone. Use these reliable checks:",
          ...options.donenessClasses.map((c) => `- ${c.guidance.en}`),
          "",
        ]
      : []),
    ...(playbook.length > 0
      ? [
          "Reference notes for this kind of problem (use only these for fixes; do not invent other remedies):",
          ...playbook.map((l) => `- ${l}`),
          "",
        ]
      : []),
    recipeBlock(input.recipe),
    "",
    `The user is on step ${stepNumber} of ${input.recipe.steps.length}: ${step.action} — how to tell it's right: ${step.doneness_cue || "not specified"}`,
    "",
    ...historyBlock(input.history),
    `The user's new message: ${input.question}`,
    ...(options.feedback
      ? ["", "Your previous reply was rejected. Fix these problems and return the corrected JSON only:", options.feedback]
      : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 備援
// ---------------------------------------------------------------------------

function fallbackTurn(
  input: CoachInput,
  found: TriageResult | null,
  donenessClasses: readonly DonenessClass[],
): CoachTurn {
  const step = input.recipe.steps[input.stepIndex];
  const stepNumber = input.stepIndex + 1;
  const lookFor = step.doneness_cue || undefined;

  const playbookActions: CoachAction[] = allowedPlaybook(found, input.locale, input.restrictions)
    .slice(0, FALLBACK_PLAYBOOK_LINES)
    .map((instruction, i) => ({ instruction, look_for: i === 0 ? lookFor : undefined }));

  const donenessActions: CoachAction[] = donenessClasses.map((c) => ({
    instruction: c.guidance[input.locale],
  }));

  const actions: CoachAction[] = [...playbookActions, ...donenessActions].slice(0, MAX_ACTIONS);
  if (actions.length === 0) {
    actions.push({
      instruction: step.action,
      heat: step.heat,
      minutes: step.minutes,
      look_for: lookFor,
    });
  }

  return {
    kind: "advise",
    step_ref: stepNumber,
    known: [
      input.locale === "en"
        ? `You're on step ${stepNumber}: ${step.action}`
        : `你正在第 ${stepNumber} 步：${step.action}`,
    ],
    unknown: [],
    clarifying_question: null,
    actions,
    safety_note: input.restrictions.length > 0 ? CHECK_LABELS_NOTE[input.locale] : null,
    uncertainty_note: FALLBACK_NOTE[input.locale],
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function parseModelOutput(raw: string): ParseResult {
  try {
    return parseCoachTurn(extractJsonObject(raw));
  } catch {
    return { ok: false, errors: ["the output was not a valid JSON object"] };
  }
}

export async function runCoach(input: CoachInput, deps: CoachDeps): Promise<CoachResult> {
  const stepNumber = input.stepIndex + 1;
  const step = input.recipe.steps[input.stepIndex];

  const urgent = urgentTurn(input.question, stepNumber, input.locale);
  if (urgent) return { ...urgent, attempts: 0, rejectedFor: [] };

  const found = triage(input.question, input.history);
  const clarifyAllowed = !hasAskedToClarify(input.history);

  if (found?.missingFact && clarifyAllowed) {
    return {
      turn: clarifyTurn(found, stepNumber, input.locale, step.action),
      source: "triage",
      attempts: 0,
      rejectedFor: [],
    };
  }

  const donenessClasses = isDonenessQuestion(input.question)
    ? relevantDonenessClasses(input.recipe)
    : [];

  if (!deps.hasModel()) {
    return {
      turn: fallbackTurn(input, found, donenessClasses),
      source: "fallback",
      attempts: 0,
      rejectedFor: ["no model available"],
    };
  }

  const guard: GuardContext = {
    stepNumber,
    restrictions: input.restrictions,
    mustClarify: false,
    clarifyAllowed,
    donenessMarkers: donenessClasses.map((c) => c.markers),
  };

  let feedback = "";
  let rejectedFor: ViolationCode[] | string[] = [];
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const prompt = buildCoachPrompt(input, { found, clarifyAllowed, donenessClasses, feedback });

    let raw: string;
    try {
      raw = await deps.generate(prompt);
    } catch (err) {
      // 只記錯誤本身；使用者的問題與歷史不寫進 log
      console.error("[coach] model call failed", err instanceof Error ? err.message : err);
      deps.onAttempt?.({ raw: null, formatOk: false, violations: [] });
      feedback = "The previous attempt failed. Return the JSON object described above.";
      rejectedFor = ["model call failed"];
      continue;
    }

    const parsed = parseModelOutput(raw);
    if (!parsed.ok) {
      deps.onAttempt?.({ raw, formatOk: false, violations: [] });
      feedback = parsed.errors.map((e) => `- ${e}`).join("\n");
      rejectedFor = ["invalid format"];
      continue;
    }

    const violations = checkCoachTurn(parsed.turn, guard);
    deps.onAttempt?.({ raw, formatOk: true, violations: violations.map((v) => v.code) });
    if (violations.length === 0) {
      return { turn: parsed.turn, source: "model", attempts, rejectedFor: [] };
    }
    feedback = describeViolations(violations);
    rejectedFor = violations.map((v) => v.code);
  }

  console.error("[coach] using fallback after rejected attempts", { rejectedFor });
  return {
    turn: fallbackTurn(input, found, donenessClasses),
    source: "fallback",
    attempts,
    rejectedFor: [...rejectedFor],
  };
}
