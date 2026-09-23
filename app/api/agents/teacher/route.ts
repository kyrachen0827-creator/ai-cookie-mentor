import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agents/teacher";
import type { Recipe } from "@/lib/data/types";

/**
 * 料理老師 agent 的後端代理端點（隨時提問）。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端持有。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      recipe?: Recipe;
      stepIndex?: number | null;
      question?: string;
    };

    if (!body.recipe || !body.question?.trim()) {
      return NextResponse.json(
        { error: "缺少食譜或問題內容" },
        { status: 400 },
      );
    }

    const answer = await answerQuestion({
      recipe: body.recipe,
      stepIndex: body.stepIndex ?? null,
      question: body.question,
    });

    return NextResponse.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
