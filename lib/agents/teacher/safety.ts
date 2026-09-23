/**
 * 料理老師 A —— 安全提醒（規則判斷）
 *
 * 對應 docs/spec/agents/cooking-teacher-agent.md「A. 安全提醒」：
 * 燙傷、油爆、生肉處理等，在相關步驟前主動提醒。
 *
 * 以關鍵字掃描步驟文字產生提醒，屬技術實作（非新增資料欄位）。
 * 純函式、無外部相依，前端可直接使用。
 */
import type { RecipeStep } from "@/lib/data/types";

interface SafetyRule {
  keywords: string[];
  hint: string;
}

const RULES: SafetyRule[] = [
  {
    keywords: ["熱油", "下油", "爆香", "油炸", "炸", "煎"],
    hint: "熱油會噴濺：食材下鍋前擦乾水分，從鍋邊輕輕滑入，手不要懸在鍋正上方。",
  },
  {
    keywords: ["氣炸"],
    hint: "氣炸鍋內部與拉籃很燙，取出時用隔熱手套，先靜置一下再翻動。",
  },
  {
    keywords: ["烤箱", "焗", "°C", "度"],
    hint: "烤箱與烤盤高溫：開門先退半步讓熱氣散開，取盤務必戴隔熱手套。",
  },
  {
    keywords: ["生", "雞", "豬", "牛", "肉", "海鮮", "魚", "蝦"],
    hint: "處理生肉/生鮮後立刻洗手，砧板與刀具和其他食材分開，避免交叉污染。",
  },
  {
    keywords: ["煮滾", "滾", "熱水", "蒸", "湯"],
    hint: "熱湯與蒸氣會燙傷：掀蓋時開口朝外，臉不要靠太近。",
  },
  {
    keywords: ["切", "刀"],
    hint: "用刀時手指內收成貓爪、扶穩食材，刀刃遠離指尖。",
  },
];

/** 取得單一步驟的安全提醒（可能多則，已去重） */
export function getSafetyHints(step: RecipeStep): string[] {
  const text = `${step.action} ${step.heat ?? ""} ${step.doneness_cue}`;
  const hints = new Set<string>();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k))) hints.add(rule.hint);
  }
  return [...hints];
}
