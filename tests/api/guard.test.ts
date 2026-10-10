import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clientKey,
  enforceRateLimit,
  errorResponse,
  readJsonBody,
  resetRateLimits,
} from "@/lib/api/guard";

function requestFrom(ip?: string, body?: string): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: ip ? { "x-forwarded-for": ip } : {},
    body,
  });
}

describe("clientKey", () => {
  it("takes the last x-forwarded-for entry, since earlier ones can be spoofed", () => {
    expect(clientKey(requestFrom("6.6.6.6, 1.2.3.4"))).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when the header is missing", () => {
    expect(clientKey(requestFrom())).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  const limit = { max: 3, windowMs: 1000 };
  beforeEach(resetRateLimits);

  it("allows requests up to the limit and rejects the next with 429", () => {
    const req = requestFrom("1.1.1.1");
    for (let i = 0; i < 3; i++) enforceRateLimit(req, "s", limit, 0);

    expect(() => enforceRateLimit(req, "s", limit, 10)).toThrowError(ApiError);
    try {
      enforceRateLimit(req, "s", limit, 10);
    } catch (e) {
      expect((e as ApiError).status).toBe(429);
    }
  });

  it("allows requests again after the window passes", () => {
    const req = requestFrom("1.1.1.1");
    for (let i = 0; i < 3; i++) enforceRateLimit(req, "s", limit, 0);

    expect(() => enforceRateLimit(req, "s", limit, 1001)).not.toThrow();
  });

  it("counts each client and each scope separately", () => {
    for (let i = 0; i < 3; i++) enforceRateLimit(requestFrom("1.1.1.1"), "a", limit, 0);

    expect(() => enforceRateLimit(requestFrom("2.2.2.2"), "a", limit, 0)).not.toThrow();
    expect(() => enforceRateLimit(requestFrom("1.1.1.1"), "b", limit, 0)).not.toThrow();
  });
});

describe("readJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const body = await readJsonBody(requestFrom("1.1.1.1", '{"a":1}'), 100);
    expect(body).toEqual({ a: 1 });
  });

  it("rejects invalid JSON with 400", async () => {
    await expect(readJsonBody(requestFrom("1.1.1.1", "{nope"), 100)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a body larger than the limit with 413 while streaming", async () => {
    const big = JSON.stringify({ text: "x".repeat(500) });
    await expect(readJsonBody(requestFrom("1.1.1.1", big), 100)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("rejects early when content-length already exceeds the limit", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    await expect(readJsonBody(req, 100)).rejects.toMatchObject({ status: 413 });
  });
});

describe("errorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns ApiError messages in the requested locale", async () => {
    const err = new ApiError(400, { en: "bad input", zh: "輸入不正確" });

    const res = errorResponse(err, "test", "zh");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "輸入不正確" });
  });

  it("hides internal error details from the client and logs them server-side", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretDetail = "Gemini API 錯誤 (403): API key SECRET-123 invalid";

    const res = errorResponse(new Error(secretDetail), "test", "en");
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(500);
    expect(text).not.toContain("SECRET-123");
    expect(text).not.toContain("Gemini");
    expect(spy).toHaveBeenCalledOnce();
  });
});
