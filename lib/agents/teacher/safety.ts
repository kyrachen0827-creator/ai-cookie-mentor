/**
 * 料理老師 A —— 安全提醒（規則判斷）
 *
 * 對應 docs/spec/agents/cooking-teacher-agent.md「A. 安全提醒」：
 * 燙傷、油爆、生肉處理等，在相關步驟前主動提醒。
 *
 * 以關鍵字掃描步驟文字產生提醒，屬技術實作（非新增資料欄位）。
 * 純函式、無外部相依，前端可直接使用。
 * 語系（2026/09/28）：食譜內容可能是英文（AI Builder Cup 要求），關鍵字與提醒文字皆需雙語，
 * 否則英文食譜會完全掃不到任何安全提醒。
 */
import type { RecipeStep } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n/LocaleContext";

interface SafetyRule {
  keywords: string[];
  hint: { en: string; zh: string };
}

const RULES: SafetyRule[] = [
  {
    keywords: ["熱油", "下油", "爆香", "油炸", "煎", "hot oil", "fry", "sear", "sauté", "saute"],
    hint: {
      zh: "熱油會噴濺：食材下鍋前擦乾水分，從鍋邊輕輕滑入，手不要懸在鍋正上方。",
      en: "Hot oil can spatter: pat ingredients dry before adding, slide them in gently from the pan's edge, and keep your hand away from directly above the pan.",
    },
  },
  {
    keywords: ["氣炸", "air fry", "air-fry"],
    hint: {
      zh: "氣炸鍋內部與拉籃很燙，取出時用隔熱手套，先靜置一下再翻動。",
      en: "The air fryer basket and interior get very hot — use oven mitts when removing it, and let it rest a moment before touching the food.",
    },
  },
  {
    keywords: ["烤箱", "焗烤", "焗", "預熱", "oven", "bake", "broil", "preheat"],
    hint: {
      zh: "烤箱與烤盤高溫：開門先退半步讓熱氣散開，取盤務必戴隔熱手套。",
      en: "The oven and baking dish are very hot: step back a little when opening the door to let heat escape, and always use oven mitts to take the dish out.",
    },
  },
  {
    keywords: [
      "生肉",
      "生魚",
      "雞肉",
      "雞胸",
      "雞腿",
      "豬",
      "牛肉",
      "絞肉",
      "海鮮",
      "蝦",
      "魚片",
      "raw meat",
      "raw fish",
      "chicken",
      "pork",
      "beef",
      "ground meat",
      "seafood",
      "shrimp",
      "fish fillet",
    ],
    hint: {
      zh: "處理生肉/生鮮後立刻洗手，砧板與刀具和其他食材分開，避免交叉污染。",
      en: "Wash your hands right after handling raw meat or seafood, and keep its cutting board and knife separate from other ingredients to avoid cross-contamination.",
    },
  },
  {
    keywords: ["煮滾", "滾", "熱水", "蒸", "沸", "boil", "boiling", "steam", "simmer"],
    hint: {
      zh: "熱湯與蒸氣會燙傷：掀蓋時開口朝外，臉不要靠太近。",
      en: "Hot soup and steam can burn you: lift the lid with the opening facing away from you, and keep your face at a distance.",
    },
  },
  {
    keywords: ["切", "刀", "cut", "chop", "slice", "dice", "knife"],
    hint: {
      zh: "用刀時手指內收成貓爪、扶穩食材，刀刃遠離指尖。",
      en: "When cutting, curl your fingers into a claw grip to hold the food steady, keeping the blade away from your fingertips.",
    },
  },
];

/** 取得單一步驟的安全提醒（可能多則，已去重），依語系回傳對應文字 */
export function getSafetyHints(step: RecipeStep, locale: Locale = "zh"): string[] {
  const text = `${step.action} ${step.heat ?? ""} ${step.doneness_cue}`.toLowerCase();
  const hints = new Set<string>();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
      hints.add(rule.hint[locale]);
    }
  }
  return [...hints];
}
