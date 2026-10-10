import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateImage, generateText } from "@/lib/ai/gemini";

const TEST_KEY = "test-key-NOT-REAL-123";

function okTextResponse(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

function okImageResponse(data = "AAAA"): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data } }] } }],
    }),
    { status: 200 },
  );
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe("generateText", () => {
  it("sends the API key in the x-goog-api-key header, never in the URL", async () => {
    fetchMock.mockResolvedValue(okTextResponse("hello"));

    await generateText("hi");

    const { url, headers } = lastCall();
    expect(headers["x-goog-api-key"]).toBe(TEST_KEY);
    expect(url).not.toContain(TEST_KEY);
    expect(url).not.toContain("key=");
  });

  it("posts the prompt, images and generation options as before", async () => {
    fetchMock.mockResolvedValue(okTextResponse("ok"));

    await generateText("describe", [{ mimeType: "image/jpeg", dataBase64: "QUJD" }], {
      temperature: 0,
      thinkingBudget: 0,
    });

    const body = JSON.parse(lastCall().init.body as string);
    expect(body.contents[0].parts).toEqual([
      { text: "describe" },
      { inline_data: { mime_type: "image/jpeg", data: "QUJD" } },
    ]);
    expect(body.generationConfig).toEqual({
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(lastCall().init.method).toBe("POST");
  });

  it("asks for JSON output only when requested", async () => {
    fetchMock.mockImplementation(async () => okTextResponse("{}"));

    await generateText("hi", undefined, { json: true });
    expect(JSON.parse(lastCall().init.body as string).generationConfig).toEqual({
      responseMimeType: "application/json",
    });

    await generateText("hi");
    expect(JSON.parse(lastCall().init.body as string).generationConfig).toBeUndefined();
  });

  it("gives up on a stalled request when a timeout is set, so callers can fall back", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener("abort", () =>
            reject((init?.signal as AbortSignal).reason),
          );
        }),
    );

    await expect(generateText("hi", undefined, { timeoutMs: 30 })).rejects.toThrow();
  });

  it("sets no timeout unless asked, because the judge's vision call is legitimately slow", async () => {
    fetchMock.mockImplementation(async () => okTextResponse("ok"));

    await generateText("hi");

    expect(lastCall().init.signal).toBeUndefined();
  });

  it("returns the model text", async () => {
    fetchMock.mockResolvedValue(okTextResponse("hello"));
    await expect(generateText("hi")).resolves.toBe("hello");
  });

  it("throws when the key is missing, without calling Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateText("hi")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-OK response and does not put the key in the message", async () => {
    fetchMock.mockResolvedValue(new Response("quota exceeded", { status: 429 }));

    const error = await generateText("hi").catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("429");
    expect((error as Error).message).not.toContain(TEST_KEY);
  });
});

describe("generateImage", () => {
  it("sends the API key in the header, never in the URL", async () => {
    fetchMock.mockResolvedValue(okImageResponse());

    const dataUrl = await generateImage("a dish");

    const { url, headers } = lastCall();
    expect(headers["x-goog-api-key"]).toBe(TEST_KEY);
    expect(url).not.toContain(TEST_KEY);
    expect(dataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("still retries a 429 and succeeds on the next attempt, keeping the header", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(okImageResponse("BBBB"));

    const pending = generateImage("a dish");
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBe("data:image/png;base64,BBBB");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": TEST_KEY });
    }
  });

  it("does not retry a non-429 error", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(generateImage("a dish")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
