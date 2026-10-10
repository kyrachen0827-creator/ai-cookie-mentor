import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateText, hasGeminiKey } = vi.hoisted(() => ({
  generateText: vi.fn(),
  hasGeminiKey: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", () => ({ generateText, hasGeminiKey }));

import { answerQuestion, respond } from "@/lib/agents/teacher";
import type { Recipe } from "@/lib/data/types";

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    recipe_name: "Tomato Rice Bowl",
    difficulty_level: "新手",
    estimated_time_minutes: 10,
    required_tools: [],
    ingredients: [
      { name: "Tomato", amount: "2" },
      { name: "Rice", amount: "1 bowl" },
    ],
    steps: [
      { action: "Chop the tomato", doneness_cue: "Even 1cm cubes" },
      { action: "Stir-fry the tomato", heat: "Medium heat", minutes: 3, doneness_cue: "Soft" },
    ],
    finished_dish_standard: "Red, juicy tomato over rice",
    ...overrides,
  };
}

const base = { stepIndex: 1, question: "How hot should the pan be?", locale: "en" as const };

function lastPrompt(): string {
  return generateText.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  hasGeminiKey.mockReturnValue(true);
  generateText.mockResolvedValue("Medium heat is fine. Wait until the tomato softens.");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("answerQuestion without restrictions", () => {
  it("behaves as before: one model call, no restriction block in the prompt", async () => {
    const answer = await answerQuestion({ ...base, recipe: makeRecipe() });

    expect(answer).toBe("Medium heat is fine. Wait until the tomato softens.");
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).not.toContain("硬性規則");
  });

  it("answers an empty question with a hint and does not call the model", async () => {
    const answer = await answerQuestion({ ...base, question: "  ", recipe: makeRecipe() });

    expect(answer).toMatch(/ask me/i);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("answerQuestion when the recipe conflicts with a restriction", () => {
  const eggRecipe = makeRecipe({
    ingredients: [
      { name: "Egg", amount: "2" },
      { name: "Tomato", amount: "1" },
    ],
  });

  it("refuses without calling the model and names the conflicting ingredient", async () => {
    const answer = await answerQuestion({ ...base, recipe: eggRecipe, restrictions: ["egg"] });

    expect(generateText).not.toHaveBeenCalled();
    expect(answer).toContain("Egg");
    expect(answer).toContain("egg");
    expect(answer).toMatch(/different dish/i);
  });

  it("still refuses when no AI key is configured, because safety does not depend on the model", async () => {
    hasGeminiKey.mockReturnValue(false);

    const answer = await answerQuestion({ ...base, recipe: eggRecipe, restrictions: ["egg"] });

    expect(answer).toMatch(/different dish/i);
  });

  it("points at the step when only a step introduces the restricted food", async () => {
    const recipe = makeRecipe({
      steps: [
        { action: "Chop the tomato", doneness_cue: "Cubes" },
        { action: "Add a splash of milk", doneness_cue: "Creamy" },
      ],
    });

    const answer = await answerQuestion({ ...base, recipe, restrictions: ["dairy"] });

    expect(answer).toContain("step 2");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("names only the ingredient when both the ingredient and its steps conflict", async () => {
    const recipe = makeRecipe({
      ingredients: [{ name: "Egg", amount: "2" }],
      steps: [{ action: "Beat the eggs", doneness_cue: "Mixed" }],
    });

    const answer = await answerQuestion({ ...base, recipe, restrictions: ["egg"] });

    expect(answer).toContain("Egg");
    expect(answer).not.toContain("step 1");
  });

  it("answers in Chinese when the locale is zh", async () => {
    const answer = await answerQuestion({
      ...base,
      locale: "zh",
      recipe: eggRecipe,
      restrictions: ["蛋"],
    });

    expect(answer).toContain("衝突");
    expect(answer).toContain("蛋");
  });

  it("never describes anything as safe", async () => {
    const answer = await answerQuestion({ ...base, recipe: eggRecipe, restrictions: ["egg"] });
    expect(answer).not.toMatch(/\bsafe\b/i);
  });
});

describe("answerQuestion prompt constraints", () => {
  it("lists the restrictions as hard rules and forbids calling anything safe", async () => {
    await answerQuestion({ ...base, recipe: makeRecipe(), restrictions: ["peanut", "海鮮"] });

    const prompt = lastPrompt();
    expect(prompt).toContain("硬性規則");
    expect(prompt).toContain("peanut");
    expect(prompt).toContain("海鮮");
    expect(prompt).toContain("安全");
  });

  it("flags compound ingredients it cannot verify", async () => {
    const recipe = makeRecipe({
      ingredients: [
        { name: "Tomato", amount: "2" },
        { name: "Soy sauce", amount: "1 tbsp" },
      ],
    });

    await answerQuestion({ ...base, recipe, restrictions: ["gluten"] });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("Soy sauce");
    expect(lastPrompt()).toContain("成分標示");
  });
});

describe("answerQuestion model-reply check", () => {
  it("replaces a reply that mentions a restricted food and logs the incident", async () => {
    generateText.mockResolvedValue("Try tossing in some peanuts for crunch!");

    const answer = await answerQuestion({
      ...base,
      recipe: makeRecipe(),
      restrictions: ["peanut"],
    });

    expect(answer).not.toContain("peanuts for crunch");
    expect(answer).toMatch(/label/i);
    expect(answer).not.toMatch(/\bsafe\b/i);
    expect(console.error).toHaveBeenCalled();
  });

  it("passes a clean reply through unchanged", async () => {
    generateText.mockResolvedValue("Keep the heat at medium and stir often.");

    const answer = await answerQuestion({
      ...base,
      recipe: makeRecipe(),
      restrictions: ["peanut", "seafood"],
    });

    expect(answer).toBe("Keep the heat at medium and stir often.");
  });

  it("uses a Chinese fallback for zh users", async () => {
    generateText.mockResolvedValue("可以加一點蝦仁提鮮");

    const answer = await answerQuestion({
      ...base,
      locale: "zh",
      recipe: makeRecipe(),
      restrictions: ["海鮮"],
    });

    expect(answer).not.toContain("蝦仁");
    expect(answer).toContain("成分標示");
  });
});

// ---------------------------------------------------------------------------
// respond(): 老師的完整回合（緊急 → 過敏把關 → Coach）
// ---------------------------------------------------------------------------

const coachAdvice = (stepRef: number) =>
  JSON.stringify({
    kind: "advise",
    step_ref: stepRef,
    known: [],
    unknown: [],
    clarifying_question: null,
    actions: [{ instruction: "Lower the heat to medium-low", look_for: "The sizzle quiets down" }],
    safety_note: null,
    uncertainty_note: null,
  });

describe("respond", () => {
  it("answers a pan fire with the fixed steps even when the recipe conflicts with a restriction", async () => {
    const eggRecipe = makeRecipe({ ingredients: [{ name: "Egg", amount: "2" }] });

    const reply = await respond({
      ...base,
      question: "the oil caught fire!",
      recipe: eggRecipe,
      restrictions: ["egg"],
    });

    expect(reply.source).toBe("emergency");
    expect(reply.answer.toLowerCase()).toContain("lid");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("still blocks a recipe that conflicts with a restriction, before the coach runs", async () => {
    const eggRecipe = makeRecipe({ ingredients: [{ name: "Egg", amount: "2" }] });

    const reply = await respond({ ...base, recipe: eggRecipe, restrictions: ["egg"] });

    expect(reply.source).toBe("blocked");
    expect(reply.coach).toBeUndefined();
    expect(reply.answer).toMatch(/different dish/i);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the plain answer path during mise en place, when there is no step yet", async () => {
    const reply = await respond({ ...base, stepIndex: null, recipe: makeRecipe() });

    expect(reply.source).toBe("legacy");
    expect(reply.coach).toBeUndefined();
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("asks the key question first for a known problem, without calling the model", async () => {
    const reply = await respond({
      ...base,
      question: "My food keeps sticking to the pan",
      recipe: makeRecipe(),
    });

    expect(reply.source).toBe("triage");
    expect(reply.coach?.kind).toBe("clarify");
    expect(reply.answer).toMatch(/non-stick/i);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("calls the model in JSON mode with temperature 0 and returns the structured turn", async () => {
    generateText.mockResolvedValue(coachAdvice(2));

    const reply = await respond({ ...base, recipe: makeRecipe() });

    expect(reply.source).toBe("model");
    expect(reply.coach?.actions[0].instruction).toBe("Lower the heat to medium-low");
    expect(reply.answer).toContain("1. Lower the heat to medium-low");
    expect(generateText).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ json: true, temperature: 0 }),
    );
  });

  it("passes the same-step history and unverifiable ingredients to the coach", async () => {
    generateText.mockResolvedValue(coachAdvice(2));
    const recipe = makeRecipe({
      ingredients: [
        { name: "Tomato", amount: "2" },
        { name: "Soy sauce", amount: "1 tbsp" },
      ],
    });

    await respond({
      ...base,
      recipe,
      restrictions: ["gluten"],
      history: [
        { role: "user", text: "earlier message" },
        { role: "coach", text: "earlier reply", kind: "advise" },
      ],
    });

    const prompt = lastPrompt();
    expect(prompt).toContain("earlier message");
    expect(prompt).toContain("Soy sauce");
    expect(prompt).toContain("gluten");
  });

  it("falls back to the recipe's own guidance when the model never produces a valid turn", async () => {
    generateText.mockResolvedValue("not json at all");

    const reply = await respond({ ...base, recipe: makeRecipe() });

    expect(reply.source).toBe("fallback");
    expect(reply.coach?.uncertainty_note).toBeTruthy();
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("answers in Chinese for Chinese users", async () => {
    const reply = await respond({
      ...base,
      locale: "zh",
      question: "蛋一直黏在鍋子上",
      recipe: makeRecipe(),
    });

    expect(reply.answer).toMatch(/不沾鍋/);
  });
});

describe("respond with injected coach dependencies (evaluation harness)", () => {
  it("uses the injected model instead of Gemini and passes onAttempt through", async () => {
    const generate = vi.fn(async () => coachAdvice(2));
    const onAttempt = vi.fn();

    const reply = await respond(
      { ...base, recipe: makeRecipe(), question: "How small should the pieces be?" },
      { generate, hasModel: () => true, onAttempt },
    );

    expect(reply.source).toBe("model");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledWith({ raw: coachAdvice(2), formatOk: true, violations: [] });
  });
});
