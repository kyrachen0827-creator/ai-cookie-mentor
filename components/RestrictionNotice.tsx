"use client";

/**
 * 備料確認頁的過敏／飲食限制提醒。
 *
 * - 明確衝突：食譜含有使用者設定要避開的食材，建議換一道菜（老師端此時也不會陪做）
 * - 無法確認：醬油、高湯這類複合食材，從名稱看不出成分，請使用者自己看包裝成分標示
 *
 * 文字刻意不使用「安全」「沒問題」這類保證性說法。
 */
import type { RestrictionFinding } from "@/lib/safety/allergens";
import { useLocale } from "@/lib/i18n/LocaleContext";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function labelOf(f: RestrictionFinding, isEn: boolean): string {
  if (f.source === "ingredient") return f.item;
  return isEn ? `step ${f.index + 1}` : `第 ${f.index + 1} 步`;
}

export default function RestrictionNotice({
  findings,
}: {
  findings: readonly RestrictionFinding[];
}) {
  const { locale } = useLocale();
  const isEn = locale === "en";
  const sep = isEn ? ", " : "、";

  const conflicts = findings.filter((f) => f.severity === "conflict");
  const uncertain = findings.filter((f) => f.severity === "uncertain");
  if (conflicts.length === 0 && uncertain.length === 0) return null;

  // 食材已點名就不再列步驟，避免同一個食材重複出現
  const conflictIngredients = conflicts.filter((f) => f.source === "ingredient");
  const conflictShown = conflictIngredients.length > 0 ? conflictIngredients : conflicts;

  return (
    <div className="mb-6 flex flex-col gap-3" role="note">
      {conflicts.length > 0 && (
        <div className="rounded-xl bg-accent/10 p-3 text-sm text-ink">
          <p className="flex gap-1.5">
            <span className="text-accent">⚠️</span>
            <span>
              {isEn
                ? `This recipe includes ${unique(conflictShown.map((f) => labelOf(f, true))).join(sep)}, which conflicts with your restriction (${unique(conflicts.map((f) => f.restriction)).join(sep)}). The teacher won't guide you through it — please pick a different dish.`
                : `這份食譜含有 ${unique(conflictShown.map((f) => labelOf(f, false))).join(sep)}，與你設定的限制（${unique(conflicts.map((f) => f.restriction)).join(sep)}）衝突，老師不會陪你做這道，請換一道菜。`}
            </span>
          </p>
          <a href="/" className="mt-2 inline-block font-semibold text-primary underline">
            {isEn ? "Pick a different dish" : "換一道菜"}
          </a>
        </div>
      )}
      {uncertain.length > 0 && (
        <div className="rounded-xl bg-accent/10 p-3 text-sm text-ink">
          <p className="flex gap-1.5">
            <span className="text-accent">⚠️</span>
            <span>
              {isEn
                ? `Please check the ingredient labels for ${unique(uncertain.map((f) => labelOf(f, true))).join(sep)}. From the name alone we can't tell whether they contain ${unique(uncertain.map((f) => f.restriction)).join(sep)}.`
                : `請先看一下 ${unique(uncertain.map((f) => labelOf(f, false))).join(sep)} 的包裝成分標示。光看名稱，我們無法確認是否含有 ${unique(uncertain.map((f) => f.restriction)).join(sep)}。`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
