import "server-only";

/**
 * Gemini API 封裝（僅限 server 端）
 *
 * CLAUDE.md 技術棧鐵則：API key 絕不進前端。
 * 本檔以 `server-only` 保護，一旦被 client 端 import 會在編譯期報錯。
 * key 從環境變數讀取（本地 .env.local；Cloud Run 走 Secret Manager 注入 env）。
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * 呼叫 Gemini 產生文字（可帶圖片，供評審 agent 讀成品照時使用）。
 * @param prompt  文字提示
 * @param images  選填，base64 圖片（含 mimeType），評審 agent 讀圖用
 * @returns 模型輸出的純文字
 */
export async function generateText(
  prompt: string,
  images?: { mimeType: string; dataBase64: string }[],
  options?: { temperature?: number; thinkingBudget?: number },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少 GEMINI_API_KEY。請在 .env.local 設定（見 .env.local.example）。",
    );
  }

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of images ?? []) {
    parts.push({
      inline_data: { mime_type: img.mimeType, data: img.dataBase64 },
    });
  }

  const body: Record<string, unknown> = { contents: [{ parts }] };
  const generationConfig: Record<string, unknown> = {};
  if (options?.temperature !== undefined) {
    // 評審需要「同一張照片結果一致」，以 temperature 0 逼近確定性輸出
    generationConfig.temperature = options.temperature;
  }
  if (options?.thinkingBudget !== undefined) {
    // Gemini 3.x 預設會「思考」增加延遲；推薦/問答不需深度推理，設 0 關閉以加速
    generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget };
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const res = await fetch(
    `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API 錯誤 (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ?? "";
}

/**
 * 呼叫 Gemini 影像模型生成一張圖，回傳 data URL（base64）。
 * 用於生成食譜成品示意圖（新生成、非抄取任何網站圖片）。
 *
 * 推薦頁會同時對 3–5 道菜並發呼叫這支 API，容易撞到兩種暫時性失敗：
 * (1) 429（RESOURCE_EXHAUSTED，配額偏緊）(2) 模型偶爾只回文字、不附圖
 * （非配額問題，觀察上同一個 prompt 重打常常就正常，屬隨機性而非必然）。
 * 原本一次失敗就永久掉回 emoji placeholder；兩種都做少量重試＋退避。
 */
export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY。");
  }

  const maxAttempts = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      lastError = new Error(`Gemini 影像 API 錯誤 (${res.status}): ${detail}`);
      // 429 是暫時性流量限制，值得重試；其他錯誤（如 400 壞請求）重試也沒用，直接丟出。
      if (res.status === 429 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw lastError;
    }

    const data = await res.json();
    const parts: Array<Record<string, unknown>> =
      data?.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = (p.inlineData ?? p.inline_data) as
        | { data?: string; mimeType?: string; mime_type?: string }
        | undefined;
      if (inline?.data) {
        const mime = inline.mimeType ?? inline.mime_type ?? "image/png";
        return `data:${mime};base64,${inline.data}`;
      }
    }
    // 模型偶爾只回文字、沒附圖；觀察上是隨機性，重打同一個 prompt 常常就正常，值得重試。
    lastError = new Error("影像回傳為空");
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error("影像生成失敗");
}
