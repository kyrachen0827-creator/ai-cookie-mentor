/**
 * 料理問題分流：認出常見問題、決定「還缺哪個關鍵資訊」、產生確定性的澄清與緊急回合。
 *
 * 為什麼不全交給模型：
 * - 命中補救知識卡且缺關鍵資訊時，由程式直接產生那一個澄清問題，
 *   結果穩定、即時（不呼叫模型），也避免模型在資訊不足時直接亂猜。
 * - 起火這類緊急狀況用固定的標準處置，不能靠模型當下發揮。
 * 純函式、無外部相依。
 *
 * 知識卡只收高頻問題（黏鍋、燒焦、出水、太鹹），內容是一般家庭料理的保守做法，
 * 作為模型回答的依據，不是醫療或專業建議。
 */
import type { CoachHistoryItem, CoachTurn } from "./coach-types";

export type Locale = "en" | "zh";

export interface FactSpec {
  id: string;
  /** 使用者說過的話裡出現這些，就算已知 */
  answeredBy: RegExp;
  /** 缺這項時要問使用者的那一個問題 */
  question: Record<Locale, string>;
  /** 列在 unknown 欄位的描述 */
  unknownLabel: Record<Locale, string>;
  /** 點選就能回答的選項；每個都必須通過 answeredBy */
  options: Record<Locale, readonly string[]>;
}

export interface TriageCard {
  id: "sticking" | "burning" | "watery" | "salty";
  triggers: readonly RegExp[];
  facts: readonly FactSpec[];
  /** 等待使用者回答澄清問題時，先做的保守動作 */
  holding?: Record<Locale, string>;
  /** 給模型的依據（模型只能在這個範圍內補充，不能自創做法） */
  playbook: Record<Locale, readonly string[]>;
}

export interface TriageResult {
  card: TriageCard;
  /** 第一個仍未知的關鍵資訊；沒有則為 null（可以直接給建議） */
  missingFact: FactSpec | null;
}

const PAN_TYPE: FactSpec = {
  id: "pan_type",
  answeredBy:
    /non-?stick|teflon|ceramic|stainless|cast[- ]iron|carbon[- ]steel|\biron\b|不沾|不粘|鐵鍋|鑄鐵|不鏽鋼|不锈钢|陶瓷/i,
  question: {
    en: "Which kind of pan are you using — non-stick, stainless steel, or cast iron / carbon steel?",
    zh: "你用的是哪種鍋：不沾鍋、不鏽鋼鍋，還是鐵鍋／鑄鐵鍋？",
  },
  unknownLabel: {
    en: "The type of pan (the fix is different for non-stick and metal pans)",
    zh: "鍋子的種類（不沾鍋和金屬鍋的處理方式不同）",
  },
  options: {
    en: ["Non-stick", "Stainless steel", "Cast iron / carbon steel"],
    zh: ["不沾鍋", "不鏽鋼鍋", "鐵鍋／鑄鐵鍋"],
  },
};

export const TRIAGE_CARDS: readonly TriageCard[] = [
  {
    id: "sticking",
    // 刻意收緊：「I'm stuck」「stick to medium heat」「醬汁太黏」都不是黏鍋
    triggers: [
      /\b(?:stick|sticks|sticking|stuck)\s+(?:on|to|onto|at)\s+(?:the\s+|my\s+|a\s+)?(?:pan|skillet|wok|pot|bottom|surface)\b/i,
      /\b(?:pan|skillet|wok|pot)\b[^.?!]{0,25}\b(?:sticking|stuck)\b/i,
      /\b(?:egg|eggs|food|rice|meat|fish)\b[^.?!]{0,25}\b(?:stick|sticks|sticking|stuck)\b/i,
      /\bit(?:'s| is| keeps| got| gets| was)?\s+(?:still |really |all |totally |completely )?(?:stuck|sticking|sticks)\b/i,
      /(?:黏|沾|粘)(?:在)?(?:不沾|不鏽鋼|鐵|鑄鐵|陶瓷)?(?:鍋|底)/,
      /(?:蛋|飯|肉|魚|食物|菜).{0,3}(?:黏住|黏在|沾在|沾住|粘在|粘住)/,
    ],
    facts: [PAN_TYPE],
    holding: {
      en: "While you answer, turn the heat down to low so the egg doesn't burn.",
      zh: "在你回覆之前，先把火關小到小火，避免蛋燒焦。",
    },
    playbook: {
      en: [
        "Safety first: turn the heat down to low or lift the pan off the burner before scraping, and never leave a hot pan unattended.",
        "Non-stick pan: use a silicone or wooden spatula (no metal). Lower to medium-low and add about 1 tsp of oil around the edge. Slide the spatula gently under the egg once its edges have set.",
        "Stainless steel or cast iron / carbon steel pan: the pan was probably not hot enough when the oil went in, or there was too little oil. Take it off the heat for 20–30 seconds, add about 1 tsp of oil, return it to medium-low heat, and wait until the underside of the egg is set before moving it.",
        "Eggs release by themselves once the underside has set; scraping too early tears them.",
        "Do not eat blackened or burnt bits; remove them.",
        "Next time: heat the pan first, then add the oil, and cook on medium-low.",
      ],
      zh: [
        "安全第一：刮之前先把火關到小火或把鍋移開爐面，熱鍋不要離人。",
        "不沾鍋：用矽膠或木頭鍋鏟（不要用金屬）。火調成中小火，沿鍋邊補約 1 小匙油。等蛋的邊緣凝固後，再輕輕把鍋鏟滑到蛋底下。",
        "不鏽鋼鍋或鐵鍋／鑄鐵鍋：多半是下油時鍋還不夠熱，或油太少。先離火 20–30 秒，補約 1 小匙油，再放回中小火，等蛋的底部凝固再翻動。",
        "蛋底部凝固後會自己脫離鍋面；太早刮會把蛋弄碎。",
        "燒黑、燒焦的部分不要吃，挑掉。",
        "下次：先把鍋燒熱再下油，用中小火。",
      ],
    },
  },
  {
    id: "burning",
    // 「burned my finger」是受傷，不是食物燒焦（見 detectInjury）
    triggers: [
      /\b(?:burn|burnt|burned|burning)\b(?!\s+(?:my|myself|me)\b)|\b(?:scorch|scorched|charred|smok(?:e|ing|y))\b/i,
      /冒煙|燒焦|焦掉|焦了|黑掉|糊了|煎焦/,
    ],
    facts: [],
    playbook: {
      en: [
        "Turn off the heat and move the pan off the burner. Open a window or turn on the vent.",
        "Never add water to hot oil.",
        "If only the bottom layer is burnt, move the unburnt food to a clean pan and throw away the blackened parts. If the whole dish is black or bitter, discard it and start again.",
        "Next time: lower the heat and stir more often.",
      ],
      zh: [
        "先關火，把鍋移開爐面，開窗或開抽油煙機。",
        "不要往熱油裡倒水。",
        "如果只有底層燒焦，把沒焦的部分換到乾淨的鍋，焦黑的丟掉。整鍋都黑或有苦味就丟掉重做。",
        "下次：火調小一點，多翻動。",
      ],
    },
  },
  {
    id: "watery",
    triggers: [
      /\b(?:watery|soggy)\b|too much (?:water|liquid|juice|sauce)|released (?:a lot of |way too much |too much )?(?:water|liquid)/i,
      /出水|太多水|水太多|湯汁太多|太稀|太濕/,
    ],
    facts: [],
    playbook: {
      en: [
        "Turn the heat up to medium-high and stir to let the extra liquid evaporate.",
        "For a stir-fry, lift the solid food out with a slotted spoon, reduce the liquid on its own, then return the food.",
        "Next time: cook in smaller batches and add salt late, because salt draws water out of vegetables.",
      ],
      zh: [
        "火轉到中大火，邊翻邊讓多餘的水分蒸發。",
        "炒菜的話，先用漏勺把料撈出來，湯汁單獨收乾，再把料放回去。",
        "下次：分小批炒，鹽晚一點再加，因為鹽會把蔬菜的水逼出來。",
      ],
    },
  },
  {
    id: "salty",
    triggers: [/too salty|over-?salt|oversalted/i, /太鹹|過鹹|鹹了|好鹹|太咸|咸了/],
    facts: [],
    playbook: {
      en: [
        "Salt cannot be taken out, only diluted.",
        "Add unsalted ingredients: water or unsalted stock for soups, more of the main ingredient, or plain rice or egg for stir-fries. Taste after each addition.",
        "Adding sugar only hides the saltiness; adding a raw potato does not reliably absorb salt.",
      ],
      zh: [
        "鹽拿不出來，只能稀釋。",
        "加沒調味的食材：湯類加水或無鹽高湯，炒菜多加主食材，或搭配白飯、蛋。每次加了都嚐一下。",
        "加糖只是蓋掉鹹味；放生馬鈴薯並不能可靠地吸鹽。",
      ],
    },
  },
];

/** 使用者自己說過的話（問題 + 同步驟的歷史），不含教練的回覆 */
export function userText(question: string, history: readonly CoachHistoryItem[]): string {
  return [...history.filter((h) => h.role === "user").map((h) => h.text), question].join("\n");
}

function cardFor(text: string): TriageCard | undefined {
  return TRIAGE_CARDS.find((c) => c.triggers.some((t) => t.test(text)));
}

/** 教練最近一次回覆是不是澄清問題（此時使用者的下一句多半是在回答它） */
function lastCoachAskedToClarify(history: readonly CoachHistoryItem[]): boolean {
  const lastCoach = [...history].reverse().find((h) => h.role === "coach");
  return lastCoach?.kind === "clarify";
}

/** 看起來是在問新問題（問號或疑問詞），而不是在回答教練的澄清問題 */
const NEW_QUESTION =
  /[?？]|\b(how|what|when|why|where|which|should|can|could|do|does|is|are)\b|多少|怎麼|怎么|什麼|什么|為什麼|嗎|吗|要不要/i;

/**
 * 教練剛問過澄清問題時，使用者這句話是否在回答它；是的話沿用最近一次命中的卡。
 * 說出了卡片要的資訊（例：「不沾鍋可以嗎？」）一定算回答；
 * 沒說出、又像在問新問題（例：「要加多少鹽？」）就不算，避免拿黏鍋的做法回答別的問題。
 */
function pendingCard(
  question: string,
  history: readonly CoachHistoryItem[],
): TriageCard | undefined {
  if (!lastCoachAskedToClarify(history)) return undefined;
  const card = [...history]
    .reverse()
    .filter((h) => h.role === "user")
    .map((h) => cardFor(h.text))
    .find((c) => c !== undefined);
  if (!card) return undefined;
  const namesAFact = card.facts.some((f) => f.answeredBy.test(question));
  return namesAFact || !NEW_QUESTION.test(question) ? card : undefined;
}

/**
 * 認出問題屬於哪張知識卡，以及還缺哪個關鍵資訊。
 * 使用者對澄清問題的回答通常很短（例：「不沾鍋」），本身不會命中任何觸發條件，
 * 所以教練剛問過澄清問題時，沿用同一步驟裡最近一次命中的卡。
 */
export function triage(
  question: string,
  history: readonly CoachHistoryItem[],
): TriageResult | null {
  const card = cardFor(question) ?? pendingCard(question, history);
  if (!card) return null;
  const known = userText(question, history);
  const missingFact = card.facts.find((f) => !f.answeredBy.test(known)) ?? null;
  return { card, missingFact };
}

/** 這一步裡教練是否已經問過澄清問題（只問一次，避免盤問） */
export function hasAskedToClarify(history: readonly CoachHistoryItem[]): boolean {
  return history.some((h) => h.role === "coach" && h.kind === "clarify");
}

/** 確定性的澄清回合：只問一個問題，並給等待期間的保守動作 */
export function clarifyTurn(
  result: TriageResult,
  stepNumber: number,
  locale: Locale,
  stepAction: string,
): CoachTurn {
  const fact = result.missingFact;
  if (!fact) throw new Error("clarifyTurn needs a missing fact");
  const action = stepAction.trim().slice(0, 100);
  return {
    kind: "clarify",
    step_ref: stepNumber,
    known: [locale === "en" ? `You're on step ${stepNumber}: ${action}` : `你正在第 ${stepNumber} 步：${action}`],
    unknown: [fact.unknownLabel[locale]],
    clarifying_question: fact.question[locale],
    actions: [],
    safety_note: result.card.holding?.[locale] ?? null,
    uncertainty_note: null,
    suggested_answers: [...fact.options[locale]],
  };
}

// 「flame」「火焰」「大火」都常用來說爐火大小（low flame、火焰要開多大），不能單獨當作起火；
// 只認明確的起火說法，或火焰「竄出／冒出」這類描述
const EMERGENCY = new RegExp(
  [
    String.raw`\b(?:on fire|caught fire|catch(?:ing)? fire|burst into flames?)\b`,
    String.raw`\bflames?\s+(?:are |is |were )?(?:coming|shooting|leaping|rising|spreading|growing|erupting)\b`,
    "起火|著火|着火|竄火",
    "(?:冒出|竄出|冒起|竄起)火[焰燄]|火[焰燄].{0,4}(?:冒出|竄出|冒起|竄起|越來越大)",
  ].join("|"),
  "i",
);

/** 是否在描述起火（需要立即、固定的處置，不經過模型） */
export function detectEmergency(text: string): boolean {
  return EMERGENCY.test(text);
}

/** 油鍋起火的標準處置（悶熄、不用水、擴大就離開並報警） */
export function emergencyTurn(stepNumber: number, locale: Locale): CoachTurn {
  const en = locale === "en";
  return {
    kind: "advise",
    step_ref: stepNumber,
    known: [en ? "You reported flames in the pan" : "你說鍋裡起火了"],
    unknown: [],
    clarifying_question: null,
    actions: [
      {
        instruction: en
          ? "Turn off the heat if you can reach the knob without leaning over the flames."
          : "如果不用把身體探過火焰就能碰到旋鈕，先關火。",
        look_for: en ? "The burner is off" : "爐火已關",
      },
      {
        instruction: en
          ? "Slide a metal lid or a baking sheet over the pan from the side to smother the flames, and leave it on until the pan is completely cool."
          : "用金屬鍋蓋或烤盤從鍋子側邊蓋上去悶熄火焰，蓋著不要掀，等鍋完全冷卻。",
        look_for: en ? "The flames go out" : "火焰熄滅",
      },
      {
        instruction: en
          ? "Do not pour water on it and do not carry or move the pan."
          : "不要潑水，也不要端著鍋移動。",
      },
      {
        instruction: en
          ? "If the fire spreads or you can't control it, leave the kitchen right away and call your local emergency number (119 in Taiwan)."
          : "如果火勢擴大或無法控制，立刻離開廚房並撥打當地緊急電話（台灣是 119）。",
      },
    ],
    safety_note: en
      ? "Never use water on an oil fire — it makes the flames flare up."
      : "油鍋起火絕對不能用水，會讓火勢暴衝。",
    uncertainty_note: null,
  };
}

const INJURY =
  /\b(?:burn(?:ed|t)?|scald(?:ed)?|cut|sliced)\s+(?:my|myself|me)\b|燙傷|燙到手|被燙|被油濺|油濺到|割傷|切到手|割到手|切到自己|劃傷/i;

/** 使用者自己受傷了（燙傷、切傷）：食物補救卡幫不上忙，要先處理人 */
export function detectInjury(text: string): boolean {
  return INJURY.test(text);
}

/** 燙傷與切傷的一般急救處置（固定內容，不經過模型；不是醫療建議） */
export function injuryTurn(stepNumber: number, locale: Locale): CoachTurn {
  const en = locale === "en";
  return {
    kind: "advise",
    step_ref: stepNumber,
    known: [en ? "You said you hurt yourself while cooking" : "你說做菜時受傷了"],
    unknown: [],
    clarifying_question: null,
    actions: [
      {
        instruction: en
          ? "Turn off the heat and step away from the stove."
          : "先關火，離開爐邊。",
      },
      {
        instruction: en
          ? "For a burn: hold the area under cool running water for 10–20 minutes. Do not use ice, butter or toothpaste."
          : "燙傷：把傷處放在流動的冷水下沖 10–20 分鐘。不要冰敷，也不要抹奶油或牙膏。",
        look_for: en ? "The pain eases" : "疼痛減輕",
      },
      {
        instruction: en
          ? "For a cut: press a clean cloth firmly on it and raise the hand above your heart."
          : "割傷：用乾淨的布用力壓住傷口，並把手抬高到高於心臟。",
        look_for: en ? "The bleeding slows or stops" : "出血變慢或停止",
      },
      {
        instruction: en
          ? "Get medical help if the burn is larger than your palm, blistering badly, or on the face, hands or joints, or if a cut keeps bleeding after 10 minutes of firm pressure. Call your local emergency number (119 in Taiwan) if it is severe."
          : "如果燙傷範圍比手掌大、起很多水泡，或在臉、手、關節，或割傷壓了 10 分鐘還在流血，請就醫。情況嚴重就撥當地緊急電話（台灣是 119）。",
      },
    ],
    safety_note: en
      ? "Don't go back to the pan until the heat is off and you are okay."
      : "確定火已關、自己沒事之前，先不要回到鍋子前。",
    uncertainty_note: en
      ? "This is general first aid, not medical advice."
      : "這是一般的急救常識，不是醫療建議。",
  };
}
