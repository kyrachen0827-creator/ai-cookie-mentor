/**
 * API 路由共用護欄：請求大小上限、JSON 解析、速率限制、錯誤訊息保護。
 *
 * 所有 /api/agents/* 路由都經過 handleAgentRoute，確保：
 * 1. 超大請求在讀完前就被拒絕（413）
 * 2. 同一來源短時間內的請求數有上限（429）
 * 3. 內部錯誤（含 Gemini 原始回應）只寫 server log，前端只看到通用訊息
 *
 * 限流器存在行程記憶體：Cloud Run 多實例時是「每實例各自計數」，
 * 屬於降低濫用的第一道防線，不是完整的配額保護。
 */
import { NextResponse } from "next/server";

export type Locale = "en" | "zh";

export interface LocalizedMessage {
  en: string;
  zh: string;
}

/** 可安全回給前端的錯誤（訊息由我們自己撰寫，不含內部細節） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: LocalizedMessage,
  ) {
    super(messages.en);
    this.name = "ApiError";
  }
}

export function pickLocale(value: unknown): Locale {
  return value === "zh" ? "zh" : "en";
}

const GENERIC_ERROR: LocalizedMessage = {
  en: "Something went wrong on our side. Please try again in a moment.",
  zh: "系統暫時出了點問題，請稍後再試。",
};

// 限流發生在讀取 body 之前，還不知道使用者語系，所以兩種語言都顯示
const TOO_MANY_REQUESTS_TEXT =
  "Too many requests — please wait a moment and try again. / 請求太頻繁，請稍候再試。";
const TOO_MANY_REQUESTS: LocalizedMessage = {
  en: TOO_MANY_REQUESTS_TEXT,
  zh: TOO_MANY_REQUESTS_TEXT,
};

// ---------------------------------------------------------------------------
// 速率限制
// ---------------------------------------------------------------------------

export interface RateLimit {
  max: number;
  windowMs: number;
}

const hits = new Map<string, readonly number[]>();
const PRUNE_THRESHOLD = 5000;

/**
 * 取得來源 IP。Cloud Run 會把真實來源附加在 X-Forwarded-For 的「最後」，
 * 前面的項目可由客戶端偽造，所以取最後一個。
 * （此行為依 Cloud Run 文件推論，尚未在實際部署上驗證。）
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? "unknown";
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: RateLimit,
  now: number = Date.now(),
): void {
  const key = `${scope}:${clientKey(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < limit.windowMs);

  if (recent.length >= limit.max) {
    hits.set(key, recent);
    throw new ApiError(429, TOO_MANY_REQUESTS);
  }
  hits.set(key, [...recent, now]);

  if (hits.size > PRUNE_THRESHOLD) pruneExpired(now, limit.windowMs);
}

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, times] of hits) {
    if (times.every((t) => now - t >= windowMs)) hits.delete(key);
  }
}

/** 測試用：清空計數 */
export function resetRateLimits(): void {
  hits.clear();
}

// ---------------------------------------------------------------------------
// 請求內容讀取
// ---------------------------------------------------------------------------

const PAYLOAD_TOO_LARGE: LocalizedMessage = {
  en: "The request is too large.",
  zh: "請求內容過大。",
};

const INVALID_JSON: LocalizedMessage = {
  en: "The request body is not valid JSON.",
  zh: "請求內容不是有效的 JSON。",
};

/** 讀取並解析 JSON，超過 maxBytes 就中止讀取（不依賴 Content-Length 的誠實性） */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, PAYLOAD_TOO_LARGE);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, INVALID_JSON);

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, PAYLOAD_TOO_LARGE);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, INVALID_JSON);
  }
}

// ---------------------------------------------------------------------------
// 路由包裝
// ---------------------------------------------------------------------------

export interface RouteConfig {
  /** 日誌與限流用的名稱，例：teacher */
  scope: string;
  maxBytes: number;
  rateLimit: RateLimit;
}

/**
 * 統一的路由流程：限流 → 讀取 JSON → 呼叫 handler → 錯誤保護。
 * handler 收到未驗證的 body 與語系，驗證由各路由的 parse 函式負責，
 * 驗證失敗請丟 ApiError。
 */
export async function handleAgentRoute(
  request: Request,
  config: RouteConfig,
  handler: (body: unknown, locale: Locale) => Promise<unknown>,
): Promise<NextResponse> {
  let locale: Locale = "en";
  try {
    enforceRateLimit(request, config.scope, config.rateLimit);
    const body = await readJsonBody(request, config.maxBytes);
    locale = pickLocale((body as { locale?: unknown } | null)?.locale);
    const result = await handler(body, locale);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, config.scope, locale);
  }
}

export function errorResponse(
  err: unknown,
  scope: string,
  locale: Locale,
): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.messages[locale] }, { status: err.status });
  }
  // 內部錯誤（含 Gemini 原始回應）只留在 server log
  console.error(`[api:${scope}] unexpected error`, err);
  return NextResponse.json({ error: GENERIC_ERROR[locale] }, { status: 500 });
}
