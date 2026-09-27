import { NextResponse } from "next/server";
import { generateDishImage } from "@/lib/agents/recipe/image";

/**
 * 成品圖生成的後端代理端點（Gemini 影像模型）。
 * CLAUDE.md 鐵則：key 只在 server 端。前端呼叫本端點，逐張延遲載入。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; standard?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "缺少菜名" }, { status: 400 });
    }
    const dataUrl = await generateDishImage(name, body.standard);
    return NextResponse.json({ dataUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
