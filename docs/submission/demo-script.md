# Kuke — 3-Minute Demo Script

**Story:** a beginner makes tomato scrambled eggs, and the eggs start sticking. Kuke asks the one question that matters, then coaches them through it.

> Lines marked **[rehearse]** were not checked end to end in the latest session. Run the whole script once on the demo machine before recording.

## Before you start (checklist)

- [ ] `.env.local` has `GEMINI_API_KEY`. Run a **production build** (`npm run build && npm start`); dev mode compiles each page on first visit and adds several seconds.
- [ ] Browser at phone size (375 × 812) or on a real phone. Language set to **EN**.
- [ ] Clear old data: in DevTools, remove `localStorage` keys starting with `zaohuo.`
- [ ] Have a finished-dish photo ready to upload (good light, whole plate in frame).
- [ ] Warm-up: ask the coach one question beforehand, so the first live call isn't the slowest.
- [ ] Backup: a screen recording of a successful run, in case the network or API fails during the demo.

## Script

| Time | Screen | Say (suggested) |
|---|---|---|
| 0:00–0:15 | Home page | "Beginners get stuck three times: what can I make, what do I do *right now*, and did it turn out OK? Kuke has a separate AI agent for each moment." |
| 0:15–0:40 | **Settings**: add an allergy, e.g. `peanut`. Then enter `eggs, tomato` and open the recommendations. **[rehearse]** | "I tell Kuke once that I avoid peanuts. Recipes that conflict are filtered out before I ever see them, and each one shows difficulty and time for a beginner." |
| 0:40–0:55 | Pick **Tomato Scrambled Eggs** → prep check → *All set, let's start* → go to the scrambling step | "One step per screen, each with how to tell it's right, because 'cook until done' means nothing to a beginner." |
| 0:55–1:20 | Type: **"My eggs are sticking to the pan, what do I do?"** | "Here's the moment beginners panic. Kuke doesn't guess. The fix is different for a non-stick pan and a steel one, so it asks one question, instantly, with buttons I can tap with messy hands. It also tells me to turn the heat down while I answer." |
| 1:20–1:50 | Tap **Non-stick**. Answer appears in ~3 s | "Now Gemini answers, but not as free text. Numbered actions, each with what to *look for* when it worked, plus what it can't know: it can't see my pan, and it says so." |
| 1:50–2:10 | Type: **"The oil caught fire!"** | "Some things should never depend on a model. Fire and injuries get fixed, reviewed steps immediately: smother with a lid, never water." |
| 2:10–2:40 | Finish → upload the dish photo → score **[rehearse; the judge can take up to ~25 s, so cut or narrate over the wait]** | "The judge scores the photo against this recipe's own finished-dish standard: colour, plating and surface finish, each with evidence. It won't judge taste or whether meat is cooked through; a photo can't show that." |
| 2:40–3:00 | Slide or screen: the eval table from `proposal-tech-highlights.md` | "We test the coach on 21 fixed cases with a scripted model and against the real model. Our first real run showed our own guardrails were blocking good allergy answers. We fixed that: fallbacks went from 8 to 0 of 42 model turns in the final run. Small sample, honestly reported. Thank you." |

## If something goes wrong live

- **Coach answer is slow or fails:** after two failed attempts the coach shows a fallback built from the recipe and says it is general guidance. Say: "That's the safety net when the model is unavailable."
- **Recommendations fail:** without a working key the app shows sample recipes with a notice, and the rest of the flow still works.
- **Judge asks for a retake:** that's intended for unclear photos. Use the prepared photo.
