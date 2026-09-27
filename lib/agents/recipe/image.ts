import "server-only";

/**
 * 食譜成品示意圖生成
 *
 * 用 Gemini 影像模型「生成」一張新圖（參考台灣家常食譜網站的攝影風格，
 * 但不抄取任何網站的實際照片，避免版權問題）。失敗時由呼叫端退回 placeholder。
 */
import { generateImage } from "@/lib/ai/gemini";

/**
 * 依菜名快取生成結果（含 in-flight promise，避免同名同時多次呼叫）。
 * 常見菜名（如「番茄炒蛋」）第一次生成後，之後都直接讀快取，省 API 成本與等待時間。
 * 僅存於行程記憶體，重啟後清空；Phase 1 先不落 DB。
 */
const imageCache = new Map<string, Promise<string>>();

function buildImagePrompt(name: string, standard?: string): string {
  return [
    `台灣家常菜「${name}」的成品照片。`,
    standard ? `成品應有的樣子：${standard}` : "",
    "寫實食物攝影：暖色自然光、略俯角、乾淨木質或素色餐桌背景，擺盤家常自然，像台灣食譜網站的示範照。",
    "畫面只有這道料理本身，不要文字、浮水印、logo 或人物。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 生成一道菜的成品圖，回傳 data URL */
export async function generateDishImage(
  name: string,
  standard?: string,
): Promise<string> {
  const key = name.trim();
  const cached = imageCache.get(key);
  if (cached) return cached;

  const promise = generateImage(buildImagePrompt(name, standard)).catch((err) => {
    imageCache.delete(key); // 失敗不快取，下次可重試
    throw err;
  });
  imageCache.set(key, promise);
  return promise;
}
