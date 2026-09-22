import "server-only";

/**
 * Gemini API 封裝（僅限 server 端）
 *
 * CLAUDE.md 技術棧鐵則：API key 絕不進前端。
 * 本檔以 `server-only` 保護，一旦被 client 端 import 會在編譯期報錯。
 * key 從環境變數讀取（本地 .env.local；Cloud Run 走 Secret Manager 注入 env）。
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
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

  const res = await fetch(
    `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
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
