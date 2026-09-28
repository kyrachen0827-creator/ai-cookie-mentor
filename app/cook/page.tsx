"use client";

/**
 * 料理老師陪做頁（product-spec MVP 第 4 項，A 版）
 *
 * 對應 cooking-teacher-agent.md A：備料確認 → 一步一畫面（動作/火力/時間/怎麼看出做對了）
 * → 安全提醒 → 隨時文字提問（呼叫 /api/agents/teacher）→ 上一步/重複/中途離開回進度。
 * 進度與過程紀錄存於 Cooking Session（lib/data/session-client）。
 *
 * current_step：0 = 備料確認；1..N = 第 N 步；N+1 = 完成。
 * 語系：locale 隨提問請求送到後端，老師直接以該語系回答（見 teacher agent）。
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/data/types";
import { getSafetyHints } from "@/lib/agents/teacher/safety";
import { notableTools } from "@/lib/recipe-tools";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { toolLabel } from "@/lib/i18n/labels";
import {
  appendLog,
  getSession,
  setCurrentStep,
  setStatus,
  startOrResume,
} from "@/lib/data/session-client";

const SELECTED_KEY = "zaohuo.selectedRecipe";

interface QA {
  q: string;
  a: string;
}

function Cook() {
  const params = useSearchParams();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [step, setStep] = useState(0);
  const [qa, setQa] = useState<QA[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [repeated, setRepeated] = useState(false);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  // 載入選定食譜 + 還原進度
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    let r: Recipe | null = null;
    try {
      const raw = sessionStorage.getItem(SELECTED_KEY);
      if (raw) r = JSON.parse(raw) as Recipe;
    } catch {
      /* 忽略 */
    }
    const id = params.get("recipe");
    if (!r && id) {
      const s = getSession(id);
      if (s) r = s.recipe;
    }
    if (r) {
      const s = startOrResume(r);
      setRecipe(r);
      setStep(s.current_step);
    }
    setReady(true);
  }, [params]);

  if (!ready) {
    return <p className="px-4 py-8 text-ink-soft">Loading…</p>;
  }

  if (!recipe) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <p className="text-ink-soft">{t("No recipe selected yet.", "還沒有選定的食譜。")}</p>
        <a href="/" className="mt-3 inline-block text-primary underline">
          {t("Back home to pick one", "回首頁挑一道")}
        </a>
      </div>
    );
  }

  const total = recipe.steps.length;

  function goStep(n: number) {
    setStep(n);
    setRepeated(false);
    setQa([]); // 換步驟清空問答，避免上一步的問題殘留在這一步下方
    if (recipe) {
      setCurrentStep(recipe, n);
      if (n > total) setStatus(recipe, "已完成");
    }
  }

  async function ask() {
    const qtext = question.trim();
    if (!recipe || !qtext || asking) return;
    setQuestion("");
    setAsking(true);
    setQa((prev) => [...prev, { q: qtext, a: "" }]);
    appendLog(recipe, { source: "使用者狀態", content: `Step ${step} question: ${qtext}` });
    try {
      const res = await fetch("/api/agents/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe,
          stepIndex: step >= 1 && step <= total ? step - 1 : null,
          question: qtext,
          locale,
        }),
      });
      const data = await res.json();
      const ans = res.ok
        ? (data.answer as string)
        : (data.error ?? t("Failed to answer", "回答失敗"));
      appendLog(recipe, { source: "老師提醒", content: ans });
      setQa((prev) =>
        prev.map((item, i) => (i === prev.length - 1 ? { ...item, a: ans } : item)),
      );
    } catch {
      setQa((prev) =>
        prev.map((item, i) =>
          i === prev.length - 1
            ? { ...item, a: t("Something went wrong — try asking again.", "網路出了點問題，請再問一次。") }
            : item,
        ),
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-5">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Leave (progress saved)", "← 離開（進度會保留）")}
        </a>
        <h1 className="mt-3 font-serif text-2xl font-bold text-ink">
          {recipe.recipe_name}
        </h1>
      </header>

      {/* 進度條 */}
      <div className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-ink-soft">
          <span>
            {step === 0
              ? t("Mise en place", "備料確認")
              : step > total
                ? t("Done", "完成")
                : t(`Step ${step} / ${total}`, `第 ${step} / ${total} 步`)}
          </span>
          {step >= 1 && step <= total && <span>{Math.round((step / total) * 100)}%</span>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-brand-border/60">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${step === 0 ? 4 : Math.min(100, (step / total) * 100)}%` }}
          />
        </div>
      </div>

      {/* ===== 備料確認（唯讀快速清點；詳細勾選已在缺料清單完成，修 U3 不重複）===== */}
      {step === 0 && (
        <section>
          <h2 className="mb-1 font-serif text-lg font-bold text-ink">
            {t("Quick check before you start", "開始前，快速看一眼")}
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            {t("Once these are ready, you can start cooking.", "這些準備好就可以開火囉。")}
          </p>
          <div className="mb-3 rounded-2xl bg-surface p-4 ring-1 ring-brand-border">
            <p className="text-ink">
              {recipe.ingredients.map((i) => `${i.name} ${i.amount}`.trim()).join(t(", ", "、"))}
            </p>
          </div>
          {notableTools(recipe.required_tools).length > 0 && (
            <p className="mb-6 text-sm text-ink-soft">
              {t("Tools you'll use", "會用到的器具")}：
              {notableTools(recipe.required_tools).map((tool) => toolLabel(tool, locale)).join(t(", ", "、"))}
            </p>
          )}
          <button
            onClick={() => goStep(1)}
            className="w-full rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark"
          >
            {t("All set, let's start", "都備好了，開始做")}
          </button>
        </section>
      )}

      {/* ===== 一步一畫面 ===== */}
      {step >= 1 && step <= total && (
        <StepView
          step={recipe.steps[step - 1]}
          index={step}
          total={total}
          repeated={repeated}
          onPrev={() => goStep(step - 1)}
          onRepeat={() => setRepeated(true)}
          onNext={() => goStep(step + 1)}
          qa={qa}
          question={question}
          setQuestion={setQuestion}
          asking={asking}
          onAsk={ask}
        />
      )}

      {/* ===== 完成 ===== */}
      {step > total && (
        <section className="text-center">
          <div className="mb-4 text-4xl">🎉</div>
          <h2 className="font-serif text-2xl font-bold text-ink">{t("All done!", "完成了！")}</h2>
          <p className="mx-auto mt-2 max-w-sm text-ink-soft">
            {t(
              `Nice work — your ${recipe.recipe_name} is ready. Snap a photo for the AI judge and see how it went!`,
              `辛苦了，${recipe.recipe_name} 做好了。拍張照給 AI 評審打分數，看看這次表現如何吧！`,
            )}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href={`/judge?recipe=${recipe.id}`}
              className="w-full rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark"
            >
              {t("Get scored by the judge", "拍照給評審打分")}
            </a>
            <a
              href="/"
              className="w-full rounded-full bg-surface px-4 py-3 font-semibold text-ink ring-1 ring-brand-border"
            >
              {t("Back home", "回首頁")}
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- 單一步驟畫面 ---------- */
function StepView({
  step,
  index,
  total,
  repeated,
  onPrev,
  onRepeat,
  onNext,
  qa,
  question,
  setQuestion,
  asking,
  onAsk,
}: {
  step: Recipe["steps"][number];
  index: number;
  total: number;
  repeated: boolean;
  onPrev: () => void;
  onRepeat: () => void;
  onNext: () => void;
  qa: QA[];
  question: string;
  setQuestion: (v: string) => void;
  asking: boolean;
  onAsk: () => void;
}) {
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const hints = getSafetyHints(step, locale);

  return (
    <section>
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
        <div className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
          {step.heat &&
            !["無", "免", "不需要", "無需", "-", "—", "none", "no heat", "n/a"].includes(
              step.heat.trim().toLowerCase(),
            ) && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary-dark">
              🔥 {step.heat}
            </span>
          )}
          {step.minutes ? (
            <span className="rounded-full bg-cream px-2 py-0.5 ring-1 ring-brand-border">
              ⏱ {t(`~${step.minutes} min`, `約 ${step.minutes} 分`)}
            </span>
          ) : null}
        </div>
        <p className="font-serif text-xl font-bold leading-relaxed text-ink">
          {step.action}
        </p>
        <div className="mt-3 rounded-xl bg-herb/10 p-3 text-sm text-ink">
          <span className="font-semibold text-herb">{t("How to tell it's right: ", "怎麼看出做對了：")}</span>
          {step.doneness_cue}
        </div>

        {/* 安全提醒 */}
        {hints.length > 0 && (
          <div className="mt-3 rounded-xl bg-accent/10 p-3 text-sm text-ink">
            {hints.map((h, i) => (
              <p key={i} className="flex gap-1.5">
                <span className="text-accent">⚠️</span>
                <span>{h}</span>
              </p>
            ))}
          </div>
        )}

        {repeated && (
          <p className="mt-3 text-xs text-ink-soft">
            {t("↑ Re-read this step — take your time.", "↑ 已再讀一次這一步，慢慢來。")}
          </p>
        )}
      </div>

      {/* 導航 */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onPrev}
          className="flex-1 rounded-full bg-surface px-4 py-3 text-sm font-semibold text-ink ring-1 ring-brand-border"
        >
          {index === 1 ? t("Back to prep", "回備料") : t("Previous", "上一步")}
        </button>
        <button
          onClick={onRepeat}
          className="rounded-full bg-surface px-4 py-3 text-sm font-semibold text-ink ring-1 ring-brand-border"
        >
          {t("Repeat", "重複")}
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          {index === total ? t("Finish", "完成") : t("Next", "下一步")}
        </button>
      </div>

      {/* 隨時提問 */}
      <div className="mt-6">
        <h3 className="mb-2 font-semibold text-ink">{t("Stuck? Ask the teacher", "卡住了？問老師")}</h3>
        <div className="flex flex-col gap-3">
          {qa.map((item, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-white">
                {item.q}
              </div>
              <div className="self-start rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-ink ring-1 ring-brand-border">
                {item.a || (asking && i === qa.length - 1 ? t("Thinking…", "老師想一下…") : "")}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 ring-1 ring-brand-border">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAsk()}
            placeholder={t("e.g. how hot should the pan be? how do I tell it's cooked?", "例：火要多大？怎麼看有沒有熟？")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft/60"
          />
          <button
            onClick={onAsk}
            disabled={asking}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {asking ? "…" : t("Ask", "問")}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function CookPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">Loading…</p>}>
      <Cook />
    </Suspense>
  );
}
