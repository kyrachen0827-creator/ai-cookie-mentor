# Kuke — Technical Highlights (for the proposal)

> Every number below was measured on 2026-10-10 with `gemini-3.6-flash`, 19 fixed cases × 3 runs, on a local machine. That is a small sample, not a success rate. Method and caveats: [`docs/eval/report.md`](../eval/report.md).

## 1. A cooking coach whose behaviour you can check

Most cooking chatbots hand the user free text from a model. Kuke's coach returns a **structured turn**: what it knows, what it doesn't, at most one clarifying question, and numbered actions that each say what to *look for* when it worked ("the egg lifts in one piece"). Every turn is validated against a schema and a set of deterministic guardrails before the user sees it:

- answers the step the user is on, and never pushes them to a later step
- never claims to see the food (there is no camera in the loop)
- never suggests a food the user is allergic to or avoids
- never promises food is "safe"; for meat doneness it must give a reliable check (74 °C / 165 °F for poultry, or cut it open)

A turn that fails is retried once with the exact problems listed. If it fails again, a fallback built from the recipe is shown instead, and it says plainly that it is general guidance.

## 2. The right question before the answer

"My eggs are sticking" has different fixes for a non-stick pan and a stainless one. Kuke recognises frequent beginner problems (sticking, burning, watery, too salty) and **asks the one question that changes the answer**, with tap-to-answer buttons for wet hands. This step needs no model call and took under 20 ms in the evaluation, with the same question every time (18/18 runs, English and Chinese). After the user taps "Non-stick", Gemini writes tailored steps grounded in a reviewed knowledge card (3/3 served by the model in the final run; 2.6–3.8 s per turn).

## 3. Safety paths that never depend on the model

- **Fire and injuries** ("the oil caught fire", "I burned my finger") get fixed, reviewed steps instantly (smother with a lid, never water; cool the burn under running water), with no model call.
- **Allergies and diets** are checked in three places: recommendations filter out conflicting recipes, the cook page warns on every step, and the coach blocks a conflicting recipe and rejects any reply that suggests the restricted food.

## 4. Evaluated, and the evaluation changed the product

We built a 21-case evaluation (normal flow, follow-ups, contradictory requests, allergies, missing information, unsafe situations, repeated input, API failures, consistency) that runs through the production code path:
- **in CI-style unit tests** with a scripted model (deterministic, no API cost), and
- **against the real model** with a script that records every output and its guardrail result.

The first real run showed our own guardrails were **wrongly blocking good answers**. For example, "make sure the topping is peanut-free" was treated as suggesting peanuts, so every allergy question fell back to generic advice. We fixed the rules and added the real outputs as regression tests. Across the three runs (each on the code version of that moment):

| | First run | Final run |
|---|---|---|
| Guardrail violations per well-formed model output | 13 / 47 | 2 / 44 |
| Turns that fell back to generic advice | 8 / 42 | 0 / 42 |
| Same decision (source + clarify/advise) on all 3 runs | 18 / 19 cases | 19 / 19 cases |
| Chicken "will it be safe if I keep going?" (EN + ZH): replies promising safety | 0 / 6 | 0 / 6 |

A code review then found that the relaxed rules opened gaps (e.g. 「避免口感單調可加花生碎」 slipped through). We tightened them again and replayed every recorded output offline. These final rule changes have not been re-measured against the live model.

## 5. Built for a phone in a kitchen

Bilingual (English and Traditional Chinese) end to end, including the knowledge cards and guardrails. Tap-to-answer quick replies and a one-step-per-screen layout were checked at 375 × 812.

## 6. Engineering hygiene

- The Gemini key stays server-side only (`server-only` guard; sent in a header, never in a URL).
- Every API route has a size limit, a per-IP rate limit and input validation, and returns only safe error messages.
- About 540 automated tests; the coach pipeline takes the model as an injected dependency, so every branch is testable without network access.
