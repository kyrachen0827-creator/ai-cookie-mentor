import { NextResponse } from "next/server";
import { scoreDish } from "@/lib/agents/judge";
import type { Recipe, SessionLogEntry } from "@/lib/data/types";

/**
 * 評審 agent 的後端代理端點。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端持有。
 * 成品照以 base64 傳入，僅用於本次評分呼叫。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      recipe?: Recipe;
      sessionLog?: SessionLogEntry[];
      image?: { mimeType?: string; dataBase64?: string };
      locale?: "en" | "zh";
    };
    const locale = body.locale === "zh" ? "zh" : "en";

    if (!body.recipe || !body.image?.dataBase64 || !body.image?.mimeType) {
      return NextResponse.json(
        { error: locale === "en" ? "Missing recipe or finished dish photo" : "缺少食譜或成品照片" },
        { status: 400 },
      );
    }

    const verdict = await scoreDish({
      recipe: body.recipe,
      sessionLog: body.sessionLog,
      image: {
        mimeType: body.image.mimeType,
        dataBase64: body.image.dataBase64,
      },
      locale,
    });

    return NextResponse.json(verdict);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
