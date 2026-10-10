"use client";

/**
 * 顯示 Cooking Coach 的結構化回合：
 * 澄清問題（可點選回答）、編號的行動、每個行動的「怎麼看出做對了」、小心提醒，
 * 以及教練坦白說「不確定」的地方。純顯示，不含任何判斷邏輯。
 */
import type { CoachTurn } from "@/lib/agents/teacher/coach-types";
import { useLocale } from "@/lib/i18n/LocaleContext";

export default function CoachReply({
  turn,
  source,
  onPick,
}: {
  turn: CoachTurn;
  source?: string;
  /** 點選建議回答時呼叫；沒給就不顯示按鈕（例如舊的對話） */
  onPick?: (answer: string) => void;
}) {
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const urgentLabel =
    source === "emergency"
      ? t("Emergency steps", "緊急處置")
      : source === "injury"
        ? t("First aid", "急救")
        : null;

  return (
    <div className="flex flex-col gap-2">
      {urgentLabel && <p className="font-semibold text-accent">🚨 {urgentLabel}</p>}

      {turn.kind === "clarify" && turn.clarifying_question && (
        <p className="font-semibold text-ink">{turn.clarifying_question}</p>
      )}

      {turn.suggested_answers && turn.suggested_answers.length > 0 && onPick && (
        <div className="flex flex-wrap gap-2">
          {turn.suggested_answers.map((answer) => (
            <button
              key={answer}
              type="button"
              onClick={() => onPick(answer)}
              className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-dark ring-1 ring-primary/30 transition hover:bg-primary/20"
            >
              {answer}
            </button>
          ))}
        </div>
      )}

      {turn.actions.length > 0 && (
        <ol className="flex flex-col gap-2">
          {turn.actions.map((action, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-xl bg-cream p-2 ring-1 ring-brand-border"
            >
              <span className="font-bold text-primary">{i + 1}</span>
              <div className="flex-1">
                <p className="text-ink">{action.instruction}</p>
                {(action.heat || action.minutes !== undefined) && (
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-soft">
                    {action.heat && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary-dark">
                        🔥 {action.heat}
                      </span>
                    )}
                    {action.minutes !== undefined && (
                      <span className="rounded-full bg-surface px-2 py-0.5 ring-1 ring-brand-border">
                        ⏱ {t(`~${action.minutes} min`, `約 ${action.minutes} 分`)}
                      </span>
                    )}
                  </p>
                )}
                {action.look_for && (
                  <p className="mt-1 rounded-lg bg-herb/10 px-2 py-1 text-herb">
                    <span className="font-semibold">{t("Look for: ", "留意：")}</span>
                    {action.look_for}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {turn.safety_note && (
        <p className="flex gap-1.5 rounded-xl bg-accent/10 p-2 text-ink">
          <span className="text-accent">⚠️</span>
          <span>{turn.safety_note}</span>
        </p>
      )}

      {turn.kind === "advise" && turn.unknown.length > 0 && (
        <p className="text-xs text-ink-soft">
          {t("Not sure about: ", "不確定的地方：")}
          {turn.unknown.join(t("; ", "；"))}
        </p>
      )}

      {turn.uncertainty_note && (
        <p className="text-xs italic text-ink-soft">{turn.uncertainty_note}</p>
      )}
    </div>
  );
}
