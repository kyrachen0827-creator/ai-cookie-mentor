import { generateDishImage } from "@/lib/agents/recipe/image";
import { handleAgentRoute, type RouteConfig } from "@/lib/api/guard";
import { parseImageRequest } from "@/lib/api/validators";

/**
 * 成品圖生成的後端代理端點（Gemini 影像模型）。
 * CLAUDE.md 鐵則：key 只在 server 端。前端呼叫本端點，逐張延遲載入。
 * 推薦頁一次會對 3–5 道菜各打一次，所以額度比其他端點寬。
 * 輸入驗證、限流與錯誤保護見 lib/api/guard.ts。
 */
const CONFIG: RouteConfig = {
  scope: "recipe-image",
  maxBytes: 8 * 1024,
  rateLimit: { max: 30, windowMs: 60_000 },
};

export function POST(request: Request) {
  return handleAgentRoute(request, CONFIG, async (body) => {
    const { name, standard } = parseImageRequest(body);
    const dataUrl = await generateDishImage(name, standard);
    return { dataUrl };
  });
}
