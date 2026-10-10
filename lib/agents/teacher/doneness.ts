/**
 * 熟度與食品安全的判斷依據（依食材分類，不是一條規則套全部）。
 *
 * 只在「使用者的問題與熟度有關」且「食譜含該類食材」時才會用到：
 * - 把對應類別的判斷方式放進 prompt，讓模型有依據
 * - 護欄要求回答至少給出該類別認可的可靠檢查方式（溫度、切開檢查、肉質變化等）
 *
 * 數值採一般公開的食品安全建議（家禽 74°C、絞肉 71°C、豬牛羊整塊肉 63°C 並靜置、
 * 魚 63°C、蛋料理煮到凝固）。這是一般性指引，不是個別情況的醫療或食安保證。
 */

export type Locale = "en" | "zh";

export interface DonenessClass {
  id: "poultry" | "ground_meat" | "whole_cut" | "fish" | "shellfish" | "egg";
  /** 食譜名稱與食材文字符合時，視為含有這類食材 */
  pattern: RegExp;
  guidance: Record<Locale, string>;
  /** 回答中出現其中之一，才算給了這類食材認可的可靠檢查方式 */
  markers: RegExp;
}

const CLASSES: readonly DonenessClass[] = [
  {
    id: "poultry",
    pattern: /chicken|turkey|duck|goose|雞肉|雞胸|雞腿|雞翅|雞排|雞丁|鴨|鵝/i,
    guidance: {
      en: "Poultry: cook until the thickest part reaches 74°C (165°F) on a food thermometer. Without a thermometer, cut the thickest part open: no pink, and the juices run clear.",
      zh: "禽肉：用食物溫度計量最厚的部位，要到 74°C（165°F）。沒有溫度計就切開最厚的地方：不再粉紅，流出的汁液清澈。",
    },
    // 檢查字眼要夠具體：單獨的 cut / rest / open / set 在一般料理文字裡到處都有（cut into cubes），
    // 不能因為出現這些字就算給了熟度檢查
    markers:
      /74\s*°?\s*c|165\s*°?\s*f|thermometer|溫度計|cut (?:it |the [a-z ]+ )?open|cut (?:into|through) the (?:thickest|center|middle)|切開|no pink|not pink|不再(?:粉紅|帶粉)|juices|汁液/i,
  },
  {
    id: "ground_meat",
    pattern:
      /ground (?:beef|pork|lamb|meat|chicken|turkey)|minced (?:meat|beef|pork|lamb|chicken)|\bpatt(?:y|ies)\b|meatball|絞肉|漢堡排|肉丸|肉餡|貢丸/i,
    guidance: {
      en: "Ground meat: cook until 71°C (160°F) all the way through, with no pink in the middle. Color alone is not a reliable sign.",
      zh: "絞肉：整體要煮到 71°C（160°F），中間不再粉紅。只看顏色不可靠。",
    },
    markers:
      /71\s*°?\s*c|160\s*°?\s*f|thermometer|溫度計|cut (?:it |a |the )?(?:[a-z]+ )?open|cut (?:into|through) the (?:thickest|center|middle)|切開|no pink|not pink|不再(?:粉紅|帶粉)/i,
  },
  {
    id: "whole_cut",
    pattern: /\b(?:pork|beef|steak|lamb|veal)\b|豬肉|豬排|豬五花|牛肉|牛排|牛腩|羊肉|五花/i,
    guidance: {
      en: "Whole cuts of pork, beef or lamb: 63°C (145°F) on a food thermometer, then rest 3 minutes. Color alone is not a reliable sign.",
      zh: "整塊的豬、牛、羊肉：用食物溫度計量到 63°C（145°F），再靜置 3 分鐘。只看顏色不可靠。",
    },
    markers: /63\s*°?\s*c|145\s*°?\s*f|thermometer|溫度計|\brest(?:ing)?\b|靜置/i,
  },
  {
    id: "fish",
    pattern: /\b(?:fish|salmon|tuna|cod|tilapia|trout|mackerel)\b|魚/i,
    guidance: {
      en: "Fish: 63°C (145°F), or the flesh turns opaque and flakes easily when pressed with a fork.",
      zh: "魚：63°C（145°F），或魚肉變成不透明、用叉子輕壓就能裂開。",
    },
    markers: /63\s*°?\s*c|145\s*°?\s*f|flake|opaque|thermometer|溫度計|不透明|裂開|用叉/i,
  },
  {
    id: "shellfish",
    pattern: /shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|蝦|蟹|蛤|蚵|蠔|干貝|扇貝/i,
    guidance: {
      en: "Shrimp, crab, lobster, scallops: the flesh turns opaque (shrimp curl into a loose C and turn pink-white). Clams, mussels, oysters: cook until the shells open, and throw away any that stay closed.",
      zh: "蝦、蟹、龍蝦、干貝：肉變成不透明（蝦會彎成鬆鬆的 C 形、變粉白色）。蛤、淡菜、牡蠣：煮到殼打開，沒打開的要丟掉。",
    },
    markers:
      /opaque|不透明|pink-white|turn(?:s|ed)? pink|\bcurl|粉紅|粉白|彎成|shells?\b[^.]{0,30}\bopen|殼.{0,4}(?:打開|張開|開了)|discard any|throw away any|沒打開的/i,
  },
  {
    id: "egg",
    pattern: /\beggs?\b|蛋/i,
    guidance: {
      en: "Egg dishes: cook until firm, with no runny liquid egg left (71°C / 160°F if you use a thermometer).",
      zh: "蛋料理：煮到凝固、不再有流動的蛋液（用溫度計的話是 71°C / 160°F）。",
    },
    markers:
      /\bfirm\b|(?:fully|completely|is|are|until)\s+set\b|no (?:visible |runny |liquid )|not runny|凝固|不再流動|不流動|71\s*°?\s*c|160\s*°?\s*f/i,
  },
];

/** 看起來像食材、其實不是動物性食材的片語，比對前先移除 */
const NOT_SHELLFISH = /oyster mushroom|oyster sauce|蠔油|蠔菇/gi;

// 「done」只在問食物熟了沒的句型裡才算（"is it done"、"when it's done"、"done yet"），
// "I'm done chopping" 是在說自己做完了
const DONENESS_QUESTION =
  /(?:\bis|\bare|it'?s|they'?re|\bwhen)\b[^.?!]{0,25}\bdone\b|\bdone yet\b|well[- ]done|cooked|cook(?:ed)? through|undercook|overcook|\braw\b|\bpink\b|bloody|runny|translucent|safe to eat|熟|生的|沒熟|半熟|粉紅|帶血|煮好|好了嗎|可以吃/i;

/** 問題是否在問熟了沒、能不能吃（這時才需要可靠的熟度檢查） */
export function isDonenessQuestion(question: string): boolean {
  return DONENESS_QUESTION.test(question);
}

/** 食譜裡有哪些需要分別對待的動物性食材類別 */
export function relevantDonenessClasses(recipe: {
  recipe_name: string;
  ingredients: readonly { name: string }[];
}): DonenessClass[] {
  const text = [recipe.recipe_name, ...recipe.ingredients.map((i) => i.name)]
    .join(" ")
    .replace(NOT_SHELLFISH, " ");
  return CLASSES.filter((c) => c.pattern.test(text));
}
