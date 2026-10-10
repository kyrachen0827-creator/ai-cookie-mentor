import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachHistoryItem } from "@/lib/agents/teacher/coach-types";
import { runCoach, urgentTurn, type CoachDeps, type CoachInput } from "@/lib/agents/teacher/coach";
import { turnToText } from "@/lib/agents/teacher/coach-text";
import type { Recipe } from "@/lib/data/types";

const eggRecipe: Recipe = {
  id: "r1",
  recipe_name: "Tomato Scrambled Eggs",
  difficulty_level: "新手",
  estimated_time_minutes: 12,
  required_tools: [],
  ingredients: [
    { name: "Egg", amount: "3" },
    { name: "Tomato", amount: "2" },
  ],
  steps: [
    { action: "Beat the eggs", minutes: 1, doneness_cue: "No white streaks" },
    { action: "Cut the tomato into wedges", minutes: 2, doneness_cue: "Even wedges" },
    { action: "Heat oil and scramble the eggs", heat: "Medium heat", minutes: 2, doneness_cue: "Edges set, centre still glossy" },
    { action: "Add the tomato and stir", heat: "Medium heat", minutes: 3, doneness_cue: "Tomato softens" },
  ],
  finished_dish_standard: "Golden eggs with soft tomato",
};

const chickenRecipe: Recipe = {
  ...eggRecipe,
  recipe_name: "Pan-Fried Chicken",
  ingredients: [{ name: "Chicken breast", amount: "2" }],
  steps: [
    { action: "Season the chicken", doneness_cue: "Even coating" },
    { action: "Pan-fry the chicken", heat: "Medium heat", minutes: 12, doneness_cue: "Golden outside" },
  ],
};

const riceRecipe: Recipe = {
  ...eggRecipe,
  recipe_name: "Fried Rice",
  ingredients: [{ name: "Rice", amount: "1 bowl" }, { name: "Scallion", amount: "2" }],
  steps: [
    { action: "Prep the scallion", doneness_cue: "Thin rings" },
    { action: "Fry the rice", heat: "Medium heat", minutes: 4, doneness_cue: "Grains separate" },
  ],
};

const advice = (stepRef: number, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    kind: "advise",
    step_ref: stepRef,
    known: ["You are on the scrambling step"],
    unknown: [],
    clarifying_question: null,
    actions: [
      { instruction: "Lower the heat to medium-low", look_for: "The sizzle quiets down" },
      { instruction: "Slide a spatula under the set edge", look_for: "The egg lifts in one piece" },
    ],
    safety_note: null,
    uncertainty_note: null,
    ...overrides,
  });

function makeDeps(responses: (string | Error)[], hasModel = true) {
  const generate = vi.fn<(prompt: string) => Promise<string>>();
  for (const r of responses) {
    if (r instanceof Error) generate.mockRejectedValueOnce(r);
    else generate.mockResolvedValueOnce(r);
  }
  const deps: CoachDeps = { generate, hasModel: () => hasModel };
  return { deps, generate };
}

const input = (overrides: Partial<CoachInput> = {}): CoachInput => ({
  recipe: eggRecipe,
  stepIndex: 2,
  question: "My eggs keep sticking to the pan, what do I do?",
  locale: "en",
  restrictions: [],
  history: [],
  ...overrides,
});

const user = (text: string): CoachHistoryItem => ({ role: "user", text });
const coach = (text: string, kind: "clarify" | "advise"): CoachHistoryItem => ({ role: "coach", text, kind });

const askedAboutPan: CoachHistoryItem[] = [
  user("My eggs keep sticking to the pan, what do I do?"),
  coach("Which kind of pan are you using?", "clarify"),
];

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("urgent situations bypass the model", () => {
  it("answers a pan fire with the fixed smother-don't-use-water steps", async () => {
    const { deps, generate } = makeDeps([]);
    const result = await runCoach(input({ question: "the oil caught fire!" }), deps);

    expect(result.source).toBe("emergency");
    expect(JSON.stringify(result.turn).toLowerCase()).toContain("lid");
    expect(generate).not.toHaveBeenCalled();
  });

  it("answers an injury with first aid, even with no AI key", async () => {
    const { deps, generate } = makeDeps([], false);
    const result = await runCoach(input({ question: "I burned my finger on the pan" }), deps);

    expect(result.source).toBe("injury");
    expect(generate).not.toHaveBeenCalled();
  });

  it("exposes urgentTurn for callers that must check it before anything else", () => {
    expect(urgentTurn("pan is on fire", 3, "en")?.source).toBe("emergency");
    expect(urgentTurn("How hot should the pan be?", 3, "en")).toBeNull();
  });
});

describe("the sticking-eggs scenario", () => {
  it("first asks the one question that changes the answer, without calling the model", async () => {
    const { deps, generate } = makeDeps([]);
    const result = await runCoach(input(), deps);

    expect(result.source).toBe("triage");
    expect(result.turn.kind).toBe("clarify");
    expect(result.turn.step_ref).toBe(3);
    expect(result.turn.clarifying_question).toMatch(/non-stick/i);
    expect(result.turn.actions).toEqual([]);
    expect(result.turn.safety_note).toMatch(/heat/i);
    expect(generate).not.toHaveBeenCalled();
  });

  it("asks in Chinese for a Chinese user", async () => {
    const { deps } = makeDeps([]);
    const result = await runCoach(input({ locale: "zh", question: "我的蛋一直黏在鍋子上" }), deps);

    expect(result.turn.clarifying_question).toMatch(/不沾鍋/);
  });

  it("skips the question when the user already said which pan", async () => {
    const { deps, generate } = makeDeps([advice(3)]);
    const result = await runCoach(input({ question: "My eggs stick to my non-stick pan" }), deps);

    expect(result.source).toBe("model");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("gives concrete advice after the user answers, grounded in the card and the history", async () => {
    const { deps, generate } = makeDeps([advice(3)]);
    const result = await runCoach(input({ question: "non-stick", history: askedAboutPan }), deps);

    expect(result.source).toBe("model");
    expect(result.turn.kind).toBe("advise");
    const prompt = generate.mock.calls[0][0];
    expect(prompt).toContain("silicone or wooden spatula"); // the card's non-stick advice
    expect(prompt).toContain("Which kind of pan are you using?"); // history is passed along
    expect(prompt).toContain("step 3");
  });

  it("never asks a second clarifying question on the same step", async () => {
    const unsureClarify = JSON.stringify({
      kind: "clarify",
      step_ref: 3,
      clarifying_question: "How much oil did you use?",
      actions: [],
    });
    const { deps, generate } = makeDeps([unsureClarify, advice(3, { uncertainty_note: "I don't know how much oil you used" })]);

    const result = await runCoach(input({ question: "I'm not sure", history: askedAboutPan }), deps);

    expect(result.turn.kind).toBe("advise");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toMatch(/already asked a clarifying question/);
  });
});

describe("validation, retry and fallback", () => {
  const nonStick = { question: "non-stick", history: askedAboutPan };

  it("retries once with the reason when the model returns broken JSON", async () => {
    const { deps, generate } = makeDeps(["Sure! here you go", advice(3)]);
    const result = await runCoach(input(nonStick), deps);

    expect(result.source).toBe("model");
    expect(result.attempts).toBe(2);
    expect(generate.mock.calls[1][0]).toMatch(/rejected/i);
  });

  it("retries when the answer is about the wrong step", async () => {
    const { deps, generate } = makeDeps([advice(2), advice(3)]);
    const result = await runCoach(input(nonStick), deps);

    expect(result.source).toBe("model");
    expect(generate.mock.calls[1][0]).toMatch(/step_ref must be 3/);
  });

  it("retries when the model pretends to see the pan", async () => {
    const seeing = advice(3, { known: ["I can see your pan is too hot"] });
    const { deps } = makeDeps([seeing, advice(3)]);
    const result = await runCoach(input(nonStick), deps);

    expect(result.source).toBe("model");
    expect(JSON.stringify(result.turn)).not.toMatch(/I can see/);
  });

  it("falls back to deterministic guidance when the model keeps breaking the rules", async () => {
    const skipAhead = advice(3, {
      actions: [{ instruction: "Skip to step 4 right away", look_for: "x" }],
    });
    const { deps, generate } = makeDeps([skipAhead, skipAhead]);

    const result = await runCoach(input(nonStick), deps);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback");
    expect(result.turn.uncertainty_note).toBeTruthy();
    expect(JSON.stringify(result.turn)).toContain("silicone or wooden spatula");
    expect(JSON.stringify(result.turn)).not.toMatch(/step 4/);
  });

  it("falls back when the model call keeps failing", async () => {
    const { deps } = makeDeps([new Error("429"), new Error("429")]);
    const result = await runCoach(input(nonStick), deps);

    expect(result.source).toBe("fallback");
    expect(result.turn.actions.length).toBeGreaterThan(0);
  });

  it("recovers when the first call fails and the second works", async () => {
    const { deps } = makeDeps([new Error("503"), advice(3)]);
    const result = await runCoach(input(nonStick), deps);

    expect(result.source).toBe("model");
  });

  it("uses the recipe's own guidance for the step when there is no AI key", async () => {
    const { deps, generate } = makeDeps([], false);
    const result = await runCoach(input({ question: "How hot should the pan be?" }), deps);

    expect(result.source).toBe("fallback");
    expect(generate).not.toHaveBeenCalled();
    const text = JSON.stringify(result.turn);
    expect(text).toContain("Heat oil and scramble the eggs");
    expect(text).toContain("Edges set, centre still glossy");
  });

  it("does not leak the user's question text into server logs", async () => {
    const { deps } = makeDeps([new Error("x"), new Error("x")]);
    await runCoach(input({ ...nonStick, question: "SECRET-QUESTION-TEXT non-stick" }), deps);

    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain("SECRET-QUESTION-TEXT");
  });
});

describe("allergies and dietary restrictions", () => {
  it("keeps restricted foods out of the playbook it sends to the model", async () => {
    const { deps, generate } = makeDeps([advice(2, { actions: [{ instruction: "Lower the heat", look_for: "Less sizzle" }] })]);

    await runCoach(
      input({
        recipe: riceRecipe,
        stepIndex: 1,
        restrictions: ["egg"],
        question: "the rice sticks to my non-stick pan",
      }),
      deps,
    );

    const prompt = generate.mock.calls[0][0];
    expect(prompt).toContain("egg");
    expect(prompt).toMatch(/avoids?[^\n]*egg|egg[^\n]*avoid/i);
    expect(prompt).not.toContain("Eggs release by themselves");
  });

  it("retries when the model suggests a restricted food", async () => {
    const bad = advice(2, { actions: [{ instruction: "Crack in some peanuts", look_for: "Crunch" }] });
    const good = advice(2, { actions: [{ instruction: "Lower the heat", look_for: "Less sizzle" }] });
    const { deps } = makeDeps([bad, good]);

    const result = await runCoach(
      input({ recipe: riceRecipe, stepIndex: 1, restrictions: ["peanut"], question: "how hot?" }),
      deps,
    );

    expect(result.source).toBe("model");
    expect(JSON.stringify(result.turn)).not.toMatch(/peanut/i);
  });

  it("does not put a restricted food in the fallback either", async () => {
    const { deps } = makeDeps([], false);
    const result = await runCoach(
      input({
        recipe: riceRecipe,
        stepIndex: 1,
        restrictions: ["egg"],
        question: "the rice sticks to my non-stick pan",
      }),
      deps,
    );

    expect(JSON.stringify(result.turn).toLowerCase()).not.toMatch(/\begg/);
  });
});

describe("doneness questions", () => {
  const ask = { recipe: chickenRecipe, stepIndex: 1, question: "Is the chicken cooked through?" };

  it("puts the matching reliable check into the prompt", async () => {
    const withCheck = advice(2, {
      actions: [{ instruction: "Check the thickest part reaches 74°C on a thermometer", look_for: "74°C" }],
    });
    const { deps, generate } = makeDeps([withCheck]);

    await runCoach(input(ask), deps);

    expect(generate.mock.calls[0][0]).toMatch(/74°C/);
  });

  it("rejects an answer that only says it looks done, then accepts one with a real check", async () => {
    const vague = advice(2, { actions: [{ instruction: "Cook it a few more minutes", look_for: "It looks done" }] });
    const reliable = advice(2, {
      actions: [{ instruction: "Cut the thickest part open", look_for: "No pink and the juices run clear" }],
    });
    const { deps, generate } = makeDeps([vague, reliable]);

    const result = await runCoach(input(ask), deps);

    expect(result.source).toBe("model");
    expect(result.attempts).toBe(2);
    expect(generate.mock.calls[1][0]).toMatch(/reliable check/i);
  });

  it("does not demand a temperature for a question that is not about doneness", async () => {
    const { deps } = makeDeps([advice(2)]);
    const result = await runCoach(input({ ...ask, question: "How hot should the pan be?" }), deps);

    expect(result.source).toBe("model");
    expect(result.attempts).toBe(1);
  });

  it("falls back to the class guidance, not a generic line, when the model never gives a check", async () => {
    const vague = advice(2, { actions: [{ instruction: "Cook a bit longer", look_for: "Looks done" }] });
    const { deps } = makeDeps([vague, vague]);

    const result = await runCoach(input(ask), deps);

    expect(result.source).toBe("fallback");
    expect(JSON.stringify(result.turn)).toMatch(/74°C/);
  });
});

describe("prompt and determinism", () => {
  it("states that the coach cannot see and must stay on the current step", async () => {
    const { deps, generate } = makeDeps([advice(3)]);
    await runCoach(input({ question: "how hot?" }), deps);

    const prompt = generate.mock.calls[0][0];
    expect(prompt).toMatch(/cannot see/i);
    expect(prompt).toMatch(/never promise that food is or will be safe/i);
    expect(prompt).toMatch(/current step/i);
    expect(prompt).toContain("Heat oil and scramble the eggs");
  });

  it("asks for Traditional Chinese output for Chinese users", async () => {
    const { deps, generate } = makeDeps([advice(3)]);
    await runCoach(input({ locale: "zh", question: "火要開多大？" }), deps);

    expect(generate.mock.calls[0][0]).toMatch(/Traditional Chinese/);
  });

  it("builds an identical prompt for an identical request", async () => {
    const a = makeDeps([advice(3)]);
    const b = makeDeps([advice(3)]);
    await runCoach(input({ question: "how hot?" }), a.deps);
    await runCoach(input({ question: "how hot?" }), b.deps);

    expect(a.generate.mock.calls[0][0]).toBe(b.generate.mock.calls[0][0]);
  });
});

describe("turnToText", () => {
  it("renders a clarify turn as its question", async () => {
    const { deps } = makeDeps([]);
    const { turn } = await runCoach(input(), deps);
    expect(turnToText(turn, "en")).toContain("non-stick");
  });

  it("renders actions as a numbered list with what to look for", () => {
    const text = turnToText(
      {
        kind: "advise",
        step_ref: 3,
        known: [],
        unknown: ["The oil amount"],
        clarifying_question: null,
        actions: [{ instruction: "Lower the heat", heat: "Low heat", minutes: 1, look_for: "Less sizzle" }],
        safety_note: "Hot pan",
        uncertainty_note: "Not fully sure",
      },
      "en",
    );
    expect(text).toContain("1. Lower the heat (Low heat, ~1 min) — Look for: Less sizzle");
    expect(text).toContain("Careful: Hot pan");
    expect(text).toContain("Not sure about: The oil amount");
    expect(text).toContain("Not fully sure");
  });
});

describe("measuring each model attempt (used by the evaluation)", () => {
  it("reports every attempt with its raw output, format result and guardrail violations", async () => {
    const { deps } = makeDeps(["not json at all", advice(4), advice(3)]);
    const attempts: unknown[] = [];
    const result = await runCoach(
      input({ history: [...askedAboutPan, user("non-stick")], question: "non-stick" }),
      { ...deps, onAttempt: (a) => attempts.push(a) },
    );

    expect(result.source).toBe("fallback");
    expect(attempts).toEqual([
      { raw: "not json at all", formatOk: false, violations: [] },
      { raw: advice(4), formatOk: true, violations: ["STEP_MISMATCH"] },
    ]);
  });

  it("reports a failed model call as an attempt with no output", async () => {
    const { deps } = makeDeps([new Error("timeout"), advice(3)]);
    const attempts: unknown[] = [];
    const result = await runCoach(
      input({ history: [...askedAboutPan], question: "non-stick" }),
      { ...deps, onAttempt: (a) => attempts.push(a) },
    );

    expect(result.source).toBe("model");
    expect(attempts).toEqual([
      { raw: null, formatOk: false, violations: [] },
      { raw: advice(3), formatOk: true, violations: [] },
    ]);
  });
});
