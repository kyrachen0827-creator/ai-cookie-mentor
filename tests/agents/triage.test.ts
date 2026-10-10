import { describe, expect, it } from "vitest";
import type { CoachHistoryItem } from "@/lib/agents/teacher/coach-types";
import {
  clarifyTurn,
  detectEmergency,
  detectInjury,
  emergencyTurn,
  hasAskedToClarify,
  injuryTurn,
  triage,
} from "@/lib/agents/teacher/triage";
import { isDonenessQuestion, relevantDonenessClasses } from "@/lib/agents/teacher/doneness";

const user = (text: string): CoachHistoryItem => ({ role: "user", text });
const coach = (text: string, kind: "clarify" | "advise"): CoachHistoryItem => ({
  role: "coach",
  text,
  kind,
});

describe("triage — recognising a known cooking problem", () => {
  it.each([
    ["My eggs keep sticking to the pan", "sticking"],
    ["the egg is stuck on the bottom, what now?", "sticking"],
    ["我的蛋一直黏在鍋子上，現在怎麼辦？", "sticking"],
    ["蛋沾鍋了", "sticking"],
    ["It smells burnt and there is smoke", "burning"],
    ["鍋底燒焦了", "burning"],
    ["The tomatoes released way too much water", "watery"],
    ["出水太多了", "watery"],
    ["I added too much salt, it is too salty", "salty"],
    ["我加太多鹽了，太鹹", "salty"],
  ])("%s -> %s", (question, cardId) => {
    expect(triage(question, [])?.card.id).toBe(cardId);
  });

  it("returns null when the question is not a known problem", () => {
    expect(triage("How hot should the pan be?", [])).toBeNull();
    expect(triage("火要開多大？", [])).toBeNull();
  });

  it.each([
    "I'm stuck, how hot should the pan be?",
    "Is it okay to stick to medium heat?",
    "Can I stick with this recipe?",
    "鍋子裡的醬汁太黏了",
    "湯汁變黏稠了怎麼辦",
    "I burned my finger on the pan",
  ])("does not mistake %s for a cooking problem", (question) => {
    expect(triage(question, [])).toBeNull();
  });
});

describe("triage — following up after a clarifying question", () => {
  const askedAboutPan: CoachHistoryItem[] = [
    user("my eggs keep sticking to the pan"),
    coach("Which kind of pan are you using?", "clarify"),
  ];

  it.each(["non-stick", "stainless steel", "不沾鍋", "It's a cast iron pan"])(
    "keeps the sticking card when the user just answers '%s'",
    (answer) => {
      const result = triage(answer, askedAboutPan);
      expect(result?.card.id).toBe("sticking");
      expect(result?.missingFact).toBeNull();
    },
  );

  it("stays on the card but still asks if the answer did not contain the missing fact", () => {
    expect(triage("I'm not sure", askedAboutPan)?.missingFact?.id).toBe("pan_type");
  });

  it.each(["How much salt should I add?", "要加多少鹽？", "what temperature for the butter"])(
    "does not answer a new question '%s' with the old card, even right after the clarify",
    (question) => {
      expect(triage(question, askedAboutPan)).toBeNull();
    },
  );

  it("still treats a question-shaped reply as an answer when it names the missing fact", () => {
    expect(triage("Is non-stick okay?", askedAboutPan)?.card.id).toBe("sticking");
  });

  it("does not drag a later, unrelated question back to the old card", () => {
    const afterAdvice = [...askedAboutPan, user("non-stick"), coach("Lower the heat...", "advise")];
    expect(triage("How hot should the pan be?", afterAdvice)).toBeNull();
  });
});

describe("injury detection", () => {
  it.each([
    "I burned my finger on the pan",
    "I just cut myself with the knife",
    "oil splashed and scalded my hand",
    "我的手被燙到了",
    "切到手了怎麼辦",
  ])("flags %s", (text) => {
    expect(detectInjury(text)).toBe(true);
  });

  it.each([
    "The eggs burned on the bottom",
    "How do I cut an onion?",
    "蛋燒焦了",
  ])("does not flag cooking talk: %s", (text) => {
    expect(detectInjury(text)).toBe(false);
  });

  it("gives first aid, says it is general guidance, and never tells the user to keep cooking", () => {
    const turn = injuryTurn(2, "en");
    const text = JSON.stringify(turn).toLowerCase();
    expect(turn.step_ref).toBe(2);
    expect(text).toContain("running water");
    expect(text).toMatch(/medical|doctor/);
    expect(text).not.toMatch(/keep cooking|continue cooking/);
    expect(turn.uncertainty_note).toMatch(/not medical advice/i);
  });

  it("has a Chinese version", () => {
    const text = JSON.stringify(injuryTurn(2, "zh"));
    expect(text).toContain("流動的冷水");
    expect(text).toContain("就醫");
  });
});

describe("triage — which key fact is still unknown", () => {
  it("asks about the pan when sticking is reported and the pan type was never mentioned", () => {
    const result = triage("My eggs keep sticking", []);
    expect(result?.missingFact?.id).toBe("pan_type");
  });

  it("does not ask when the question already says the pan type", () => {
    expect(triage("my eggs stick to my non-stick pan", [])?.missingFact).toBeNull();
    expect(triage("蛋黏在不鏽鋼鍋上", [])?.missingFact).toBeNull();
  });

  it("uses what the user said earlier on the same step", () => {
    const history = [user("It's a stainless steel pan"), coach("Got it", "advise")];
    expect(triage("it is still stuck", history)?.missingFact).toBeNull();
  });

  it("ignores the coach's own words when deciding what the user told us", () => {
    const history = [coach("Is it a non-stick pan?", "clarify")];
    expect(triage("eggs stick to the pan", history)?.missingFact?.id).toBe("pan_type");
  });

  it("has no required fact for problems that do not need one", () => {
    expect(triage("it is too salty", [])?.missingFact).toBeNull();
  });
});

describe("hasAskedToClarify", () => {
  it("is true once the coach asked a clarifying question on this step", () => {
    expect(hasAskedToClarify([user("x"), coach("Which pan?", "clarify")])).toBe(true);
  });

  it("is false for no history or advice-only history", () => {
    expect(hasAskedToClarify([])).toBe(false);
    expect(hasAskedToClarify([coach("Do this", "advise")])).toBe(false);
  });
});

describe("clarifyTurn", () => {
  const result = triage("My eggs keep sticking", [])!;

  it("builds a single-question clarify turn without actions", () => {
    const turn = clarifyTurn(result, 3, "en", "Scramble the eggs");
    expect(turn.kind).toBe("clarify");
    expect(turn.step_ref).toBe(3);
    expect(turn.actions).toEqual([]);
    expect(turn.clarifying_question?.match(/[?？]/g)).toHaveLength(1);
    expect(turn.unknown.length).toBeGreaterThan(0);
  });

  it("offers tap-to-answer choices so a cook with wet hands does not have to type", () => {
    const en = clarifyTurn(result, 3, "en", "x").suggested_answers;
    const zh = clarifyTurn(result, 3, "zh", "x").suggested_answers;
    expect(en).toEqual(["Non-stick", "Stainless steel", "Cast iron / carbon steel"]);
    expect(zh).toEqual(["不沾鍋", "不鏽鋼鍋", "鐵鍋／鑄鐵鍋"]);
  });

  it("makes every suggested answer actually answer the question it belongs to", () => {
    const fact = result.missingFact!;
    for (const answer of clarifyTurn(result, 3, "en", "x").suggested_answers ?? []) {
      expect(fact.answeredBy.test(answer)).toBe(true);
    }
    for (const answer of clarifyTurn(result, 3, "zh", "x").suggested_answers ?? []) {
      expect(fact.answeredBy.test(answer)).toBe(true);
    }
  });

  it("gives a holding instruction while waiting for the answer", () => {
    expect(clarifyTurn(result, 3, "en", "x").safety_note).toMatch(/heat/i);
  });

  it("speaks Chinese when asked to", () => {
    const turn = clarifyTurn(result, 3, "zh", "炒蛋");
    expect(turn.clarifying_question).toMatch(/鍋/);
    expect(turn.safety_note).toMatch(/火/);
  });
});

describe("emergency detection", () => {
  it.each([
    "my pan is on fire",
    "the oil caught fire!",
    "there are flames coming from the pan",
    "鍋子起火了",
    "油鍋著火了怎麼辦",
    "鍋裡冒出火焰",
  ])("flags %s", (text) => {
    expect(detectEmergency(text)).toBe(true);
  });

  it.each([
    "要開大火還是中火？",
    "Should I use high fire or low fire?",
    "turn up the heat to high",
    "How do I light the stove",
    "Should I cook on a low flame?",
    "Do I turn the flame down now?",
    "The flames on my gas stove are blue, is that normal?",
    "火焰要開多大？",
  ])("does not flag ordinary heat talk: %s", (text) => {
    expect(detectEmergency(text)).toBe(false);
  });

  it("answers with smother-don't-use-water guidance and tells the user to leave if it spreads", () => {
    const turn = emergencyTurn(2, "en");
    const text = JSON.stringify(turn).toLowerCase();
    expect(turn.step_ref).toBe(2);
    expect(text).toContain("lid");
    expect(text).toMatch(/not.*water|never.*water|don't.*water/);
    expect(text).toMatch(/emergency|119/);
  });

  it("has a Chinese version", () => {
    const text = JSON.stringify(emergencyTurn(2, "zh"));
    expect(text).toContain("鍋蓋");
    expect(text).toContain("119");
  });
});

describe("knowledge card content", () => {
  it("covers both pan families for sticking, since the remedy differs", () => {
    const card = triage("eggs stick", [])!.card;
    const text = card.playbook.en.join(" ").toLowerCase();
    expect(text).toContain("non-stick");
    expect(text).toContain("stainless");
  });
});

describe("doneness policy", () => {
  it.each([
    ["Is the chicken cooked through?", true],
    ["怎麼看雞肉熟了沒", true],
    ["is it still raw in the middle", true],
    ["Is the chicken done?", true],
    ["How do I know when it's done", true],
    ["is it done yet", true],
    ["How hot should the pan be?", false],
    ["蛋黏鍋怎麼辦", false],
    ["I'm done chopping, what's next?", false],
    ["Once I'm done stirring, do I turn off the heat?", false],
  ])("isDonenessQuestion(%s) = %s", (question, expected) => {
    expect(isDonenessQuestion(question)).toBe(expected);
  });

  it.each([
    ["shellfish", "Shrimp", "open the lid and set the timer", false],
    ["shellfish", "Shrimp", "The shrimp turn pink-white and curl into a C", true],
    ["shellfish", "Clams", "Cook until the shells open and discard any that stay closed", true],
    ["whole_cut", "Pork chop", "this is interesting, cook until golden", false],
    ["whole_cut", "Pork chop", "Rest it for 3 minutes after reaching 63°C", true],
    ["ground_meat", "Ground beef", "cut the onion first", false],
    ["ground_meat", "Ground beef", "Cut a patty open: no pink in the middle", true],
    ["poultry", "Chicken", "cut the chicken into 1cm cubes", false],
    ["poultry", "Chicken", "Cut the thickest part open and check the juices", true],
    ["egg", "Egg", "set the timer for 2 minutes", false],
    ["egg", "Egg", "Cook until the eggs are set and nothing is runny", true],
  ])("%s markers for %s vs '%s' = %s", (classId, ingredient, text, expected) => {
    const cls = relevantDonenessClasses({
      recipe_name: "x",
      ingredients: [{ name: ingredient }],
    }).find((c) => c.id === classId)!;
    expect(cls.markers.test(text)).toBe(expected);
  });

  const recipeWith = (...names: string[]) => ({
    recipe_name: "Test dish",
    ingredients: names.map((name) => ({ name })),
  });
  const ids = (names: string[]) =>
    relevantDonenessClasses(recipeWith(...names)).map((c) => c.id);

  it("picks the class that matches the ingredient, not one rule for everything", () => {
    expect(ids(["Chicken breast"])).toContain("poultry");
    expect(ids(["Ground beef"])).toEqual(expect.arrayContaining(["ground_meat", "whole_cut"]));
    expect(ids(["Salmon fillet"])).toContain("fish");
    expect(ids(["Shrimp"])).toContain("shellfish");
    expect(ids(["Egg"])).toContain("egg");
  });

  it("does not treat Chinese egg names as poultry", () => {
    expect(ids(["雞蛋"])).toContain("egg");
    expect(ids(["雞蛋"])).not.toContain("poultry");
  });

  it("does not treat milk as beef", () => {
    expect(ids(["牛奶"])).not.toContain("whole_cut");
  });

  it("returns nothing for a vegetable-only recipe", () => {
    expect(ids(["Tomato", "Rice"])).toEqual([]);
  });

  it("uses different reliable checks per class", () => {
    const poultry = relevantDonenessClasses(recipeWith("Chicken"))[0];
    const fish = relevantDonenessClasses(recipeWith("Salmon"))[0];
    expect(poultry.guidance.en).toMatch(/74/);
    expect(fish.guidance.en).toMatch(/flake|opaque/i);
    expect(poultry.markers.test("Cut it open: no pink, juices run clear")).toBe(true);
    expect(poultry.markers.test("Cook until golden brown")).toBe(false);
    expect(fish.markers.test("It should flake easily with a fork")).toBe(true);
  });
});
