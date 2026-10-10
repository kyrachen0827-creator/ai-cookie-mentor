/**
 * Cooking Coach 的回合格式與驗證。
 *
 * 模型不再回一段自由文字，而是回一個結構化的 CoachTurn；程式驗證格式、再交給護欄檢查內容。
 * 格式不合就視為失敗（由 coach.ts 重試或退回確定性備援），不會把半成品顯示給使用者。
 *
 * 純函式、無外部相依。這是 teacher agent 的內部結構，不是新的資料實體（不進 data-model）。
 */

export type CoachKind = "clarify" | "advise";

export interface CoachAction {
  /** 要做什麼（一個具體動作） */
  instruction: string;
  /** 怎麼看出做對了（外觀、聲音、氣味） */
  look_for?: string;
  heat?: string;
  minutes?: number;
}

export interface CoachTurn {
  kind: CoachKind;
  /** 這個回答針對的步驟（1-based），必須等於使用者目前的步驟 */
  step_ref: number;
  /** 已知：從食譜或使用者說的話得到的資訊 */
  known: string[];
  /** 未知：沒有被告知、因此沒有猜測的資訊 */
  unknown: string[];
  /** kind=clarify 時恰好一個問題，否則為 null */
  clarifying_question: string | null;
  actions: CoachAction[];
  safety_note: string | null;
  /** 資訊不足或無法確認時，坦白說明的限制 */
  uncertainty_note: string | null;
  /** 澄清問題的點選回答（只有確定性的澄清回合會有；模型的輸出不含這個欄位） */
  suggested_answers?: string[];
}

/** 同一步驟內的對話紀錄（由前端帶入，後端不保存） */
export interface CoachHistoryItem {
  role: "user" | "coach";
  text: string;
  /** coach 的回合類型；用來判斷是否已經問過澄清問題 */
  kind?: CoachKind;
}

export const COACH_LIMITS = {
  historyItems: 8,
  historyTextChars: 600,
  listItems: 6,
  listItemChars: 200,
  actions: 5,
  instructionChars: 300,
  lookForChars: 200,
  heatChars: 40,
  questionChars: 200,
  noteChars: 300,
  minutesMax: 1440,
} as const;

/**
 * 把同一步驟的對話裁到最多 `max` 筆，但保留最近一次澄清問題與它前後的使用者發言。
 * 只取最新幾筆的話，聊久了澄清那段會被擠掉，教練就會把同一個問題再問一次。
 * 前端送出前與後端驗證時都用這個函式，兩邊結果一致。
 */
export function trimHistory<T extends CoachHistoryItem>(
  items: readonly T[],
  max: number = COACH_LIMITS.historyItems,
): T[] {
  if (items.length <= max) return [...items];
  const clarifyAt = items.findLastIndex((h) => h.role === "coach" && h.kind === "clarify");
  if (clarifyAt < 0) return items.slice(-max);
  const pinned = new Set(
    [clarifyAt - 1, clarifyAt, clarifyAt + 1].filter(
      (i) => i === clarifyAt || items[i]?.role === "user",
    ),
  );
  const others = items.map((_, i) => i).filter((i) => !pinned.has(i));
  const rest = others.slice(Math.max(0, others.length - (max - pinned.size)));
  return [...pinned, ...rest].sort((a, b) => a - b).map((i) => items[i]);
}

export type ParseResult =
  | { ok: true; turn: CoachTurn }
  | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 從模型輸出取出 JSON 物件（容忍 ```json 圍欄與前後雜訊）。失敗時丟 Error。 */
export function extractJsonObject(raw: string): unknown {
  const s = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object in model output");
  }
  return JSON.parse(s.slice(start, end + 1));
}

function stringField(
  r: Rec,
  key: string,
  max: number,
  errors: string[],
): string | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") {
    errors.push(`${key} must be a string or null`);
    return null;
  }
  const s = v.trim();
  if (s.length > max) {
    errors.push(`${key} is longer than ${max} characters`);
    return null;
  }
  return s === "" ? null : s;
}

function stringList(r: Rec, key: string, errors: string[]): string[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.push(`${key} must be an array of strings`);
    return [];
  }
  if (v.length > COACH_LIMITS.listItems) {
    errors.push(`${key} has more than ${COACH_LIMITS.listItems} items`);
  }
  return v.slice(0, COACH_LIMITS.listItems).flatMap((item) => {
    if (typeof item !== "string") {
      errors.push(`${key} must contain only strings`);
      return [];
    }
    const s = item.trim();
    if (s.length > COACH_LIMITS.listItemChars) {
      errors.push(`${key} has an item longer than ${COACH_LIMITS.listItemChars} characters`);
      return [];
    }
    return s ? [s] : [];
  });
}

function parseAction(v: unknown, errors: string[]): CoachAction | null {
  if (!isRecord(v)) {
    errors.push(
      'each item in actions must be an object like {"instruction": "...", "look_for": "..."}, not a plain string',
    );
    return null;
  }
  const instruction = stringField(v, "instruction", COACH_LIMITS.instructionChars, errors);
  if (!instruction) {
    errors.push("each action needs a non-empty instruction");
    return null;
  }
  const minutes = v.minutes;
  let parsedMinutes: number | undefined;
  if (minutes !== undefined && minutes !== null) {
    if (typeof minutes !== "number" || !(minutes >= 0 && minutes <= COACH_LIMITS.minutesMax)) {
      errors.push("action minutes must be a number between 0 and 1440");
    } else {
      parsedMinutes = minutes;
    }
  }
  return {
    instruction,
    look_for: stringField(v, "look_for", COACH_LIMITS.lookForChars, errors) ?? undefined,
    heat: stringField(v, "heat", COACH_LIMITS.heatChars, errors) ?? undefined,
    minutes: parsedMinutes,
  };
}

/** 驗證模型輸出的形狀並重建成乾淨的 CoachTurn（未知欄位丟棄）。內容規則見 guardrails.ts。 */
export function parseCoachTurn(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, errors: ["output must be a JSON object"] };

  const errors: string[] = [];

  const kind = raw.kind;
  if (kind !== "clarify" && kind !== "advise") {
    errors.push("kind must be 'clarify' or 'advise'");
  }

  const stepRef = raw.step_ref;
  if (typeof stepRef !== "number" || !Number.isInteger(stepRef) || stepRef < 1) {
    errors.push("step_ref must be a positive integer");
  }

  const rawActions = raw.actions ?? [];
  let actions: CoachAction[] = [];
  if (!Array.isArray(rawActions)) {
    errors.push("actions must be an array");
  } else {
    if (rawActions.length > COACH_LIMITS.actions) {
      errors.push(`actions has more than ${COACH_LIMITS.actions} items`);
    }
    actions = rawActions
      .slice(0, COACH_LIMITS.actions)
      .map((a) => parseAction(a, errors))
      .filter((a): a is CoachAction => a !== null);
  }

  const turn = {
    kind: kind as CoachKind,
    step_ref: stepRef as number,
    known: stringList(raw, "known", errors),
    unknown: stringList(raw, "unknown", errors),
    clarifying_question: stringField(raw, "clarifying_question", COACH_LIMITS.questionChars, errors),
    actions,
    safety_note: stringField(raw, "safety_note", COACH_LIMITS.noteChars, errors),
    uncertainty_note: stringField(raw, "uncertainty_note", COACH_LIMITS.noteChars, errors),
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, turn };
}

/** 回合中所有會顯示給使用者的文字，供護欄一次掃描 */
export function turnTexts(turn: CoachTurn): string[] {
  return [
    ...turn.known,
    ...turn.unknown,
    turn.clarifying_question ?? "",
    ...turn.actions.flatMap((a) => [a.instruction, a.look_for ?? "", a.heat ?? ""]),
    turn.safety_note ?? "",
    turn.uncertainty_note ?? "",
  ].filter(Boolean);
}
