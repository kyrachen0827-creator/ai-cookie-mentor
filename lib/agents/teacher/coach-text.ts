/**
 * 把 CoachTurn 轉成一段可讀的純文字。
 * 用在：回應的 `answer` 欄位（舊版前端與測試只認這個）、過程紀錄 session_log。
 * 新版前端直接顯示結構化的 CoachTurn。
 */
import type { CoachTurn } from "./coach-types";

type Locale = "en" | "zh";

const LABELS = {
  en: { look: "Look for", careful: "Careful", unsure: "Not sure about", minutes: "min" },
  zh: { look: "留意", careful: "小心", unsure: "不確定的地方", minutes: "分鐘" },
} as const;

export function turnToText(turn: CoachTurn, locale: Locale): string {
  const L = LABELS[locale];
  const lines: string[] = [];

  if (turn.kind === "clarify" && turn.clarifying_question) {
    lines.push(turn.clarifying_question);
  }

  turn.actions.forEach((a, i) => {
    const meta = [a.heat, a.minutes !== undefined ? `~${a.minutes} ${L.minutes}` : undefined]
      .filter(Boolean)
      .join(", ");
    const look = a.look_for ? ` — ${L.look}: ${a.look_for}` : "";
    lines.push(`${i + 1}. ${a.instruction}${meta ? ` (${meta})` : ""}${look}`);
  });

  if (turn.safety_note) lines.push(`${L.careful}: ${turn.safety_note}`);
  if (turn.unknown.length > 0 && turn.kind === "advise") {
    lines.push(`${L.unsure}: ${turn.unknown.join("; ")}`);
  }
  if (turn.uncertainty_note) lines.push(turn.uncertainty_note);

  return lines.join("\n");
}
