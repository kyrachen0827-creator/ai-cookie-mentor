/**
 * 用真實 Gemini 跑固定評估案例。平常的 `npx vitest run` 會略過；
 * 只有 `node scripts/eval-coach.mjs` 設定 KUKE_EVAL_REAL=1 時才會執行（會產生 API 費用）。
 *
 * 結果（每次回覆、每次模型輸出的格式與護欄結果、統計）寫到 KUKE_EVAL_OUT 指定的 JSON，
 * 報告只引用這份檔案裡的實際數字。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { geminiCoachDeps } from "@/lib/agents/teacher";
import { geminiTextModel, hasGeminiKey } from "@/lib/ai/gemini";
import { EVAL_CASES } from "./cases";
import { runCase, summarize, type EvalRecord } from "./harness";

const enabled = process.env.KUKE_EVAL_REAL === "1";
const RUNS = Math.max(1, Math.min(10, Number(process.env.KUKE_EVAL_RUNS ?? 3) || 3));
const OUT = process.env.KUKE_EVAL_OUT ?? "docs/eval/runs/latest.json";
const TIMEOUT_MS = 30 * 60 * 1000;

describe.skipIf(!enabled)("Cooking Coach with the real model", () => {
  it(
    `runs every case ${RUNS} time(s) and records the results`,
    async () => {
      expect(hasGeminiKey(), "GEMINI_API_KEY is missing").toBe(true);
      const cases = EVAL_CASES.filter((c) => !c.fakeOnly);
      const records: EvalRecord[] = [];
      // 依序執行：避免同時打太多請求被限流，延遲數字也比較接近單一使用者
      for (const c of cases) {
        for (let run = 0; run < RUNS; run += 1) {
          records.push(await runCase(c, geminiCoachDeps, run));
        }
      }
      const result = {
        date: new Date().toISOString(),
        model: geminiTextModel(),
        runsPerCase: RUNS,
        skippedFakeOnly: EVAL_CASES.filter((c) => c.fakeOnly).map((c) => c.id),
        summary: summarize(records),
        records,
      };
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
      expect(records.length).toBe(cases.length * RUNS);
    },
    TIMEOUT_MS,
  );
});
