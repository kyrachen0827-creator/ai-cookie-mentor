import { describe, expect, it } from "vitest";
import {
  checkRecipe,
  checkTexts,
  findRestrictedTermsInText,
  hasConflict,
  splitRestrictionInput,
} from "@/lib/safety/allergens";

describe("splitRestrictionInput (setup page text box)", () => {
  it.each([
    ["海鮮、花生", ["海鮮", "花生"]],
    ["海鮮，花生", ["海鮮", "花生"]],
    ["seafood, peanuts", ["seafood", "peanuts"]],
    ["seafood; peanuts", ["seafood", "peanuts"]],
    ["seafood\npeanuts", ["seafood", "peanuts"]],
  ])("splits %j on commas, semicolons and newlines", (input, expected) => {
    expect(splitRestrictionInput(input)).toEqual(expected);
  });

  it("keeps multi-word English restrictions together", () => {
    expect(splitRestrictionInput("tree nuts, gluten free")).toEqual(["tree nuts", "gluten free"]);
  });

  it("still splits Chinese words typed with spaces", () => {
    expect(splitRestrictionInput("海鮮 花生")).toEqual(["海鮮", "花生"]);
  });

  it("trims, drops blanks and removes duplicates", () => {
    expect(splitRestrictionInput("  蛋 、、 蛋,  ")).toEqual(["蛋"]);
  });

  it("returns an empty list for empty input", () => {
    expect(splitRestrictionInput("   ")).toEqual([]);
  });

  it("produces entries the matcher understands", () => {
    const [first] = splitRestrictionInput("tree nuts");
    expect(checkTexts(["Almonds"], [first])[0]?.severity).toBe("conflict");
  });
});

type Expected = "conflict" | "uncertain" | "clear";

function verdict(restriction: string, text: string): Expected {
  return checkTexts([text], [restriction])[0]?.severity ?? "clear";
}

describe("checkTexts — conflicts (restricted ingredient is clearly present)", () => {
  it.each([
    ["海鮮", "蝦仁"],
    ["seafood", "Shrimp"],
    ["seafood", "King prawns"],
    ["海鮮", "蠔油"],
    ["蝦", "蝦皮"],
    ["shrimp", "Tiger prawn"],
    ["蛋", "雞蛋"],
    ["egg", "Mayonnaise"],
    ["dairy", "Butter"],
    ["牛奶", "鮮奶油"],
    ["乳製品", "cheddar cheese"],
    ["peanut", "Peanut oil"],
    ["花生", "花生醬"],
    ["tree nuts", "Almonds"],
    ["堅果", "腰果"],
    ["gluten", "Wheat flour"],
    ["gluten-free", "Bread"],
    ["大豆", "豆腐"],
    ["soy", "Soy sauce"],
    ["sesame", "Tahini"],
    ["素食", "雞胸肉"],
    ["vegetarian", "Beef broth"],
    ["vegan", "Honey"],
    ["vegan", "Egg"],
    ["豬肉", "豬絞肉"],
    ["pork", "Bacon"],
    ["beef", "Beef steak"],
    ["牛肉", "牛腩"],
    ["芒果", "芒果醬"],
    // 英文複合字：整字比對會漏掉這些
    ["dairy", "Buttermilk"],
    ["dairy", "Cheesecake"],
    ["egg", "Eggnog"],
    ["seafood", "Fishcake"],
    ["crab", "Crabmeat"],
    ["peanut", "Peanutbutter cookies"],
  ])("restriction %s flags %s", (restriction, text) => {
    expect(verdict(restriction, text)).toBe("conflict");
  });
});

describe("checkTexts — restriction text normalisation", () => {
  it.each([
    ["蝦過敏", "Shrimp"],
    ["No dairy", "Milk"],
    ["  海鮮  ", "shrimp"],
    ["allergic to peanuts", "peanut"],
    ["Dairy-Free", "Cheese"],
  ])("understands %s", (restriction, text) => {
    expect(verdict(restriction, text)).toBe("conflict");
  });

  it("ignores blank restrictions and an empty list", () => {
    expect(checkTexts(["shrimp"], [])).toEqual([]);
    expect(checkTexts(["shrimp"], ["", "   "])).toEqual([]);
  });
});

describe("checkTexts — uncertain (compound foods that may hide the allergen)", () => {
  it.each([
    ["egg", "Fettuccine pasta"],
    ["gluten", "Soy sauce"],
    ["gluten", "醬油"],
    ["海鮮", "高湯"],
    ["seafood", "Chicken stock"],
    ["peanut", "沙茶醬"],
    ["vegetarian", "Vegetable stock"],
    ["soy", "沙拉油"],
    ["dairy", "咖哩塊"],
    ["pork", "Sausage"],
  ])("restriction %s cannot confirm %s", (restriction, text) => {
    expect(verdict(restriction, text)).toBe("uncertain");
  });
});

describe("checkTexts — no false alarm on look-alike words", () => {
  it.each([
    ["seafood", "雞蛋"],
    ["seafood", "Seaweed"],
    ["seafood", "海苔"],
    ["seafood", "海鮮醬"],
    ["egg", "Eggplant"],
    ["egg", "蛋白質粉"],
    ["dairy", "Coconut milk"],
    ["dairy", "Peanut butter"],
    ["dairy", "Butternut squash"],
    ["dairy", "奶油白菜"],
    ["gluten", "Rice flour"],
    ["gluten", "Glutinous rice flour"],
    ["gluten", "米粉"],
    ["tree nuts", "Coconut"],
    ["tree nuts", "Nutmeg"],
    ["tree nuts", "Water chestnut"],
    ["peanut", "Almond"],
    ["vegetarian", "肉桂粉"],
    ["vegetarian", "Chamomile tea"],
    ["vegetarian", "Tofu"],
    ["pork", "Chamomile"],
    ["beef", "牛油果"],
    ["soy", "綠豆"],
    ["sesame", "Soy sauce"],
    ["芒果", "蘋果"],
    ["gluten", "Buckwheat groats"],
    ["crab", "Crab apple"],
    ["egg", "Eggplant"],
    ["dairy", "Butterfly pea flower"],
    ["egg", "Veggie burger patty"],
    ["shellfish", "Oyster mushrooms"],
  ])("restriction %s does not flag %s", (restriction, text) => {
    expect(verdict(restriction, text)).toBe("clear");
  });
});

describe("checkRecipe", () => {
  const recipe = {
    ingredients: [{ name: "Egg" }, { name: "Tomato" }],
    steps: [{ action: "Beat the eggs" }, { action: "Add a splash of milk and stir" }],
  };

  it("reports ingredient conflicts with the ingredient name", () => {
    const findings = checkRecipe(recipe, ["egg"]);
    expect(findings).toContainEqual(
      expect.objectContaining({ source: "ingredient", item: "Egg", severity: "conflict" }),
    );
  });

  it("also scans step text, because a step can add something the ingredient list omits", () => {
    const findings = checkRecipe(recipe, ["dairy"]);
    expect(findings).toContainEqual(
      expect.objectContaining({ source: "step", index: 1, severity: "conflict" }),
    );
  });

  it("also scans the doneness cue, which the teacher prompt includes", () => {
    const withCue = {
      ingredients: [{ name: "Tomato" }],
      steps: [{ action: "Stir-fry", doneness_cue: "Until the egg sets" }],
    };
    expect(checkRecipe(withCue, ["egg"])).toContainEqual(
      expect.objectContaining({ source: "step", severity: "conflict" }),
    );
  });

  it("returns nothing when the recipe has no restricted content", () => {
    expect(checkRecipe(recipe, ["peanut"])).toEqual([]);
  });

  it("keeps the original restriction text the user typed", () => {
    const [finding] = checkRecipe(recipe, ["蛋過敏"]);
    expect(finding.restriction).toBe("蛋過敏");
  });

  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(recipe);
    checkRecipe(recipe, ["egg", "dairy"]);
    expect(JSON.stringify(recipe)).toBe(snapshot);
  });
});

describe("hasConflict", () => {
  it("is true only when at least one finding is a clear conflict", () => {
    expect(hasConflict(checkTexts(["Shrimp"], ["seafood"]))).toBe(true);
    expect(hasConflict(checkTexts(["Chicken stock"], ["seafood"]))).toBe(false);
    expect(hasConflict([])).toBe(false);
  });
});

describe("findRestrictedTermsInText (used to double-check model replies)", () => {
  it("returns the restrictions whose ingredient appears in the text", () => {
    expect(findRestrictedTermsInText("Add some peanuts for crunch", ["peanut"])).toEqual([
      "peanut",
    ]);
  });

  it("does not count 'may contain' foods as a hit", () => {
    expect(findRestrictedTermsInText("Use a little soy sauce", ["gluten"])).toEqual([]);
  });

  it("returns nothing for harmless text", () => {
    expect(findRestrictedTermsInText("Lower the heat and wait", ["seafood", "egg"])).toEqual([]);
  });

  it("works in Chinese", () => {
    expect(findRestrictedTermsInText("可以加一點蝦仁提鮮", ["海鮮"])).toEqual(["海鮮"]);
  });
});
