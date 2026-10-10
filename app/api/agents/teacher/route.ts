import { respond } from "@/lib/agents/teacher";
import { handleAgentRoute, type RouteConfig } from "@/lib/api/guard";
import { parseTeacherRequest } from "@/lib/api/validators";

/**
 * 料理老師 agent 的後端代理端點（隨時提問）。
 *
 * CLAUDE.md 鐵則：前端呼叫本端點，Gemini key 只在 server 端持有。
 * 輸入驗證、限流與錯誤保護見 lib/api/guard.ts。
 *
 * 回應：`answer`（純文字，舊版前端相容）、`coach`（結構化回合，走 Coach 時才有）、
 * `source`（這個回答是怎麼來的：emergency / injury / triage / model / fallback / blocked / legacy）。
 */
const CONFIG: RouteConfig = {
  scope: "teacher",
  maxBytes: 100 * 1024,
  rateLimit: { max: 20, windowMs: 60_000 },
};

export function POST(request: Request) {
  return handleAgentRoute(request, CONFIG, async (body, locale) => {
    const { recipe, stepIndex, question, profile, history } = parseTeacherRequest(body);
    return respond({
      recipe,
      stepIndex,
      question,
      locale,
      restrictions: profile.dietary_restrictions,
      history,
    });
  });
}
