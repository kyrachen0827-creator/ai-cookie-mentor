"use client";

/**
 * 評審頁（product-spec MVP 第 5 項）
 *
 * 對應 judge-agent.md：拍照引導 → 上傳成品照 → 呼叫 /api/agents/judge（Gemini Vision）
 * → 三項分數（各 1–5）＋依據＋一個做得好的點＋一個改進點；太暗/太糊/非料理 → 請重拍。
 * 明確註明「照片看不出味道與熟度」。可重新拍照重評。
 * 語系：locale 隨請求送到後端，評審直接以該語系輸出依據與評語（見 judge agent）。
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Recipe, Score } from "@/lib/data/types";
import { getSession } from "@/lib/data/session-client";
import { addCompleted } from "@/lib/data/portfolio-client";
import type { JudgeScoreResult } from "@/lib/agents/judge";
import { useLocale } from "@/lib/i18n/LocaleContext";

const SELECTED_KEY = "zaohuo.selectedRecipe";

/** 縮圖並轉 base64，控制上傳大小、加速 Vision */
function fileToResized(
  file: File,
  maxDim = 1024,
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read photo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unrecognized photo format"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not process photo"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function Judge() {
  const params = useSearchParams();
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JudgeScoreResult>();
  const [retake, setRetake] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
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
    setRecipe(r);
    setReady(true);
  }, [params]);

  async function onPick(file: File) {
    if (!recipe) return;
    setLoading(true);
    setResult(undefined);
    setRetake(undefined);
    setError(undefined);
    try {
      const { dataUrl, base64, mimeType } = await fileToResized(file);
      setPreview(dataUrl);

      const sessionLog = getSession(recipe.id)?.session_log ?? [];
      const res = await fetch("/api/agents/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe,
          sessionLog,
          image: { mimeType, dataBase64: base64 },
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("Scoring failed", "評分失敗"));

      if (data.ok === false) {
        setRetake(data.message as string);
        return;
      }

      const r = data.result as JudgeScoreResult;
      setResult(r);

      // 存入作品集（含縮圖）供回顧進步
      const score: Score = {
        id: `score-${recipe.id}-${Date.now()}`,
        session_id: `session-${recipe.id}`,
        dish_photo: dataUrl,
        color_score: r.color_score,
        color_evidence: r.color_evidence,
        plating_score: r.plating_score,
        plating_evidence: r.plating_evidence,
        doneness_score: r.doneness_score,
        doneness_evidence: r.doneness_evidence,
        total_score: r.total_score,
        strength_comment: r.strength_comment,
        improvement_comment: r.improvement_comment,
      };
      addCompleted(recipe, score);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Scoring failed", "評分失敗"));
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-5">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Home", "← 回首頁")}
        </a>
        <h1 className="mt-3 font-serif text-2xl font-bold text-ink">
          {t(`Score your ${recipe.recipe_name}`, `給 ${recipe.recipe_name} 打分數`)}
        </h1>
      </header>

      {/* 拍照引導 */}
      {!result && (
        <div className="mb-4 rounded-2xl bg-surface p-4 text-sm text-ink-soft ring-1 ring-brand-border">
          <p className="mb-1 font-semibold text-ink">{t("Photo tips", "拍照小提醒")}</p>
          {t(
            "Good lighting, the whole plate in frame, shot from about a 45° angle — that scores best.",
            "光線充足、整盤入鏡、從斜上方 45 度拍，成品會更好評。",
          )}
        </div>
      )}

      {preview && (
        <img
          src={preview}
          alt={t("Finished dish", "成品照")}
          className="mb-4 w-full rounded-2xl object-cover ring-1 ring-brand-border"
        />
      )}

      {loading && <p className="text-ink-soft">{t("Judge is looking at the photo…", "評審看照片中…")}</p>}
      {error && <p className="text-accent">{error}</p>}

      {retake && (
        <div className="mb-4 rounded-2xl bg-accent/10 p-4 text-sm text-ink">
          <p className="font-semibold text-accent">{t("Can't score this one", "這張先不給分")}</p>
          {retake}
        </div>
      )}

      {/* 評分結果 */}
      {result && (
        <div className="mb-4 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="font-serif text-lg font-bold text-ink">{t("Total", "總分")}</span>
            <span className="font-serif text-4xl font-bold text-primary">
              {result.total_score}
              <span className="text-lg text-ink-soft"> / 15</span>
            </span>
          </div>

          <ScoreRow label={t("Color", "色彩搭配")} value={result.color_score} evidence={result.color_evidence} />
          <ScoreRow label={t("Plating", "擺盤與造型")} value={result.plating_score} evidence={result.plating_evidence} />
          <ScoreRow label={t("Doneness", "烹調完成度")} value={result.doneness_score} evidence={result.doneness_evidence} />

          <div className="mt-4 rounded-xl bg-herb/10 p-3 text-sm text-ink">
            <span className="font-semibold text-herb">{t("Nice work 👍 ", "做得好 👍 ")}</span>
            {result.strength_comment}
          </div>
          <div className="mt-2 rounded-xl bg-primary/10 p-3 text-sm text-ink">
            <span className="font-semibold text-primary-dark">{t("Next time ✨ ", "下次可以 ✨ ")}</span>
            {result.improvement_comment}
          </div>

          <p className="mt-4 text-xs text-ink-soft">
            {t("※ Scoring is appearance only — a photo can't show taste or doneness inside.", "※ 評分只看得到外觀，照片看不出味道與熟度。")}
          </p>
        </div>
      )}

      {/* 上傳 / 重拍 */}
      <label className="block">
        <span className="flex w-full cursor-pointer items-center justify-center rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark">
          {result || retake ? t("Retake & rescore", "重新拍照重評") : t("Take / choose a photo", "拍照 / 選照片上傳")}
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  evidence,
}: {
  label: string;
  value: number;
  evidence: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-3">
        <span className="w-20 text-sm text-ink">{label}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-border/60">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(value / 5) * 100}%` }}
          />
        </div>
        <span className="w-8 text-right text-sm font-semibold text-ink">{value}/5</span>
      </div>
      {evidence && <p className="pl-20 text-xs text-ink-soft">{evidence}</p>}
    </div>
  );
}

export default function JudgePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-ink-soft">Loading…</p>}>
      <Judge />
    </Suspense>
  );
}
