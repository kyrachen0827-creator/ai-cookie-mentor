import { NextResponse } from "next/server";
import { recommendRecipes } from "@/lib/agents/recipe";
import type { FoodProfile } from "@/lib/data/types";

/**
 * 食譜推薦 agent 的後端代理端點。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端（本路由/lib）持有。
 * 前端絕不直接呼叫 Gemini。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      ingredients?: string[];
      profile?: FoodProfile;
    };

    const ingredients = (body.ingredients ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    const profile: FoodProfile = body.profile ?? {
      kitchen_tools: [],
      dietary_restrictions: [],
      default_serving_size: 1,
    };

    if (ingredients.length === 0) {
      return NextResponse.json(
        { error: "請輸入至少一種食材" },
        { status: 400 },
      );
    }

    const result = await recommendRecipes({ ingredients, profile });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
