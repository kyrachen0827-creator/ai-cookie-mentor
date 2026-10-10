import "server-only";

/**
 * AI agent ③：評審
 *
 * 對應 docs/spec/agents/judge-agent.md（product-spec MVP 第 5 項）。
 * 職責獨立；只透過料理脈絡（選定 Recipe 的成品標準、完整版的過程紀錄）互通。
 *
 * 用 Gemini Vision 讀成品照，對照 finished_dish_standard 評三項分數（各 1–5）＋依據，
 * 給一個做得好的點與一個可操作的改進點。不評判味道、熟度、食安。
 * 太暗/太糊/非料理 → 請重拍不給分。以 temperature 0 逼近「同一張照片結果一致」。
 */
import type { Recipe, SessionLogEntry } from "@/lib/data/types";
import { generateText, hasGeminiKey } from "@/lib/ai/gemini";

export interface JudgeInput {
  recipe: Recipe;
  sessionLog?: SessionLogEntry[];
  image: { mimeType: string; dataBase64: string };
  /** 輸出語系（比賽要求英文為主，預設 en） */
  locale?: "en" | "zh";
}

export interface JudgeScoreResult {
  color_score: number;
  color_evidence: string;
  plating_score: number;
  plating_evidence: string;
  doneness_score: number;
  doneness_evidence: string;
  total_score: number;
  strength_comment: string;
  improvement_comment: string;
}

export type JudgeVerdict =
  | { ok: true; result: JudgeScoreResult }
  | { ok: false; retake: true; message: string };

interface RawJudge {
  recognizable?: boolean;
  reason?: string;
  color_score?: number;
  color_evidence?: string;
  plating_score?: number;
  plating_evidence?: string;
  doneness_score?: number;
  doneness_evidence?: string;
  strength_comment?: string;
  improvement_comment?: string;
}

function buildPrompt(input: JudgeInput, feedback: string): string {
  const { recipe, sessionLog } = input;
  const logContext =
    sessionLog && sessionLog.length > 0
      ? `\n料理過程紀錄（可作為評分脈絡，例如老師提醒過的狀況）：\n${sessionLog
          .map((l) => `- ${l.source}：${l.content}`)
          .join("\n")}`
      : "";

  const en = input.locale === "en";
  return [
    "你是料理評審，對照這道菜的「成品標準」評分照片中的成品。語氣鼓勵但客觀，不因鼓勵而灌分。",
    `料理：${recipe.recipe_name}`,
    `成品標準（評分對照基準）：${recipe.finished_dish_standard}`,
    logContext,
    en ? "IMPORTANT: Write all evidence text and comments in English." : "",
    "",
    "評三個維度，每項 1–5 分，並附「照片中看到什麼」的依據：",
    "- 色彩搭配：食材顏色是否鮮明、搭配是否和諧、有無過度烹煮變色。",
    "- 擺盤與造型：盤中佈局、高度層次、餐具是否襯托。",
    "- 烹調完成度（欄位 doneness_score）：只看表面外觀——梅納反應（金黃／微焦／有無焦黑）、醬汁是否多餘滴落或雜亂。",
    "  這一項不是熟度：不要判斷內部有沒有熟透、能不能安全食用，依據裡也不要寫「熟了／沒熟／可以安全吃」。",
    "維度不適用時（例如涼拌沒有梅納反應）改以成品標準判斷。",
    "",
    "規則：",
    "- 只依照片可見的外觀評分；味道、內部熟度、食安從照片看不出來，不要評也不要猜。",
    "- 給一個具體『做得好的點』與一個具體、可操作的『下次改進點』；不要列一串缺點。",
    "- 若照片不是料理、太暗或太糊而無法評分，回傳 {\"recognizable\": false, \"reason\": \"原因\"}。",
    "",
    "只輸出 JSON，不要多餘文字：",
    `{
  "recognizable": true,
  "color_score": 1-5,
  "color_evidence": "照片中看到什麼",
  "plating_score": 1-5,
  "plating_evidence": "照片中看到什麼",
  "doneness_score": 1-5,
  "doneness_evidence": "照片中看到什麼",
  "strength_comment": "一個具體做得好的點",
  "improvement_comment": "一個具體可操作的改進點"
}`,,
    feedback ? `\nYour previous reply could not be used: ${feedback}. Return only the JSON object described above.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 格式錯誤（不是 JSON、分數缺漏）時，帶著原因重試一次 */
const MAX_ATTEMPTS = 2;

type ParsedJudge =
  | { kind: "ok"; result: JudgeScoreResult }
  | { kind: "retake"; reason: string | undefined }
  | { kind: "invalid"; problem: string };

export async function scoreDish(input: JudgeInput): Promise<JudgeVerdict> {
  const en = input.locale === "en";
  if (!hasGeminiKey()) {
    return {
      ok: false,
      retake: true,
      message: en
        ? "(No AI key configured yet, so the judge can't score right now.)"
        : "（目前未設定 AI 金鑰，評審暫時無法評分。）",
    };
  }

  let feedback = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await generateText(buildPrompt(input, feedback), [input.image], {
      temperature: 0,
      json: true,
    });
    const parsed = parseJudge(raw, en);
    if (parsed.kind === "ok") return { ok: true, result: parsed.result };
    if (parsed.kind === "retake") {
      return {
        ok: false,
        retake: true,
        message:
          parsed.reason?.trim() ||
          (en
            ? "Hard to make out the dish — try better lighting with the whole plate in frame."
            : "照片看不太清楚，光線充足、整盤入鏡再拍一張吧。"),
      };
    }
    console.error("[judge] unusable model output", { attempt, problem: parsed.problem });
    feedback = parsed.problem;
  }

  // 兩次都格式錯誤：是模型的問題不是照片的問題，請使用者再試一次（同一張照片也可以）
  return {
    ok: false,
    retake: true,
    message: en
      ? "The judge couldn't produce a score this time. Please try again — the same photo is fine."
      : "評審這次沒能給出分數，請再試一次（用同一張照片也可以）。",
  };
}

function parseJudge(raw: string, en: boolean): ParsedJudge {
  let parsed: RawJudge;
  try {
    parsed = extractJson(raw);
  } catch {
    return { kind: "invalid", problem: "it was not a valid JSON object" };
  }

  if (parsed.recognizable === false) return { kind: "retake", reason: parsed.reason };

  const color = clampScore(parsed.color_score);
  const plating = clampScore(parsed.plating_score);
  const doneness = clampScore(parsed.doneness_score);
  if (color === null || plating === null || doneness === null) {
    const missing = [
      ["color_score", color],
      ["plating_score", plating],
      ["doneness_score", doneness],
    ]
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    return { kind: "invalid", problem: `${missing.join(", ")} must be an integer from 1 to 5` };
  }

  return {
    kind: "ok",
    result: {
      color_score: color,
      color_evidence: parsed.color_evidence?.trim() || "",
      plating_score: plating,
      plating_evidence: parsed.plating_evidence?.trim() || "",
      doneness_score: doneness,
      doneness_evidence: parsed.doneness_evidence?.trim() || "",
      total_score: color + plating + doneness,
      strength_comment:
        parsed.strength_comment?.trim() ||
        (en ? "Finishing a dish is a great start!" : "完成一道菜就是很棒的開始！"),
      improvement_comment:
        parsed.improvement_comment?.trim() ||
        (en ? "Try a clearer shot next time to show more detail." : "下次可以拍清楚一點，方便看細節。"),
    },
  };
}

function clampScore(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 5) return null;
  return n;
}

function extractJson(raw: string): RawJudge {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("評審回傳格式無法解析");
  }
  const value: unknown = JSON.parse(s.slice(start, end + 1));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("評審回傳的不是 JSON 物件");
  }
  return value as RawJudge;
}
