import fs from "node:fs";
import path from "node:path";

const env = fs.readFileSync(".env.local", "utf8");
const key = env.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();
const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const outDir = "public/landing";
fs.mkdirSync(outDir, { recursive: true });

const items = [
  {
    file: "hero-bg",
    prompt:
      "Generate a photorealistic image: a cozy warm Taiwanese home kitchen counter, a wooden cutting board with fresh red tomatoes, brown eggs and green scallions, soft natural warm morning light, shallow depth of field with softly blurred background, food photography, no text, no people.",
  },
  {
    file: "dish",
    prompt:
      "Generate a photorealistic top-down image of Taiwanese tomato scrambled eggs (fan qie chao dan) in a white ceramic bowl, glossy tomato pieces and fluffy yellow eggs, a little fresh basil on top, on a light wooden table, warm natural light, appetizing food photography, no text, no watermark.",
  },
  { file: "tomato", prompt: img("a single fresh whole red tomato with a green stem") },
  { file: "broccoli", prompt: img("a fresh green broccoli floret") },
  { file: "egg", prompt: img("a single brown chicken egg") },
  { file: "chicken", prompt: img("a raw skinless chicken breast fillet") },
  { file: "mushroom", prompt: img("a small pile of fresh white button mushrooms") },
  { file: "greens", prompt: img("a bunch of fresh green leafy bok choy vegetable") },
  { file: "scallion", prompt: img("a few fresh green scallions (green onions)") },
  {
    file: "dish-pepper-chicken",
    prompt:
      "Generate a photorealistic top-down image of Taiwanese-style black pepper chicken (hei hu jiao ji), pan-seared chicken breast slices glazed with glossy black pepper sauce, garnished with scallion, served in a white ceramic bowl on a light wooden table, warm natural light, appetizing food photography, no text, no watermark.",
  },
  {
    file: "dish-chicken-salad",
    prompt:
      "Generate a photorealistic top-down image of a fresh chicken salad, shredded poached chicken breast over crisp mixed greens, cherry tomatoes, in a white ceramic bowl on a light wooden table, warm natural light, appetizing food photography, no text, no watermark.",
  },
  {
    file: "prep-tomato",
    prompt:
      "Generate a photorealistic close-up image of hands using a kitchen knife to dice a fresh red tomato into small cubes on a wooden cutting board, warm natural light, shallow depth of field, appetizing home cooking photography, no text, no watermark, only hands visible (no face).",
  },
  {
    file: "tool-induction",
    prompt:
      "Generate a photorealistic studio product photo shot from directly above (top-down flat lay) of a modern black glass induction cooktop, a single circular burner ring clearly visible, centered, on a clean soft cream background, bright even warm lighting, no text, no watermark, no logo.",
  },
  { file: "tool-rice-cooker", prompt: img("a white rice cooker with a black lid button") },
  {
    file: "tool-multicooker",
    prompt:
      "Generate a photorealistic studio product photo of a compact stainless steel and black electric multi-cooker (instant-pot style) with a rounded lid handle and a simple blank control panel, centered, on a clean soft cream background, bright even warm lighting. Absolutely no text, no brand name, no logo, no labels anywhere on the product.",
  },
  { file: "tool-airfryer", prompt: img("a black digital air fryer with a pull-out basket") },
  { file: "tool-oven", prompt: img("a small black and silver countertop toaster oven") },
  { file: "tool-microwave", prompt: img("a compact white microwave oven") },
];

function img(subject) {
  return `Generate a photorealistic studio image of ${subject}, centered, on a clean soft cream background, bright even lighting, appetizing food photography, no text, no watermark.`;
}

async function gen(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const parts = d.candidates?.[0]?.content?.parts || [];
  const p = parts.find((x) => x.inlineData || x.inline_data);
  const inline = p?.inlineData || p?.inline_data;
  if (!inline?.data) throw new Error("no image in response");
  const mime = inline.mimeType || inline.mime_type || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : "png";
  return { buf: Buffer.from(inline.data, "base64"), ext };
}

for (const it of items) {
  try {
    const { buf, ext } = await gen(it.prompt);
    const fp = path.join(outDir, `${it.file}.${ext}`);
    fs.writeFileSync(fp, buf);
    console.log("OK  ", fp, (buf.length / 1024).toFixed(0) + "KB");
  } catch (e) {
    console.log("FAIL", it.file, String(e).slice(0, 160));
  }
}
console.log("done.");
