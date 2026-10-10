import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateText, hasGeminiKey } = vi.hoisted(() => ({
  generateText: vi.fn(),
  hasGeminiKey: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", () => ({ generateText, hasGeminiKey }));

import { recommendRecipes } from "@/lib/agents/recipe";
import type { FoodProfile } from "@/lib/data/types";

// 無金鑰時 recommendRecipes 會回內建範例食譜，不呼叫 Gemini。
// 範例食譜（不需器具者）：炒蛋、蛋花湯、涼拌（含蒜末、醬油、香油）
const profile = (restrictions: string[]): FoodProfile => ({
  kitchen_tools: [],
  dietary_restrictions: restrictions,
  default_serving_size: 1,
});

async function recommend(
  ingredients: string[],
  restrictions: string[],
  locale: "en" | "zh" = "en",
) {
  const result = await recommendRecipes({ ingredients, profile: profile(restrictions), locale });
  return { names: result.recipes.map((r) => r.recipe_name), note: result.note };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasGeminiKey.mockReturnValue(false);
});

describe("recommendRecipes restriction filtering", () => {
  it("returns every tool-free recipe when there are no restrictions", async () => {
    const { names } = await recommend(["tomato"], []);
    expect(names).toHaveLength(3);
  });

  it("filters by category: 'seafood' removes a recipe built on shrimp", async () => {
    const { names, note } = await recommend(["shrimp"], ["seafood"]);

    expect(names).toEqual([]);
    expect(note).toMatch(/No suitable dish/i);
  });

  it("filters by category in Chinese: '海鮮' removes a recipe built on 蝦", async () => {
    const { names, note } = await recommend(["蝦"], ["海鮮"], "zh");

    expect(names).toEqual([]);
    expect(note).toMatch(/找不到合適/);
  });

  it("removes recipes that contain egg, keeping the egg-free one", async () => {
    const { names } = await recommend(["tomato"], ["egg"]);

    expect(names).toEqual(["tomato Cold Salad"]);
  });

  it("removes the recipe that uses soy sauce when soy is restricted", async () => {
    const { names } = await recommend(["tomato"], ["soy"]);

    expect(names).not.toContain("tomato Cold Salad");
    expect(names).toHaveLength(2);
  });

  it("does not remove recipes for an unrelated restriction", async () => {
    const { names } = await recommend(["tomato"], ["peanut"]);
    expect(names).toHaveLength(3);
  });

  it("never calls Gemini when no key is configured", async () => {
    await recommend(["tomato"], ["egg"]);
    expect(generateText).not.toHaveBeenCalled();
  });
});
