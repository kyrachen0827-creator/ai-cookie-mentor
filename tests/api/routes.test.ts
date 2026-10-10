import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route 會 import 帶有 "server-only" 的 agent，這裡整個換成 mock，也就不會打到 Gemini
// （vi.mock 會被提升到檔案最上方，mock 函式必須用 vi.hoisted 建立）
const { respond, recommendRecipes, scoreDish, generateDishImage } = vi.hoisted(() => ({
  respond: vi.fn(),
  recommendRecipes: vi.fn(),
  scoreDish: vi.fn(),
  generateDishImage: vi.fn(),
}));

vi.mock("@/lib/agents/teacher", () => ({ respond }));
vi.mock("@/lib/agents/recipe", () => ({ recommendRecipes }));
vi.mock("@/lib/agents/judge", () => ({ scoreDish }));
vi.mock("@/lib/agents/recipe/image", () => ({ generateDishImage }));

import { resetRateLimits } from "@/lib/api/guard";
import { POST as teacherPOST } from "@/app/api/agents/teacher/route";
import { POST as recipePOST } from "@/app/api/agents/recipe/route";
import { POST as judgePOST } from "@/app/api/agents/judge/route";
import { POST as imagePOST } from "@/app/api/agents/recipe/image/route";

const recipe = {
  id: "r1",
  recipe_name: "Tomato Scrambled Eggs",
  difficulty_level: "新手",
  estimated_time_minutes: 12,
  required_tools: [],
  ingredients: [{ name: "Egg", amount: "2" }],
  steps: [{ action: "Scramble", heat: "Medium heat", minutes: 2, doneness_cue: "Edges set" }],
  finished_dish_standard: "Golden eggs",
};

function post(body: unknown, ip = "9.9.9.9"): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/agents/teacher", () => {
  it("returns the answer for a valid request and keeps the { answer } field", async () => {
    respond.mockResolvedValue({ answer: "Lower the heat.", source: "model" });

    const res = await teacherPOST(
      post({ recipe, stepIndex: 0, question: "Eggs stick to the pan", locale: "en" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "Lower the heat.", source: "model" });
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ stepIndex: 0, question: "Eggs stick to the pan", locale: "en" }),
    );
  });

  it("passes the user's dietary restrictions to the agent", async () => {
    respond.mockResolvedValue({ answer: "ok", source: "model" });

    await teacherPOST(
      post({
        recipe,
        stepIndex: 0,
        question: "help",
        profile: { kitchen_tools: [], dietary_restrictions: ["海鮮", "peanut"], default_serving_size: 1 },
      }),
    );

    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ restrictions: ["海鮮", "peanut"] }),
    );
  });

  it("passes the same-step history to the agent and returns the structured turn untouched", async () => {
    const coach = { kind: "clarify", step_ref: 1, clarifying_question: "Which pan?" };
    respond.mockResolvedValue({ answer: "Which pan?", coach, source: "triage" });

    const res = await teacherPOST(
      post({
        recipe,
        stepIndex: 0,
        question: "non-stick",
        history: [{ role: "user", text: "eggs stick" }],
      }),
    );

    expect(await res.json()).toEqual({ answer: "Which pan?", coach, source: "triage" });
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ history: [{ role: "user", text: "eggs stick" }] }),
    );
  });

  it("still works for an older client that sends no profile", async () => {
    respond.mockResolvedValue({ answer: "ok", source: "model" });

    const res = await teacherPOST(post({ recipe, stepIndex: 0, question: "help" }));

    expect(res.status).toBe(200);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ restrictions: [] }));
  });

  it("rejects an invalid request with 400 without calling the agent", async () => {
    const res = await teacherPOST(post({ recipe, question: "" }));

    expect(res.status).toBe(400);
    expect(respond).not.toHaveBeenCalled();
  });

  it("answers validation errors in Chinese when locale is zh", async () => {
    const res = await teacherPOST(post({ recipe, question: "", locale: "zh" }));
    const { error } = await res.json();

    expect(res.status).toBe(400);
    expect(error).toMatch(/欄位/);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await teacherPOST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("does not leak upstream error details when the agent throws", async () => {
    respond.mockRejectedValue(
      new Error("Gemini API 錯誤 (403): key=SECRET-KEY-123 is invalid"),
    );

    const res = await teacherPOST(post({ recipe, stepIndex: 0, question: "help" }));
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(500);
    expect(text).not.toContain("SECRET-KEY-123");
    expect(text).not.toContain("Gemini");
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 429 once the per-IP limit is exceeded", async () => {
    respond.mockResolvedValue({ answer: "ok", source: "model" });
    const request = () => post({ recipe, stepIndex: 0, question: "help" }, "7.7.7.7");

    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await teacherPOST(request())).status);

    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("does not rate-limit a different client", async () => {
    respond.mockResolvedValue({ answer: "ok", source: "model" });
    for (let i = 0; i < 21; i++) {
      await teacherPOST(post({ recipe, stepIndex: 0, question: "help" }, "7.7.7.7"));
    }

    const res = await teacherPOST(post({ recipe, stepIndex: 0, question: "help" }, "8.8.8.8"));
    expect(res.status).toBe(200);
  });

  it("rejects an oversized body with 413", async () => {
    const res = await teacherPOST(post({ recipe, question: "x".repeat(200_000) }));
    expect(res.status).toBe(413);
  });
});

describe("POST /api/agents/recipe", () => {
  it("passes the profile through to the agent", async () => {
    recommendRecipes.mockResolvedValue({ recipes: [] });

    const res = await recipePOST(
      post({
        ingredients: ["egg"],
        profile: { kitchen_tools: [], dietary_restrictions: ["蝦"], default_serving_size: 2 },
        locale: "en",
      }),
    );

    expect(res.status).toBe(200);
    expect(recommendRecipes).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: ["egg"],
        profile: expect.objectContaining({ dietary_restrictions: ["蝦"] }),
      }),
    );
  });

  it("rejects an empty ingredient list with 400", async () => {
    const res = await recipePOST(post({ ingredients: [] }));
    expect(res.status).toBe(400);
    expect(recommendRecipes).not.toHaveBeenCalled();
  });

  it("hides internal errors with a generic 500", async () => {
    recommendRecipes.mockRejectedValue(new Error("boom: internal detail"));

    const res = await recipePOST(post({ ingredients: ["egg"] }));
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(500);
    expect(text).not.toContain("internal detail");
  });
});

describe("POST /api/agents/judge", () => {
  const image = { mimeType: "image/jpeg", dataBase64: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD" };

  it("scores a valid request", async () => {
    scoreDish.mockResolvedValue({ ok: true, result: { total_score: 12 } });

    const res = await judgePOST(post({ recipe, image }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: { total_score: 12 } });
  });

  it("rejects a non-image mime type with 400", async () => {
    const res = await judgePOST(post({ recipe, image: { ...image, mimeType: "text/html" } }));
    expect(res.status).toBe(400);
    expect(scoreDish).not.toHaveBeenCalled();
  });

  it("rejects a body over the 4MB cap with 413", async () => {
    const huge = "A".repeat(4 * 1024 * 1024 + 10);
    const res = await judgePOST(post({ recipe, image: { ...image, dataBase64: huge } }));
    expect(res.status).toBe(413);
  });
});

describe("POST /api/agents/recipe/image", () => {
  it("returns a data URL and keeps the { dataUrl } contract", async () => {
    generateDishImage.mockResolvedValue("data:image/png;base64,AAAA");

    const res = await imagePOST(post({ name: "Tomato Eggs", standard: "Golden" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dataUrl: "data:image/png;base64,AAAA" });
  });

  it("rejects a missing dish name with 400", async () => {
    const res = await imagePOST(post({}));
    expect(res.status).toBe(400);
    expect(generateDishImage).not.toHaveBeenCalled();
  });
});
