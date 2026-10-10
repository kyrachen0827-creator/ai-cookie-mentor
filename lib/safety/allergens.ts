/**
 * 過敏／飲食限制比對（純函式，前後端皆可使用）
 *
 * 使用者在設定頁輸入的是自由文字（例：「海鮮、花生」「gluten-free」），
 * 食譜裡寫的是具體食材（shrimp、蠔油、醬油）。本模組把兩者對起來。
 *
 * 判定分三種，且刻意不提供「安全」這個結論：
 * - conflict：食材名稱明確屬於受限類別（限制海鮮、食材是 shrimp）
 * - uncertain：複合或加工食材，常含該類成分但看不到成分表，無法確認（限制麩質、食材是醬油）
 * - 沒有發現：只代表「在列出的文字中沒找到」，不代表安全
 *
 * 限制：詞表是手寫的高頻子集，不可能涵蓋所有過敏原與衍生食材；
 * 使用者自訂的冷僻詞只能做字面比對。這是降低風險的一層，不是醫療保證。
 */

export type Severity = "conflict" | "uncertain";

export interface RestrictionFinding {
  /** 發現問題的食材名稱，或步驟的文字 */
  item: string;
  source: "ingredient" | "step";
  /** 在食材清單或步驟清單中的 0-based 位置 */
  index: number;
  /** 使用者設定頁輸入的原始文字，例：「海鮮」 */
  restriction: string;
  severity: Severity;
}

interface Group {
  /** 使用者可能用來稱呼這個限制的詞（已小寫） */
  labels: readonly string[];
  /** 出現即視為衝突 */
  terms: readonly string[];
  /** 出現則「無法確認」 */
  mayContain?: readonly string[];
  /** 比對前先移除的片語，避免誤判（例：coconut milk 不是乳製品） */
  neutral?: readonly string[];
}

// ---------------------------------------------------------------------------
// 詞表
// ---------------------------------------------------------------------------

const STOCK_LIKE = ["高湯", "stock", "broth", "bouillon", "湯底"] as const;
const SATAY_LIKE = ["沙茶", "satay", "xo醬", "xo sauce"] as const;

const SEAFOOD_TERMS = [
  "魚", "蝦", "蟹", "魷", "墨魚", "章魚", "花枝", "蠔", "牡蠣", "蛤", "蜆", "干貝",
  "扇貝", "海參", "鮑", "海鮮", "海產",
  "fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "anchovies", "sardine",
  "mackerel", "squid", "calamari", "octopus", "cuttlefish", "shrimp", "prawn", "crab",
  "lobster", "oyster", "clam", "mussel", "scallop", "abalone", "seafood", "shellfish", "roe",
] as const;
const SEAFOOD_MAY = [...STOCK_LIKE, ...SATAY_LIKE, "worcestershire", "伍斯特", "dashi", "bonito"] as const;

const SHELLFISH_TERMS = [
  "蝦", "蟹", "龍蝦", "蠔", "牡蠣", "蛤", "蜆", "干貝", "扇貝", "鮑", "貝",
  "shrimp", "prawn", "crab", "lobster", "oyster", "clam", "mussel", "scallop", "abalone",
  "shellfish", "crayfish",
] as const;

const EGG_TERMS = [
  "蛋", "egg", "mayonnaise", "mayo", "美乃滋", "蛋黃醬", "meringue", "aioli", "hollandaise", "荷蘭醬",
] as const;
const EGG_MAY = [
  "麵條", "麵線", "麵包", "吐司", "義大利麵", "pasta", "noodle", "bread", "toast", "沙拉醬",
  "dressing", "batter", "麵糊", "麵衣", "餃子皮", "春捲皮", "天婦羅", "tempura", "餅乾",
  "cookie", "鬆餅", "pancake", "waffle",
] as const;
const EGG_NEUTRAL = ["蛋白質"] as const;

const DAIRY_TERMS = [
  "牛奶", "鮮奶", "奶油", "奶酪", "鮮奶油", "奶粉", "起司", "乳酪", "優格", "乳清", "煉乳",
  "奶精", "酪乳",
  "milk", "butter", "cream", "cheese", "yogurt", "yoghurt", "whey", "casein", "ghee",
  "lactose", "parmesan", "mozzarella", "cheddar", "custard",
] as const;
const DAIRY_MAY = [
  "咖哩塊", "咖哩", "roux", "巧克力", "chocolate", "麵包", "bread", "吐司", "蛋糕", "餅乾",
  "cookie", "cake", "pesto", "青醬", "margarine", "人造奶油", "pancake", "鬆餅",
] as const;
const DAIRY_NEUTRAL = [
  "椰奶", "椰漿", "豆奶", "杏仁奶", "燕麥奶", "coconut milk", "coconut cream", "almond milk",
  "oat milk", "soy milk", "rice milk", "peanut butter", "cocoa butter", "shea butter",
  "cream of tartar", "奶油白菜",
] as const;

const MEAT_TERMS = [
  "肉", "豬", "鴨", "鵝", "羊", "牛排", "牛腩", "牛腱", "牛小排", "牛骨", "培根", "火腿",
  "香腸", "臘腸", "肉鬆", "雞湯", "雞胸", "雞腿", "雞翅", "雞排", "雞丁", "雞絞",
  "meat", "beef", "pork", "chicken", "duck", "lamb", "mutton", "bacon", "ham", "sausage",
  "turkey", "steak", "lard", "veal", "prosciutto", "salami", "pepperoni",
] as const;
const MEAT_MAY = [
  ...STOCK_LIKE, "gelatin", "吉利丁", "明膠", ...SATAY_LIKE, "咖哩塊", "roux", "worcestershire",
  "伍斯特", "parmesan", "帕馬森",
] as const;
const MEAT_NEUTRAL = ["肉桂", "肉豆蔻", "果肉", "椰肉"] as const;

const GLUTEN_TERMS = [
  "小麥", "麵粉", "麵包", "吐司", "麵條", "麵線", "義大利麵", "拉麵", "烏龍", "餃子皮",
  "春捲皮", "麵筋", "大麥", "黑麥", "麵包粉", "麵衣", "餛飩皮", "泡麵",
  "wheat", "flour", "bread", "pasta", "noodle", "spaghetti", "macaroni", "udon", "ramen",
  "couscous", "barley", "rye", "seitan", "breadcrumb", "bread crumb", "panko", "semolina",
  "bulgur", "farro", "spelt", "tortilla", "cracker", "biscuit",
] as const;
const GLUTEN_MAY = [
  "醬油", "soy sauce", "soya", "醬油膏", "味噌", "miso", "啤酒", "beer", ...STOCK_LIKE,
  "調味粉", "seasoning", "咖哩塊", "roux", "蠔油", "oyster sauce", "烤肉醬", "bbq",
  "worcestershire", "伍斯特", "teriyaki", "照燒", "hoisin", "海鮮醬", "麥芽", "malt", "燕麥",
  "oat", "oats", "沙茶", "satay", "豆瓣醬", "蟹肉棒", "魚板", "surimi", "sausage", "香腸",
] as const;
const GLUTEN_NEUTRAL = [
  "米粉", "rice flour", "rice noodle", "glutinous rice flour", "糯米粉", "玉米粉", "cornflour",
  "corn flour", "cornstarch", "almond flour", "coconut flour", "tapioca flour", "potato flour",
  "chickpea flour", "太白粉", "地瓜粉", "在來米粉", "冬粉", "glass noodle", "buckwheat",
] as const;

const HONEY_TERMS = ["蜂蜜", "蜂王乳", "honey"] as const;

const GROUPS: readonly Group[] = [
  {
    labels: ["海鮮", "海產", "seafood", "海鮮過敏"],
    terms: SEAFOOD_TERMS,
    mayContain: SEAFOOD_MAY,
    neutral: ["海鮮醬"],
  },
  {
    labels: ["甲殼類", "貝類", "shellfish"],
    terms: SHELLFISH_TERMS,
    mayContain: SEAFOOD_MAY,
    neutral: ["貝果", "bagel"],
  },
  {
    labels: ["蝦", "蝦子", "shrimp", "shrimps", "prawn", "prawns"],
    terms: ["蝦", "shrimp", "prawn"],
    mayContain: [...STOCK_LIKE, ...SATAY_LIKE],
  },
  { labels: ["蟹", "螃蟹", "crab"], terms: ["蟹", "crab"], mayContain: ["蟹肉棒", "surimi"] },
  {
    labels: ["魚", "魚類", "fish"],
    terms: [
      "魚", "fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "anchovies", "sardine",
      "mackerel", "bonito",
    ],
    mayContain: [...STOCK_LIKE, ...SATAY_LIKE, "worcestershire", "伍斯特", "dashi", "caesar", "凱薩"],
  },
  {
    labels: ["花生", "peanut", "peanuts"],
    terms: ["花生", "peanut"],
    mayContain: ["沙茶", "satay", "宮保", "kung pao", "mixed nuts", "綜合堅果", "pad thai"],
  },
  {
    labels: ["堅果", "tree nut", "tree nuts", "tree-nut", "nut", "nuts", "核果"],
    terms: [
      "堅果", "核桃", "杏仁", "腰果", "榛果", "胡桃", "開心果", "夏威夷果", "松子", "栗子",
      "花生", "nuts", "walnut", "almond", "cashew", "hazelnut", "pecan", "pistachio",
      "macadamia", "pine nut", "chestnut", "brazil nut", "peanut",
    ],
    mayContain: ["pesto", "青醬", "nutella", "praline", "marzipan", "沙茶", "satay", "granola"],
    neutral: ["water chestnut", "荸薺", "馬蹄"],
  },
  {
    labels: ["蛋", "雞蛋", "egg", "eggs", "蛋類", "蛋過敏"],
    terms: EGG_TERMS,
    mayContain: EGG_MAY,
    neutral: EGG_NEUTRAL,
  },
  {
    labels: ["乳製品", "奶", "牛奶", "乳糖", "乳", "dairy", "milk", "lactose", "奶類", "奶製品"],
    terms: DAIRY_TERMS,
    mayContain: DAIRY_MAY,
    neutral: DAIRY_NEUTRAL,
  },
  {
    labels: ["麩質", "小麥", "麵粉", "麩質過敏", "gluten", "wheat", "celiac", "乳糜瀉", "麵筋"],
    terms: GLUTEN_TERMS,
    mayContain: GLUTEN_MAY,
    neutral: GLUTEN_NEUTRAL,
  },
  {
    labels: ["大豆", "黃豆", "豆類", "soy", "soya", "soybean", "soybeans", "soy bean"],
    terms: [
      "大豆", "黃豆", "毛豆", "豆腐", "豆漿", "豆乾", "豆干", "豆皮", "納豆", "味噌", "豆瓣醬",
      "醬油", "豆豉", "豆奶", "豆花", "素肉", "腐竹", "油豆腐", "豆包",
      "edamame", "soy", "soya", "tofu", "tempeh", "miso", "natto", "soybean",
    ],
    mayContain: [
      "蠔油", "oyster sauce", "烤肉醬", "bbq", "海鮮醬", "hoisin", "teriyaki", "照燒", "沙茶",
      "satay", "調味粉", "seasoning", "人造奶油", "margarine", "bouillon", "高湯塊",
      "stock cube", "咖哩塊", "巧克力", "chocolate", "麵包", "bread", "植物油", "沙拉油",
      "mayonnaise", "美乃滋",
    ],
  },
  {
    labels: ["芝麻", "sesame", "麻油", "香油", "胡麻"],
    terms: ["芝麻", "麻油", "香油", "胡麻", "麻醬", "sesame", "tahini", "hummus"],
    mayContain: ["沙茶", "satay", "辣油", "chili oil", "沙拉醬", "dressing", "燒餅", "bagel", "貝果", "bun", "香鬆", "furikake", "granola"],
  },
  {
    labels: ["素食", "蛋奶素", "奶蛋素", "蔬食", "vegetarian", "veggie", "素"],
    terms: [...MEAT_TERMS, ...SEAFOOD_TERMS],
    mayContain: MEAT_MAY,
    neutral: MEAT_NEUTRAL,
  },
  {
    labels: ["全素", "純素", "vegan"],
    terms: [...MEAT_TERMS, ...SEAFOOD_TERMS, ...EGG_TERMS, ...DAIRY_TERMS, ...HONEY_TERMS],
    mayContain: [...MEAT_MAY, ...EGG_MAY, ...DAIRY_MAY],
    neutral: [...MEAT_NEUTRAL, ...EGG_NEUTRAL, ...DAIRY_NEUTRAL],
  },
  {
    labels: ["豬肉", "豬", "不吃豬", "pork", "pig"],
    terms: [
      "豬", "培根", "火腿", "香腸", "臘腸", "臘肉", "叉燒", "pork", "bacon", "ham", "lard",
      "prosciutto", "pancetta", "salami", "pepperoni", "chorizo", "hot dog",
    ],
    mayContain: [
      ...STOCK_LIKE, "gelatin", "吉利丁", "明膠", "sausage", "熱狗", "漢堡排", "meatball",
      "貢丸", "肉丸", "餃子", "水餃", "咖哩塊", "roux", "shortening",
    ],
  },
  {
    labels: ["牛肉", "不吃牛", "beef", "cow"],
    terms: [
      "牛肉", "牛排", "牛腩", "牛腱", "牛小排", "牛絞肉", "牛骨", "牛筋", "牛油", "beef",
      "steak", "veal", "brisket", "sirloin", "ribeye", "tallow",
    ],
    mayContain: [
      ...STOCK_LIKE, "gelatin", "吉利丁", "明膠", "漢堡", "hamburger", "burger", "meatball",
      "貢丸", "肉丸", "hot dog", "熱狗", "咖哩塊", "roux",
    ],
    neutral: ["牛油果"],
  },
];

// ---------------------------------------------------------------------------
// 比對
// ---------------------------------------------------------------------------

interface ResolvedRestriction {
  raw: string;
  terms: readonly string[];
  mayContain: readonly string[];
  neutral: readonly string[];
}

const ASCII_TERM = /^[a-z][a-z\s-]*$/;

/**
 * 這些英文詞夠長、夠特定，可以出現在複合字裡（buttermilk、cheesecake、eggnog、fishcake、
 * crabmeat），所以用子字串比對。其他英文詞維持整字比對，避免 ham 命中 chamomile、
 * 短詞（cod、nut、oat）命中不相干的字。誤判的例外放在 GLOBAL_NEUTRAL 與各群組的 neutral。
 */
const COMPOUND_OK = new Set([
  "egg", "milk", "cheese", "butter", "fish", "shrimp", "prawn", "crab", "lobster", "oyster",
  "peanut", "almond", "walnut", "cashew", "hazelnut", "pecan", "pistachio", "sesame", "soy",
  "wheat", "tofu", "bacon", "pork", "chicken", "salmon", "tuna", "yogurt", "yoghurt",
]);

/** 看起來含有受限詞、其實不是的食材，對所有限制都先移除 */
const GLOBAL_NEUTRAL = [
  "eggplant", "crabapple", "crab apple", "butternut", "butterfly", "buttercup", "veggie",
  "oyster mushroom",
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 中文詞與可併入複合字的英文詞用子字串；其餘英文詞要整字比對 */
function containsTerm(haystack: string, term: string): boolean {
  if (!ASCII_TERM.test(term) || COMPOUND_OK.has(term)) return haystack.includes(term);
  return new RegExp(`(^|[^a-z])${escapeRegExp(term)}(s|es)?($|[^a-z])`).test(haystack);
}

function stripNeutral(text: string, neutral: readonly string[]): string {
  return [...GLOBAL_NEUTRAL, ...neutral].reduce(
    (acc, phrase) => acc.split(phrase).join(" "),
    text,
  );
}

const NOISE_WORDS =
  /過敏|不吃|不能吃|忌口|不含|allergy|allergic to|allergic|-?\s?free\b|^no\s+|^without\s+/g;

function normalizeRestriction(raw: string): string {
  return raw.toLowerCase().replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim();
}

function resolve(raw: string): ResolvedRestriction | null {
  const normalized = normalizeRestriction(raw);
  if (!normalized) return null;

  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  const matched = GROUPS.filter(
    (g) => g.labels.includes(normalized) || g.labels.includes(singular),
  );

  if (matched.length === 0) {
    // 不在詞表內的自訂限制：只能做字面比對
    return { raw, terms: [normalized], mayContain: [], neutral: [] };
  }
  return {
    raw,
    terms: matched.flatMap((g) => g.terms),
    mayContain: matched.flatMap((g) => g.mayContain ?? []),
    neutral: matched.flatMap((g) => g.neutral ?? []),
  };
}

function resolveAll(restrictions: readonly string[]): ResolvedRestriction[] {
  return restrictions.map(resolve).filter((r): r is ResolvedRestriction => r !== null);
}

function severityOf(text: string, r: ResolvedRestriction): Severity | null {
  const haystack = stripNeutral(text.toLowerCase(), r.neutral);
  if (r.terms.some((t) => containsTerm(haystack, t))) return "conflict";
  if (r.mayContain.some((t) => containsTerm(haystack, t))) return "uncertain";
  return null;
}

// ---------------------------------------------------------------------------
// 對外介面
// ---------------------------------------------------------------------------

function findingsFor(
  texts: readonly string[],
  source: RestrictionFinding["source"],
  resolved: readonly ResolvedRestriction[],
): RestrictionFinding[] {
  return texts.flatMap((item, index) =>
    resolved.flatMap((r) => {
      const severity = severityOf(item, r);
      return severity ? [{ item, source, index, restriction: r.raw, severity }] : [];
    }),
  );
}

const CJK = /[一-鿿]/;

/**
 * 把設定頁文字框的內容切成限制清單。
 * 以逗號、頓號、分號、換行切開；只有「含中文」的片段才再用空白切，
 * 這樣「海鮮 花生」會拆開，但英文的 "tree nuts"、"gluten free" 不會被拆成兩個詞。
 */
export function splitRestrictionInput(input: string): string[] {
  const pieces = input
    .split(/[,，、;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (CJK.test(s) ? s.split(/\s+/) : [s]));
  return [...new Set(pieces)];
}

/** 比對一組食材文字（來源視為食材） */
export function checkTexts(
  texts: readonly string[],
  restrictions: readonly string[],
): RestrictionFinding[] {
  return findingsFor(texts, "ingredient", resolveAll(restrictions));
}

/** 檢查整份食譜：食材名稱＋步驟文字（步驟可能加入食材清單沒寫的東西） */
export function checkRecipe(
  recipe: {
    ingredients: readonly { name: string }[];
    steps: readonly { action: string; doneness_cue?: string }[];
  },
  restrictions: readonly string[],
): RestrictionFinding[] {
  const resolved = resolveAll(restrictions);
  if (resolved.length === 0) return [];
  // 老師的 prompt 也會帶入每步的判斷依據，所以一併掃描
  const stepTexts = recipe.steps.map((s) => `${s.action} ${s.doneness_cue ?? ""}`.trim());
  return [
    ...findingsFor(recipe.ingredients.map((i) => i.name), "ingredient", resolved),
    ...findingsFor(stepTexts, "step", resolved),
  ];
}

export function hasConflict(findings: readonly RestrictionFinding[]): boolean {
  return findings.some((f) => f.severity === "conflict");
}

/**
 * 檢查一段文字（例如模型的回覆）是否提到受限食材。
 * 只算「明確衝突」的詞，不把「可能含有」的食材算進去，避免過度攔截。
 * 回傳被命中的限制（使用者原始文字）。
 */
export function findRestrictedTermsInText(
  text: string,
  restrictions: readonly string[],
): string[] {
  return resolveAll(restrictions)
    .filter((r) => severityOf(text, r) === "conflict")
    .map((r) => r.raw);
}
