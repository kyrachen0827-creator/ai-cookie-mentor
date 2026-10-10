/**
 * 評估的執行與統計。
 *
 * 每個案例都走老師的正式入口 `respond()`（緊急 → 過敏把關 → 分流 → 模型 → 護欄 → 重試 → 備援），
 * 只把模型呼叫換掉（假模型或真實 Gemini），並用 `onAttempt` 記下每一次模型輸出的格式與護欄結果。
 * 統計只根據實際記錄計算，不推估。
 */
import { respond } from "@/lib/agents/teacher";
import type { CoachAttempt, CoachDeps } from "@/lib/agents/teacher/coach";
import type { EvalCase } from "./cases";

export interface EvalCheck {
  name: string;
  pass: boolean;
}

export interface EvalRecord {
  caseId: string;
  category: string;
  run: number;
  source: string;
  kind: string | null;
  answer: string;
  attempts: CoachAttempt[];
  ms: number;
  checks: EvalCheck[];
  pass: boolean;
}

export function checkReply(
  c: EvalCase,
  reply: { source: string; answer: string; kind: string | null },
): EvalCheck[] {
  const { expect } = c;
  return [
    { name: `source in [${expect.source.join(", ")}]`, pass: expect.source.includes(reply.source as never) },
    ...(expect.kind ? [{ name: `kind = ${expect.kind}`, pass: reply.kind === expect.kind }] : []),
    ...(expect.mustMatch ?? []).map((re) => ({ name: `matches ${re}`, pass: re.test(reply.answer) })),
    ...(expect.mustNotMatch ?? []).map((re) => ({ name: `does not match ${re}`, pass: !re.test(reply.answer) })),
  ];
}

export async function runCase(
  c: EvalCase,
  deps: Omit<CoachDeps, "onAttempt">,
  run = 0,
): Promise<EvalRecord> {
  const attempts: CoachAttempt[] = [];
  const started = performance.now();
  const reply = await respond(
    {
      recipe: c.recipe,
      stepIndex: c.stepIndex,
      question: c.question,
      locale: c.locale,
      restrictions: [...(c.restrictions ?? [])],
      history: [...(c.history ?? [])],
    },
    { ...deps, onAttempt: (a) => attempts.push(a) },
  );
  const ms = Math.round(performance.now() - started);
  const kind = reply.coach?.kind ?? null;
  const checks = checkReply(c, { source: reply.source, answer: reply.answer, kind });
  return {
    caseId: c.id,
    category: c.category,
    run,
    source: reply.source,
    kind,
    answer: reply.answer,
    attempts,
    ms,
    checks,
    pass: checks.every((ch) => ch.pass),
  };
}

/** 依序回傳 `outputs` 的假模型；用完了就丟錯誤（代表案例沒預料到的呼叫） */
export function fakeDeps(outputs: readonly (string | Error)[]): Omit<CoachDeps, "onAttempt"> {
  let i = 0;
  return {
    hasModel: () => true,
    generate: async () => {
      const out = outputs[i];
      i += 1;
      if (out === undefined) throw new Error("fake model: unexpected extra call");
      if (out instanceof Error) throw out;
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// 統計
// ---------------------------------------------------------------------------

export interface EvalSummary {
  cases: number;
  runs: number;
  expectationPass: { pass: number; total: number };
  modelCalls: number;
  callFailures: number;
  /** 有收到輸出的呼叫中，格式（JSON + 欄位）合格的比例 */
  formatPass: { pass: number; total: number };
  /** 格式合格的輸出中，至少違反一條護欄的比例 */
  guardrailViolations: { violated: number; total: number; byCode: Record<string, number> };
  /** 有呼叫模型的回合中，最後由模型回答／退回備援的次數 */
  servedBy: { model: number; fallback: number };
  /** 跑 2 次以上的案例中，每次的 source 與 kind 都相同的案例數 */
  consistency: { consistent: number; total: number; unstable: string[] };
  /** 有呼叫模型的回合的耗時（毫秒） */
  latencyMs: { median: number | null; max: number | null };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function consistencyOf(records: readonly EvalRecord[]): EvalSummary["consistency"] {
  const byCase = new Map<string, Set<string>>();
  const runsByCase = new Map<string, number>();
  for (const r of records) {
    byCase.set(r.caseId, (byCase.get(r.caseId) ?? new Set()).add(`${r.source}:${r.kind}`));
    runsByCase.set(r.caseId, (runsByCase.get(r.caseId) ?? 0) + 1);
  }
  const repeated = [...byCase.entries()].filter(([id]) => (runsByCase.get(id) ?? 0) >= 2);
  const unstable = repeated.filter(([, outcomes]) => outcomes.size > 1).map(([id]) => id);
  return { consistent: repeated.length - unstable.length, total: repeated.length, unstable };
}

export function summarize(records: readonly EvalRecord[]): EvalSummary {
  const attempts = records.flatMap((r) => r.attempts);
  const answered = attempts.filter((a) => a.raw !== null);
  const wellFormed = answered.filter((a) => a.formatOk);
  const violated = wellFormed.filter((a) => a.violations.length > 0);
  const byCode: Record<string, number> = {};
  for (const code of violated.flatMap((a) => a.violations)) byCode[code] = (byCode[code] ?? 0) + 1;
  const withModel = records.filter((r) => r.attempts.length > 0);

  return {
    cases: new Set(records.map((r) => r.caseId)).size,
    runs: records.length,
    expectationPass: { pass: records.filter((r) => r.pass).length, total: records.length },
    modelCalls: attempts.length,
    callFailures: attempts.length - answered.length,
    formatPass: { pass: wellFormed.length, total: answered.length },
    guardrailViolations: { violated: violated.length, total: wellFormed.length, byCode },
    servedBy: {
      model: withModel.filter((r) => r.source === "model").length,
      fallback: withModel.filter((r) => r.source === "fallback").length,
    },
    consistency: consistencyOf(records),
    latencyMs: {
      median: median(withModel.map((r) => r.ms)),
      max: withModel.length > 0 ? Math.max(...withModel.map((r) => r.ms)) : null,
    },
  };
}
