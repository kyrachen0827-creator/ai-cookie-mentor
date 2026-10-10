import { describe, expect, it } from "vitest";
import type { CoachTurn } from "@/lib/agents/teacher/coach-types";
import {
  checkCoachTurn,
  describeViolations,
  type GuardContext,
  type ViolationCode,
} from "@/lib/agents/teacher/guardrails";

const ctx = (overrides: Partial<GuardContext> = {}): GuardContext => ({
  stepNumber: 3,
  restrictions: [],
  mustClarify: false,
  clarifyAllowed: true,
  donenessMarkers: [],
  ...overrides,
});

const advise = (overrides: Partial<CoachTurn> = {}): CoachTurn => ({
  kind: "advise",
  step_ref: 3,
  known: ["You are on step 3"],
  unknown: [],
  clarifying_question: null,
  actions: [
    { instruction: "Lower the heat to low", look_for: "The sizzling quiets down" },
    { instruction: "Add 1 tsp oil along the edge" },
  ],
  safety_note: null,
  uncertainty_note: null,
  ...overrides,
});

const clarify = (overrides: Partial<CoachTurn> = {}): CoachTurn => ({
  kind: "clarify",
  step_ref: 3,
  known: [],
  unknown: ["Pan type"],
  clarifying_question: "Is your pan non-stick?",
  actions: [],
  safety_note: null,
  uncertainty_note: null,
  ...overrides,
});

const codes = (turn: CoachTurn, c: GuardContext = ctx()): ViolationCode[] =>
  checkCoachTurn(turn, c).map((v) => v.code);

describe("a good turn", () => {
  it("passes an advise turn", () => {
    expect(codes(advise())).toEqual([]);
  });

  it("passes a clarify turn", () => {
    expect(codes(clarify())).toEqual([]);
  });

  it("does not demand numbers: advice with a visible cue and no figures is fine", () => {
    const turn = advise({
      actions: [{ instruction: "Slide a spatula under the edge", look_for: "The egg lifts in one piece" }],
    });
    expect(codes(turn)).toEqual([]);
  });

  it("allows saying what the finished food looks like", () => {
    const turn = advise({
      actions: [{ instruction: "Fold gently", look_for: "The eggs look like soft, glossy curds" }],
    });
    expect(codes(turn)).toEqual([]);
  });
});

describe("step consistency", () => {
  it("rejects an answer about a different step", () => {
    expect(codes(advise({ step_ref: 2 }))).toContain("STEP_MISMATCH");
  });

  it.each([
    "Then move on to step 5",
    "Skip ahead to Step 4 and add the sauce",
    "接著直接做第 4 步",
  ])("rejects telling the user to jump ahead: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "x" }] });
    expect(codes(turn)).toContain("SKIPS_AHEAD");
  });

  it.each([
    "直接做第四步",
    "先跳到第五步",
    "接著做第十二步",
    "請改做步驟 4",
    "請改做步驟五",
  ])("rejects telling the user to jump ahead, including Chinese numerals: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "x" }] });
    expect(codes(turn)).toContain("SKIPS_AHEAD");
  });

  it.each(["回到第二步確認", "第三步先不要加鹽", "參考步驟一"])(
    "allows Chinese references to the current or an earlier step: %s",
    (instruction) => {
      const turn = advise({ actions: [{ instruction, look_for: "x" }] });
      expect(codes(turn)).not.toContain("SKIPS_AHEAD");
    },
  );

  it.each(["Re-read step 2 if unsure", "As in step 3, keep medium heat", "回到第 2 步確認"])(
    "allows referring to the current or an earlier step: %s",
    (instruction) => {
      const turn = advise({ actions: [{ instruction, look_for: "x" }] });
      expect(codes(turn)).not.toContain("SKIPS_AHEAD");
    },
  );
});

describe("clarifying questions", () => {
  it("rejects a clarify turn with two questions", () => {
    const turn = clarify({ clarifying_question: "Which pan? How much oil?" });
    expect(codes(turn)).toContain("CLARIFY_SHAPE");
  });

  it("rejects a clarify turn without a question", () => {
    expect(codes(clarify({ clarifying_question: null }))).toContain("CLARIFY_SHAPE");
  });

  it("rejects a clarify turn that also hands out actions", () => {
    const turn = clarify({ actions: [{ instruction: "Stir", look_for: "x" }] });
    expect(codes(turn)).toContain("CLARIFY_SHAPE");
  });

  it("rejects asking again once a clarification was already asked", () => {
    expect(codes(clarify(), ctx({ clarifyAllowed: false }))).toContain("CLARIFY_NOT_ALLOWED");
  });

  it("rejects advising when a critical fact is still missing and we may still ask", () => {
    expect(codes(advise(), ctx({ mustClarify: true }))).toContain("MUST_CLARIFY");
  });

  it("accepts a Chinese full-width question mark", () => {
    expect(codes(clarify({ clarifying_question: "你用的是不沾鍋嗎？" }))).toEqual([]);
  });
});

describe("advice shape", () => {
  it("rejects advice with no action", () => {
    expect(codes(advise({ actions: [] }))).toContain("ADVISE_SHAPE");
  });

  it("rejects advice that still carries a question", () => {
    expect(codes(advise({ clarifying_question: "Anything else?" }))).toContain("ADVISE_SHAPE");
  });

  it("rejects advice where nothing tells the user how to tell it worked", () => {
    const turn = advise({ actions: [{ instruction: "Lower the heat" }] });
    expect(codes(turn)).toContain("ADVISE_SHAPE");
  });
});

describe("not pretending to see", () => {
  it.each([
    "I can see your pan is too hot",
    "I see that the egg has burnt",
    "From your photo, the oil looks low",
    "It looks like your pan is not preheated",
    "我看到鍋子太熱了",
    "從照片看來火太大",
    "看起來你的油太少",
  ])("rejects: %s", (text) => {
    const turn = advise({ known: [text] });
    expect(codes(turn)).toContain("CLAIMS_TO_SEE");
  });
});

describe("allergies and dietary restrictions", () => {
  const restricted = ctx({ restrictions: ["peanut", "海鮮"] });

  it("rejects mentioning a restricted food", () => {
    const turn = advise({ actions: [{ instruction: "Toss in some peanuts", look_for: "Crunchy" }] });
    expect(codes(turn, restricted)).toContain("RESTRICTED_FOOD");
  });

  it("rejects a restricted food hidden in the safety note", () => {
    expect(codes(advise({ safety_note: "可以加蝦仁" }), restricted)).toContain("RESTRICTED_FOOD");
  });

  it("allows a clean turn", () => {
    expect(codes(advise(), restricted)).toEqual([]);
  });

  it("rejects calling something safe for a user with restrictions", () => {
    const turn = advise({ safety_note: "The soy sauce is safe for you." });
    expect(codes(turn, restricted)).toContain("SAFETY_CLAIM");
  });

  it("does not object to the ordinary word 'safely' in cooking advice", () => {
    const turn = advise({
      actions: [{ instruction: "Safely slide the eggs onto a plate", look_for: "They release freely" }],
    });
    expect(codes(turn, restricted)).toEqual([]);
  });

  it("keeps the casual Chinese reassurances for restricted users only", () => {
    const turn = advise({ safety_note: "這個沒問題，可以放心用" });
    expect(codes(turn, restricted)).toContain("SAFETY_CLAIM");
    expect(codes(turn)).toEqual([]);
  });
});

describe("never promising that food is safe (applies to everyone)", () => {
  it.each([
    "They will finish cooking to a safe, firm state.",
    "This is safe to eat.",
    "It'll be safe once it is hot.",
    "Once the sauce boils the eggs are safe.",
    "這樣吃保證安全",
    "這樣處理過後是安全的",
  ])("rejects: %s", (text) => {
    expect(codes(advise({ safety_note: text }))).toContain("SAFETY_CLAIM");
  });

  it.each([
    "To be safe, check the label.",
    "Heat it to a safe internal temperature of 74°C.",
    "Safely slide the eggs onto a plate.",
    "Use a thermometer to check the thickest part reaches 74°C.",
  ])("allows ordinary safety advice: %s", (text) => {
    expect(codes(advise({ safety_note: text }))).toEqual([]);
  });
});

describe("doneness and food safety", () => {
  const poultryMarkers = [/74\s*°?\s*c|165\s*°?\s*f|thermometer|cut|no pink|juices/i];
  const needsCheck = ctx({ donenessMarkers: poultryMarkers });

  it("rejects advice that gives no reliable check when the question is about doneness", () => {
    const turn = advise({
      actions: [{ instruction: "Cook it a bit longer", look_for: "It looks done" }],
    });
    expect(codes(turn, needsCheck)).toContain("DONENESS_CHECK_MISSING");
  });

  it("accepts a temperature or a cut-open check", () => {
    const withTemp = advise({
      actions: [{ instruction: "Check the thickest part reaches 74°C on a thermometer", look_for: "74°C" }],
    });
    const withCut = advise({
      actions: [{ instruction: "Cut the thickest part open", look_for: "No pink, juices run clear" }],
    });
    expect(codes(withTemp, needsCheck)).toEqual([]);
    expect(codes(withCut, needsCheck)).toEqual([]);
  });

  it("does not demand a figure when the question is not about doneness", () => {
    expect(codes(advise(), ctx({ donenessMarkers: [] }))).toEqual([]);
  });

  it("lets the coach ask a clarifying question about doneness first", () => {
    expect(codes(clarify({ clarifying_question: "Which part are you checking?" }), needsCheck)).toEqual([]);
  });
});

describe("describeViolations", () => {
  it("summarises every violation for the retry prompt", () => {
    const text = describeViolations(
      checkCoachTurn(advise({ step_ref: 1, actions: [] }), ctx()),
    );
    expect(text).toMatch(/step/i);
    expect(text).toMatch(/action/i);
  });

  it("is empty when there are no violations", () => {
    expect(describeViolations([])).toBe("");
  });
});

// 以下案例取自真實模型評估（docs/eval）：正確的回答被護欄誤擋，導致一律退回備援。
describe("false positives found by the real-model evaluation", () => {
  const peanut = ctx({ restrictions: ["peanut"] });
  const peanutZh = ctx({ restrictions: ["花生"] });

  it.each([
    "Gently scramble the eggs until the edges are set before moving to step 4.",
    "Stay on step 3 for now; don't skip to step 4 yet.",
    "Finish this step first, then step 4 will go quickly.",
    "先把蛋炒好，再進行第 4 步",
    "第 4 步之前，蛋要先炒到邊緣凝固",
    "先別跳到第四步",
  ])("allows refusing to skip or sequencing the next step: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "Edges set" }] });
    expect(codes(turn)).not.toContain("SKIPS_AHEAD");
  });

  it.each(["Sure, skip to step 4 and add the tomato", "You can go straight to step 4"])(
    "still rejects actually skipping ahead: %s",
    (instruction) => {
      const turn = advise({ actions: [{ instruction, look_for: "x" }] });
      expect(codes(turn)).toContain("SKIPS_AHEAD");
    },
  );

  it.each([
    "If you buy any packaged toppings for extra crunch, check the label to make sure they are peanut-free.",
    "Check the package labels carefully to ensure they do not contain peanuts.",
    "User has a peanut allergy",
    "User avoids peanuts",
    "Only use toppings that are free of peanuts.",
    "If you have plain, non-peanut seeds or toasted sesame seeds, sprinkle them in.",
  ])("allows warning about the restricted food: %s", (note) => {
    expect(codes(advise({ safety_note: note }), peanut)).not.toContain("RESTRICTED_FOOD");
  });

  it.each([
    "請務必先確認包裝標示，確保不含花生成分。",
    "請自行確認包裝標籤以確保不含過敏原（花生）。",
    "使用者對花生過敏",
    "使用者避開花生",
  ])("allows Chinese warnings about the restricted food: %s", (note) => {
    expect(codes(advise({ safety_note: note }), peanutZh)).not.toContain("RESTRICTED_FOOD");
  });

  it.each([
    "Add a handful of roasted peanuts for crunch",
    "Stir in peanut butter, then check the label",
    "Top with crushed peanuts if you are not allergic",
    "撒一點花生碎增加口感",
  ])("still rejects suggesting the restricted food: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "Crunchy" }] });
    expect(codes(turn, ctx({ restrictions: ["peanut", "花生"] }))).toContain("RESTRICTED_FOOD");
  });

  it.each([
    "Check all package labels on any optional toppings to ensure they are safe for your specific dietary needs.",
    "Make sure they are safe for your dietary needs by reading the label.",
    "Verify that it is safe with a thermometer: 74°C in the thickest part.",
    "請確認是安全的成分再加入",
  ])("treats asking the user to verify safety as advice, not a promise: %s", (note) => {
    expect(codes(advise({ safety_note: note }))).not.toContain("SAFETY_CLAIM");
    expect(codes(advise({ safety_note: note }), peanut)).not.toContain("SAFETY_CLAIM");
  });
});

describe("skip-ahead check looks at what the user is told to do, not the restated request", () => {
  it("allows 'known' to record that the user asked to skip (real model output)", () => {
    const turn = advise({
      known: ["User is on step 3", "User wants to skip step 3 and go straight to step 4"],
      unknown: ["Whether the eggs are already in the pan"],
    });
    expect(codes(turn)).not.toContain("SKIPS_AHEAD");
  });

  it("still checks the actions, safety note and uncertainty note", () => {
    expect(codes(advise({ safety_note: "Go ahead to step 4" }))).toContain("SKIPS_AHEAD");
    expect(codes(advise({ uncertainty_note: "You could also jump to step 5" }))).toContain("SKIPS_AHEAD");
  });
});

// Stage D code review：放寬誤擋時不能開出漏洞
describe("relaxations must not let real violations through", () => {
  const peanuts = ctx({ restrictions: ["peanut", "花生"] });

  it.each([
    "避免口感單調可加花生碎",
    "可以撒點花生碎吃了也不會過敏",
    "To avoid soggy peanuts, toast them and toss them in",
    "Without much effort, peanuts add crunch",
  ])("still rejects a restricted food near a negation word: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "Crunchy" }] });
    expect(codes(turn, peanuts)).toContain("RESTRICTED_FOOD");
  });

  it.each([
    "First, skip ahead to step 5 and add the sauce.",
    "Before anything else, jump to step 4.",
    "先把火關小，再直接跳到第 4 步",
    "Don't wait, skip to step 4.",
  ])("still rejects skipping ahead even with a sequencing word: %s", (instruction) => {
    const turn = advise({ actions: [{ instruction, look_for: "x" }] });
    expect(codes(turn)).toContain("SKIPS_AHEAD");
  });

  it.each([
    "You don't need to check — it's safe to eat.",
    "Once you check the colour, it is safe to eat.",
    "No need to make sure, it is safe.",
  ])("still rejects a safety promise near a verification word: %s", (note) => {
    expect(codes(advise({ safety_note: note }))).toContain("SAFETY_CLAIM");
  });
});

describe("real outputs replayed after tightening (must still pass)", () => {
  it.each([
    "Always check package labels to verify ingredients are safe for your specific food avoidances",
    "check all package labels yourself to verify they are safe for your dietary needs",
    "Check your package labels for any extra crunch toppings you might have, like toasted sesame seeds, making sure they are safe for your dietary needs",
  ])("treats verifying safety as advice: %s", (note) => {
    expect(codes(advise({ safety_note: note }), ctx({ restrictions: ["peanut"] }))).not.toContain("SAFETY_CLAIM");
  });

  it.each(["家中現有的非花生類食材", "使用者過敏原：花生"])("treats a Chinese warning as a warning: %s", (note) => {
    expect(codes(advise({ safety_note: note }), ctx({ restrictions: ["花生"] }))).not.toContain("RESTRICTED_FOOD");
  });
});
