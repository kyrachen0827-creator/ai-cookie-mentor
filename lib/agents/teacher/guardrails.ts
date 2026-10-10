/**
 * Coach 回合的確定性護欄：模型輸出通過格式驗證後，再檢查「內容是否合規」。
 *
 * 全是純函式、不呼叫模型，所以每條規則都能用固定案例測試。
 * 規則刻意只擋「明確違反」的情形，不把「每個回答都要有數字」之類的硬性格式強加到所有回答：
 * 資訊不足時，允許澄清、保守建議或說明不確定。
 */
import { findRestrictedTermsInText } from "@/lib/safety/allergens";
import { turnTexts, type CoachTurn } from "./coach-types";

export type ViolationCode =
  | "STEP_MISMATCH"
  | "SKIPS_AHEAD"
  | "CLARIFY_SHAPE"
  | "CLARIFY_NOT_ALLOWED"
  | "MUST_CLARIFY"
  | "ADVISE_SHAPE"
  | "CLAIMS_TO_SEE"
  | "RESTRICTED_FOOD"
  | "SAFETY_CLAIM"
  | "DONENESS_CHECK_MISSING";

export interface Violation {
  code: ViolationCode;
  /** 英文說明，會原樣放進重試 prompt 讓模型修正 */
  message: string;
}

export interface GuardContext {
  /** 使用者目前的步驟（1-based） */
  stepNumber: number;
  /** 使用者設定的過敏／飲食限制（原始文字） */
  restrictions: readonly string[];
  /** 程式判斷：關鍵資訊缺少且仍可詢問，這回合必須是澄清 */
  mustClarify: boolean;
  /** 這個步驟還沒問過澄清問題 */
  clarifyAllowed: boolean;
  /** 問題與熟度有關且食譜含相關食材時，回答必須含其中一種可靠檢查；空陣列表示不要求 */
  donenessMarkers: readonly RegExp[];
}

const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 步驟編號：阿拉伯數字，或一到九十九的中文數字（十二、二十三…） */
function parseStepNumber(token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const [tens, ones] = token.includes("十") ? token.split("十") : [undefined, token];
  const tensValue = token.includes("十") ? (tens ? (CN_DIGITS[tens] ?? 0) : 1) : 0;
  return tensValue * 10 + (ones ? (CN_DIGITS[ones] ?? 0) : 0);
}

const NUMBER_TOKEN = "(\\d+|[一二兩三四五六七八九十]+)";
const STEP_MENTIONS = [
  /step\s*(\d+)/gi,
  new RegExp(`第\\s*${NUMBER_TOKEN}\\s*步`, "g"),
  new RegExp(`步驟\\s*${NUMBER_TOKEN}`, "g"),
];

// 沒有照片輸入，所以任何「我看到」「從照片看」都是在假裝看見
const SEE_CLAIMS = [
  /\bI (?:can |could )?see\b/i,
  /\bI(?:'m| am) seeing\b/i,
  /\bit looks like (?:your|you)\b/i,
  /\b(?:looks|seems) like you(?:r|'re| are)?\b/i,
  /\bfrom (?:the |your )?(?:photo|picture|image|video)\b/i,
  /\bin (?:the |your )(?:photo|picture|image)\b/i,
  /我(?:可以|能)?看(?:到|見)/,
  /從(?:你的|這張)?(?:照片|圖片|影像)/,
  /看起來你的/,
];

// 對任何人都不保證食物「安全」：教練看不到食物，只能給檢查方式讓使用者自己確認。
// 「to be safe, check…」「heat to a safe temperature」是一般的食安建議，不在此列。
const SAFETY_PROMISES = [
  /\b(?:is|are|it's|that's|they're)\s+(?:perfectly\s+|totally\s+|completely\s+)?safe\b/i,
  /\b(?:will|'ll|would)\b[^.]{0,40}\bsafe\b/i,
  /保證安全|是安全的|會是安全的/,
];

// 對有過敏限制的人，更不能替任何食材下結論（只有包裝標示能確認）
const RESTRICTED_REASSURANCES = [/沒問題|可以放心|很安全/, /\bno problem for you\b/i];

function questionMarks(text: string): number {
  return (text.match(/[?？]/g) ?? []).length;
}

/** 同一句話裡、在位置 `index` 之前的文字（判斷前面有沒有否定或先後順序的字眼） */
function sentencePrefix(text: string, index: number): string {
  const before = text.slice(0, index);
  const boundary = Math.max(...[".", "!", "?", "。", "！", "？", "\n", ";", "；"].map((c) => before.lastIndexOf(c)));
  return before.slice(boundary + 1);
}

// 「別跳到第 4 步」是在拒絕跳步；「做完這步再進第 4 步」「until … before moving to step 4」是在說明順序。
// 但「First, skip ahead to step 5」「再直接跳到第 4 步」仍是叫使用者跳步：順序字眼之後若出現跳步的字眼就不算說明順序。
const NEGATED_SKIP =
  /\b(?:don't|do not|never|not yet|no need to)\s+(?:\w+\s+)?(?:skip|jump|go|move)\b|(?:先別|不要|別|不用)(?:直接)?(?:跳|進|做)/i;
const SEQUENCE_CUE = /\b(?:before|until|first)\b|之前|再/gi;
const SKIP_WORDS = /\b(?:skip|jump|straight|ahead)\b|跳|直接/i;
const SEQUENCING_AFTER = /^\s*(?:之前|以前)/;

/** 這次提到後面步驟，是不是在拒絕跳步或說明先後順序 */
function isSequencingMention(prefix: string, after: string): boolean {
  if (NEGATED_SKIP.test(prefix) || SEQUENCING_AFTER.test(after)) return true;
  const cues = [...prefix.matchAll(SEQUENCE_CUE)];
  const last = cues.at(-1);
  if (!last) return false;
  return !SKIP_WORDS.test(prefix.slice((last.index ?? 0) + last[0].length));
}

/** 回覆中「叫使用者去做」的後面步驟編號（排除拒絕跳步、說明先後順序的提及） */
function laterStepsUrged(texts: readonly string[], currentStep: number): number[] {
  return texts.flatMap((t) =>
    STEP_MENTIONS.flatMap((re) =>
      [...t.matchAll(re)]
        .filter((m) => {
          const index = m.index ?? 0;
          return !isSequencingMention(sentencePrefix(t, index), t.slice(index + m[0].length));
        })
        .map((m) => parseStepNumber(m[1]))
        .filter((n) => n > currentStep),
    ),
  );
}

// 「peanut-free」「不含花生」「對花生過敏」是在提醒避開，不是建議使用者吃；檢查受限食材前先拿掉。
// 拿掉的範圍刻意很窄（否定詞後一個詞；中文最多 4 個字且不含「加、撒、吃」等動作），
// 否則「避免口感單調可加花生碎」會連建議一起被拿掉。
const ZH_NOUN = "[^\\s，。、,.;；!！?？加撒放拌用吃可會也了]{1,4}";
const NEGATED_MENTIONS = [
  /\b(?:avoid(?:s|ing)?|without|no|allergic to|allergy to|free (?:of|from)|(?:do|does|did)(?:n't| not) contain(?: or process)?|not contain)\s+(?:any\s+)?[\w-]+/gi,
  /\b[\w-]+[- ]free\b/gi,
  /\bnon-[\w-]+/gi,
  /\b[\w-]+\s+allerg(?:y|ies)\b/gi,
  new RegExp(`(?:不含|避開|避免|不要加|不能吃|非)\\s*(?:任何)?(?:過敏原[（(])?${ZH_NOUN}`, "g"),
  new RegExp(`過敏原\\s*[：:（(]\\s*${ZH_NOUN}`, "g"),
  new RegExp(`${ZH_NOUN}過敏`, "g"),
];

function withoutNegatedMentions(text: string): string {
  return NEGATED_MENTIONS.reduce((t, re) => t.replace(re, " "), text);
}

// 「make sure they are safe」「確認是否安全」是請使用者自己確認，不是保證；
// 但「不用確認，這樣就安全」「Once you check the colour, it is safe」仍是保證
// 「verify they are」：verify 直接管到後面的「are safe」（中間最多三個詞、不跨逗號）才算
const VERIFY_CUE =
  /\b(?:ensure|make sure|making sure|makes sure|whether)\b|\b(?:check|verify|confirm)\s+(?:(?:that|whether|if)\s+)?(?:[\w-]+\s+){0,3}$|確認|確保|是否/i;
const NO_NEED = /\b(?:(?:don't|do not|no) need to|no need)\b|不用|不需要|不必/i;

/** 文字中是否有「保證安全」的說法（請使用者確認安全的句子不算） */
function promisesSafety(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) =>
    [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))].some(
      (m) => {
        const prefix = sentencePrefix(text, m.index ?? 0);
        return NO_NEED.test(prefix) || !VERIFY_CUE.test(prefix);
      },
    ),
  );
}

export function checkCoachTurn(turn: CoachTurn, ctx: GuardContext): Violation[] {
  const violations: Violation[] = [];
  const add = (code: ViolationCode, message: string) => violations.push({ code, message });
  const texts = turnTexts(turn);
  const allText = texts.join("\n");

  if (turn.step_ref !== ctx.stepNumber) {
    add("STEP_MISMATCH", `step_ref must be ${ctx.stepNumber}, the step the user is on.`);
  }

  // known／unknown 是在描述情況（例：「使用者想跳到第 4 步」），不是叫使用者去做，所以不檢查
  const directiveTexts = turnTexts({ ...turn, known: [], unknown: [] });
  if (laterStepsUrged(directiveTexts, ctx.stepNumber).length > 0) {
    add(
      "SKIPS_AHEAD",
      `Do not tell the user to jump to a later step. The user is on step ${ctx.stepNumber}; only refer to this step or earlier ones.`,
    );
  }

  if (turn.kind === "clarify") {
    const question = turn.clarifying_question ?? "";
    if (!question || questionMarks(question) !== 1) {
      add("CLARIFY_SHAPE", "A clarify turn must contain exactly one question in clarifying_question.");
    }
    if (turn.actions.length > 0) {
      add("CLARIFY_SHAPE", "A clarify turn must not contain actions; ask the question first.");
    }
    if (!ctx.clarifyAllowed) {
      add(
        "CLARIFY_NOT_ALLOWED",
        "You already asked a clarifying question on this step. Give your best advice now and state what you could not confirm in uncertainty_note.",
      );
    }
  } else {
    if (ctx.mustClarify) {
      add("MUST_CLARIFY", "A key fact is still unknown. Ask one clarifying question instead of advising.");
    }
    if (turn.actions.length === 0) {
      add("ADVISE_SHAPE", "An advise turn needs at least one action.");
    }
    if (turn.clarifying_question !== null) {
      add("ADVISE_SHAPE", "An advise turn must set clarifying_question to null.");
    }
    if (turn.actions.length > 0 && !turn.actions.some((a) => a.look_for)) {
      add("ADVISE_SHAPE", "At least one action needs look_for: how the user can tell it worked.");
    }
  }

  if (SEE_CLAIMS.some((re) => re.test(allText))) {
    add(
      "CLAIMS_TO_SEE",
      "You cannot see the pan or the food. Do not say you can see, or that it looks like the user's food; use what the user told you and say what is unknown.",
    );
  }

  const restrictedHits = findRestrictedTermsInText(withoutNegatedMentions(allText), ctx.restrictions);
  if (restrictedHits.length > 0) {
    add(
      "RESTRICTED_FOOD",
      `The user avoids: ${restrictedHits.join(", ")}. Do not mention or suggest any such food or a substitute containing it.`,
    );
  }

  if (promisesSafety(allText, SAFETY_PROMISES)) {
    add(
      "SAFETY_CLAIM",
      "Do not promise that food is or will be safe. You cannot see it: give the check (a temperature, or a texture or color change) and let the user verify it.",
    );
  } else if (
    ctx.restrictions.length > 0 &&
    promisesSafety(allText, RESTRICTED_REASSURANCES)
  ) {
    add(
      "SAFETY_CLAIM",
      "Do not call any ingredient safe or fine for this user; only the package label can confirm that. Tell them to check the label.",
    );
  }

  if (
    turn.kind === "advise" &&
    ctx.donenessMarkers.length > 0 &&
    !ctx.donenessMarkers.some((m) => m.test(allText))
  ) {
    add(
      "DONENESS_CHECK_MISSING",
      "The user asks about doneness. Give a reliable check from the provided doneness guidance (a temperature, or cutting it open / a texture change), not only how it looks.",
    );
  }

  return violations;
}

/** 把違規整理成給模型看的修正清單（空陣列回傳空字串） */
export function describeViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `- ${v.message}`).join("\n");
}
