# Kuke — Known Limitations

An honest list for judges and future contributors. Updated 2026-10-10.

## AI behaviour

- **Guardrails are rule-based.** They catch explicit violations (suggesting a restricted food, promising safety, pushing to a later step, claiming to see the food). They cannot catch a reworded violation, and they still sometimes reject good answers (see [`docs/eval/report.md`](../eval/report.md) §4). A rejected answer costs one extra model call (about 2–3 s) or ends in the generic fallback.
- **The quality of the advice is not graded.** The evaluation checks structure and explicit rules, not whether the cooking advice is the best advice.
- **Small evaluation.** 19 cases × 3 runs against one model (`gemini-3.6-flash`) on one day. These are spot checks, not success rates. The last guardrail changes were verified by replaying recorded outputs, not by a new live run.
- **Only four knowledge cards** (sticking, burning, watery, too salty). Other problems go straight to the model with the recipe as context.
- **Formatting slips.** The model sometimes returns `actions` as plain strings. It recovers on retry, but that adds latency. One Chinese reply contained a garbled character.
- **The judge is slow** (about 25 s in a single measurement), as is dish-image generation (about 28 s, single measurement).

## Allergies and diets

- **The allergen vocabulary is a hand-written subset** of common terms (English and Chinese). It is not exhaustive and is **not a medical guarantee**. Users are told to check labels.
- "Vegetarian" is treated as lacto-ovo vegetarian.
- The **judge and the image generator do not apply allergy checks**. They only describe or score the photo.
- On the cook page a clear conflict is **warned about, not blocked**: the "start" button still works. Whether to disable it is an open product decision.

## Platform and operations

- **Data lives in the browser** (`localStorage`). There are no accounts, no sync across devices, and clearing browser data loses the portfolio.
- **Rate limiting is in-memory per server instance.** On Cloud Run with several instances, each counts separately. The client IP comes from the last `X-Forwarded-For` entry, which hasn't been verified on Cloud Run.
- **Cloud Run deployment has not been run yet.** `DEPLOY.md` is untested.
- `npm audit` reports existing advisories in `next`, `postcss` and `braces` that haven't been addressed. There's no ESLint configuration, so `npm run lint` was not run.
- **PWA is minimal**: there is a web app manifest (add to home screen, opens standalone), but no service worker and no offline support. Home-screen installation hasn't been tested on real iOS or Android devices. The icon is an SVG that draws 酷 with the device's font.
- **Step timer**: shown only on steps with a time in the recipe, with an on-screen alert, a beep and vibration (where supported). Browsers throttle background tabs, so if the app isn't in front the alert appears when you return. The countdown itself stays accurate. Sound may stay muted if the phone's silent switch is on.
- **Photo check-ins during cooking** ("does this look right?", in the spec) are not implemented. The coach is text-only.

## Process

- **No user testing** with real beginner cooks has been done.
- Latency figures come from a local machine with a single user, not from production.
