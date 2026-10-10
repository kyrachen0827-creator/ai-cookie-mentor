import { describe, expect, it } from "vitest";
import {
  COACH_LIMITS,
  extractJsonObject,
  parseCoachTurn,
  trimHistory,
  turnTexts,
} from "@/lib/agents/teacher/coach-types";

const validAdvise = {
  kind: "advise",
  step_ref: 3,
  known: ["You are on step 3: scramble the eggs", "Medium heat"],
  unknown: ["Pan type"],
  clarifying_question: null,
  actions: [
    { instruction: "Lower the heat to low", heat: "Low heat", look_for: "The sizzling quiets down" },
    { instruction: "Add 1 tsp oil along the edge", minutes: 1 },
  ],
  safety_note: "Keep your hand away from the hot pan",
  uncertainty_note: null,
};

describe("parseCoachTurn", () => {
  it("accepts a well-formed advise turn", () => {
    const result = parseCoachTurn(validAdvise);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.kind).toBe("advise");
      expect(result.turn.actions).toHaveLength(2);
      expect(result.turn.actions[0].look_for).toBe("The sizzling quiets down");
    }
  });

  it("accepts a clarify turn with one question and no actions", () => {
    const result = parseCoachTurn({
      kind: "clarify",
      step_ref: 3,
      known: [],
      unknown: ["Pan type"],
      clarifying_question: "Is your pan non-stick?",
      actions: [],
      safety_note: null,
      uncertainty_note: null,
    });
    expect(result.ok).toBe(true);
  });

  it("treats missing optional lists as empty", () => {
    const result = parseCoachTurn({ kind: "advise", step_ref: 1, actions: [{ instruction: "Stir" }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.turn.known).toEqual([]);
      expect(result.turn.safety_note).toBeNull();
    }
  });

  it("drops unknown fields so only the schema reaches the user", () => {
    const result = parseCoachTurn({ ...validAdvise, secret: "ignore me" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn).not.toHaveProperty("secret");
  });

  it.each([
    ["not an object", "hello"],
    ["an array", []],
    ["null", null],
    ["a bad kind", { ...validAdvise, kind: "refuse" }],
    ["a missing kind", { ...validAdvise, kind: undefined }],
    ["a non-integer step_ref", { ...validAdvise, step_ref: 2.5 }],
    ["a zero step_ref", { ...validAdvise, step_ref: 0 }],
    ["actions that is not an array", { ...validAdvise, actions: "do things" }],
    ["an action without instruction", { ...validAdvise, actions: [{ look_for: "x" }] }],
    ["an action with negative minutes", { ...validAdvise, actions: [{ instruction: "x", minutes: -1 }] }],
    ["known containing a number", { ...validAdvise, known: [1] }],
    ["a question that is a number", { ...validAdvise, clarifying_question: 5 }],
  ])("rejects %s", (_label, input) => {
    expect(parseCoachTurn(input).ok).toBe(false);
  });

  it("rejects over-long fields instead of silently cutting them", () => {
    const tooLong = "x".repeat(COACH_LIMITS.noteChars + 1);
    expect(parseCoachTurn({ ...validAdvise, safety_note: tooLong }).ok).toBe(false);
  });

  it("rejects too many actions", () => {
    const actions = Array.from({ length: COACH_LIMITS.actions + 1 }, () => ({ instruction: "Stir" }));
    expect(parseCoachTurn({ ...validAdvise, actions }).ok).toBe(false);
  });

  it("reports why it failed so the retry prompt can mention it", () => {
    const result = parseCoachTurn({ ...validAdvise, kind: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/kind/);
  });
});

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("tolerates code fences and surrounding chatter", () => {
    expect(extractJsonObject('Sure!\n```json\n{"a":1}\n```\nHope it helps')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => extractJsonObject("{a:1}")).toThrow();
  });
});

describe("turnTexts", () => {
  it("collects every user-visible string for scanning", () => {
    const result = parseCoachTurn(validAdvise);
    if (!result.ok) throw new Error("fixture should be valid");
    const texts = turnTexts(result.turn);
    expect(texts).toContain("Lower the heat to low");
    expect(texts).toContain("The sizzling quiets down");
    expect(texts).toContain("Keep your hand away from the hot pan");
  });
});

describe("trimHistory", () => {
  const u = (text: string) => ({ role: "user" as const, text });
  const advise = (text: string) => ({ role: "coach" as const, text, kind: "advise" as const });
  const clarify = (text: string) => ({ role: "coach" as const, text, kind: "clarify" as const });

  it("returns the history unchanged when it fits", () => {
    const items = [u("eggs sticking"), clarify("Which pan?")];
    expect(trimHistory(items)).toEqual(items);
  });

  it("keeps only the most recent items when no clarify was asked", () => {
    const items = Array.from({ length: 12 }, (_, i) => (i % 2 ? advise(`a${i}`) : u(`q${i}`)));
    expect(trimHistory(items)).toEqual(items.slice(-COACH_LIMITS.historyItems));
  });

  it("keeps the clarify exchange so the coach never re-asks it after a long chat", () => {
    const items = [
      u("eggs sticking"),
      clarify("Which pan?"),
      u("Non-stick"),
      advise("Lower the heat"),
      u("q3"), advise("a3"),
      u("q4"), advise("a4"),
      u("q5"), advise("a5"),
    ];
    const kept = trimHistory(items);
    expect(kept).toHaveLength(COACH_LIMITS.historyItems);
    expect(kept.slice(0, 3)).toEqual(items.slice(0, 3));
    expect(kept.at(-1)).toEqual(advise("a5"));
  });
});

describe("format error messages (sent back to the model on retry)", () => {
  it("shows the expected action shape when actions are plain strings, as seen with real Chinese replies", () => {
    const result = parseCoachTurn({ ...validAdvise, actions: ["將飯在鍋中鋪平", "加入蔥花"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain('{"instruction": "...", "look_for": "..."}');
  });
});
