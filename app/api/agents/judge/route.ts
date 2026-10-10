import { scoreDish } from "@/lib/agents/judge";
import { handleAgentRoute, type RouteConfig } from "@/lib/api/guard";
import { parseJudgeRequest } from "@/lib/api/validators";

/**
 * 評審 agent 的後端代理端點。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端持有。
 * 成品照以 base64 傳入，僅用於本次評分呼叫（前端已縮到最長邊 1024px 的 JPEG）。
 * 輸入驗證、限流與錯誤保護見 lib/api/guard.ts。
 */
const CONFIG: RouteConfig = {
  scope: "judge",
  maxBytes: 4 * 1024 * 1024,
  rateLimit: { max: 6, windowMs: 60_000 },
};

export function POST(request: Request) {
  return handleAgentRoute(request, CONFIG, async (body, locale) => {
    const { recipe, sessionLog, image } = parseJudgeRequest(body);
    return scoreDish({ recipe, sessionLog, image, locale });
  });
}
