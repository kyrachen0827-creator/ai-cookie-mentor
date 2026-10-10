import { recommendRecipes } from "@/lib/agents/recipe";
import { handleAgentRoute, type RouteConfig } from "@/lib/api/guard";
import { parseRecipeRequest } from "@/lib/api/validators";

/**
 * 食譜推薦 agent 的後端代理端點。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端（本路由/lib）持有。
 * 前端絕不直接呼叫 Gemini。輸入驗證、限流與錯誤保護見 lib/api/guard.ts。
 */
const CONFIG: RouteConfig = {
  scope: "recipe",
  maxBytes: 20 * 1024,
  rateLimit: { max: 10, windowMs: 60_000 },
};

export function POST(request: Request) {
  return handleAgentRoute(request, CONFIG, async (body, locale) => {
    const { ingredients, profile } = parseRecipeRequest(body);
    return recommendRecipes({ ingredients, profile, locale });
  });
}
