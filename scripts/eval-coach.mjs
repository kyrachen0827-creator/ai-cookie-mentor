#!/usr/bin/env node
/**
 * 用真實 Gemini 跑 Cooking Coach 的固定評估案例，並印出統計。
 *
 *   node scripts/eval-coach.mjs            # 每個案例跑 3 次
 *   node scripts/eval-coach.mjs --runs 5   # 每個案例跑 5 次（上限 10）
 *
 * 會讀 .env.local 的 GEMINI_API_KEY 並產生 API 費用（約「案例數 × 次數 × 1～2」次呼叫）。
 * 結果寫到 docs/eval/runs/<日期時間>.json（含模型名稱）；只回報實際跑出的數字。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MAX_RUNS = 10;
const runsArg = process.argv.indexOf("--runs");
const runs = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 3;
if (!Number.isInteger(runs) || runs < 1 || runs > MAX_RUNS) {
  console.error(`--runs must be an integer between 1 and ${MAX_RUNS}`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set (.env.local). Nothing was run.");
  process.exit(1);
}

// 例：2026-10-10T21-40（模型名稱寫在檔案內容裡）
const stamp = new Date().toISOString().slice(0, 16).replace(":", "-");
const out = `docs/eval/runs/${stamp}.json`;

console.log(`Running the coach evaluation against the real model, ${runs} run(s) per case → ${out}`);
const result = spawnSync("npx", ["vitest", "run", "tests/eval/real-model.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, KUKE_EVAL_REAL: "1", KUKE_EVAL_RUNS: String(runs), KUKE_EVAL_OUT: out },
});
if (result.status !== 0 || !existsSync(out)) {
  console.error("The evaluation did not finish; see the output above.");
  process.exit(result.status ?? 1);
}

const { date: ranAt, model: usedModel, summary: s, records } = JSON.parse(readFileSync(out, "utf8"));
const pct = (n, d) => (d === 0 ? "n/a" : `${n}/${d} (${((100 * n) / d).toFixed(1)}%)`);
console.log(`
Date:                   ${ranAt}
Model:                  ${usedModel}
Cases × runs:           ${s.cases} × ${records.length / s.cases}
Expectations met:       ${pct(s.expectationPass.pass, s.expectationPass.total)}
Model calls:            ${s.modelCalls} (failed calls: ${s.callFailures})
Format pass:            ${pct(s.formatPass.pass, s.formatPass.total)}
Guardrail violations:   ${pct(s.guardrailViolations.violated, s.guardrailViolations.total)} ${JSON.stringify(s.guardrailViolations.byCode)}
Served by model/fallback: ${s.servedBy.model}/${s.servedBy.fallback}
Decision consistency:   ${pct(s.consistency.consistent, s.consistency.total)} unstable: ${s.consistency.unstable.join(", ") || "none"}
Latency (model turns):  median ${s.latencyMs.median} ms, max ${s.latencyMs.max} ms`);
for (const r of records.filter((x) => !x.pass)) {
  console.log(`FAILED ${r.caseId}#${r.run}: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")}`);
}
