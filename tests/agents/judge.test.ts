import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateText, hasGeminiKey } = vi.hoisted(() => ({
  generateText: vi.fn(),
  hasGeminiKey: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", () => ({ generateText, hasGeminiKey }));

import { scoreDish } from "@/lib/agents/judge";
import type { Recipe } from "@/lib/data/types";

const recipe: Recipe = {
  id: "r1",
  recipe_name: "Tomato Scrambled Eggs",
  difficulty_level: "新手",
  estimated_time_minutes: 12,
  required_tools: [],
  ingredients: [{ name: "Egg", amount: "3" }],
  steps: [{ action: "Scramble the eggs", doneness_cue: "Soft curds" }],
  finished_dish_standard: "Soft yellow curds with juicy tomato",
};

const input = { recipe, image: { mimeType: "image/jpeg", dataBase64: "AAAA" }, locale: "en" as const };

const good = JSON.stringify({
  recognizable: true,
  color_score: 4,
  color_evidence: "Bright yellow egg and red tomato",
  plating_score: 3,
  plating_evidence: "Piled in the centre of a white plate",
  doneness_score: 4,
  doneness_evidence: "Light golden edges, no burnt spots, sauce stays on the plate",
  strength_comment: "Nice soft curds",
  improvement_comment: "Wipe the plate rim",
});

const prompt = (call = 0) => generateText.mock.calls[call]?.[0] as string;

beforeEach(() => {
  vi.resetAllMocks();
  hasGeminiKey.mockReturnValue(true);
});

describe("judge prompt", () => {
  it("defines the third dimension as visible surface finish and says it is not doneness", async () => {
    generateText.mockResolvedValueOnce(good);
    await scoreDish(input);

    expect(prompt()).toMatch(/烹調完成度/);
    expect(prompt()).toMatch(/不是熟度/);
    expect(prompt()).toMatch(/梅納反應/);
  });

  it("asks Gemini for JSON output", async () => {
    generateText.mockResolvedValueOnce(good);
    await scoreDish(input);

    expect(generateText.mock.calls[0][2]).toMatchObject({ temperature: 0, json: true });
  });
});

describe("judge output handling", () => {
  it("scores a well-formed reply in one call", async () => {
    generateText.mockResolvedValueOnce(good);
    const verdict = await scoreDish(input);

    expect(verdict).toMatchObject({ ok: true, result: { total_score: 11 } });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("retries once with feedback when the reply is not JSON", async () => {
    generateText.mockResolvedValueOnce("Looks tasty!").mockResolvedValueOnce(good);
    const verdict = await scoreDish(input);

    expect(verdict.ok).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(prompt(1)).toMatch(/previous reply/i);
  });

  it("retries once when a score is missing instead of blaming the photo", async () => {
    const missing = JSON.stringify({ ...JSON.parse(good), plating_score: undefined });
    generateText.mockResolvedValueOnce(missing).mockResolvedValueOnce(good);
    const verdict = await scoreDish(input);

    expect(verdict.ok).toBe(true);
    expect(prompt(1)).toMatch(/plating_score/);
  });

  it("asks to try again (without throwing) after two unusable replies", async () => {
    generateText.mockResolvedValue("not json");
    const verdict = await scoreDish(input);

    expect(verdict).toMatchObject({ ok: false, retake: true });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("asks for a retake without retrying when the photo is not recognizable", async () => {
    generateText.mockResolvedValueOnce(JSON.stringify({ recognizable: false, reason: "Too dark" }));
    const verdict = await scoreDish(input);

    expect(verdict).toEqual({ ok: false, retake: true, message: "Too dark" });
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
