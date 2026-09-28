"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Food Profile 設定頁（product-spec MVP 第 0 項）
 *
 * 0-1 廚房工具：作為推薦與老師的硬性篩選。
 * 0-2 過敏／飲食限制、人數。
 * Phase 1 先存 localStorage（見 lib/data/profile-client），之後接資料庫。
 * 廚房工具內部仍存中文 canonical 值，畫面依語系顯示翻譯標籤（見 lib/i18n/labels）。
 *
 * 視覺 refinement（2026/09/28）：廚房工具從純文字 chip 改成情境式電器圖卡，
 * 呼應「不是在填表單，而是在讓 AI 認識我的廚房」；只動這頁 UI，功能與資料邏輯不變。
 */
import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "@/lib/data/profile-client";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { toolLabel } from "@/lib/i18n/labels";

const TOOL_OPTIONS = ["電磁爐", "電子鍋", "快煮鍋", "氣炸鍋", "烤箱", "微波爐"];

const TOOL_IMAGES: Record<string, string> = {
  電磁爐: "/landing/tool-induction.png",
  電子鍋: "/landing/tool-rice-cooker.png",
  快煮鍋: "/landing/tool-multicooker.png",
  氣炸鍋: "/landing/tool-airfryer.png",
  烤箱: "/landing/tool-oven.png",
  微波爐: "/landing/tool-microwave.png",
};

export default function SetupPage() {
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [tools, setTools] = useState<string[]>([]);
  const [restrictions, setRestrictions] = useState("");
  const [serving, setServing] = useState(1);
  const [saved, setSaved] = useState(false);

  // 載入既有設定
  useEffect(() => {
    const p = getProfile();
    setTools(p.kitchen_tools);
    setRestrictions(p.dietary_restrictions.join("、"));
    setServing(p.default_serving_size);
  }, []);

  function toggleTool(tool: string) {
    setSaved(false);
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((x) => x !== tool) : [...prev, tool],
    );
  }

  function handleSave() {
    saveProfile({
      kitchen_tools: tools,
      dietary_restrictions: restrictions
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      default_serving_size: serving,
    });
    setSaved(true);
  }

  return (
    <div className="relative overflow-hidden">
      {/* 廚房氛圍裝飾：少量食材/廚具照片點綴邊角，不做滿版背景，保持表單可讀性 */}
      <img
        src="/landing/mushroom.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -left-10 top-24 hidden h-28 w-28 -rotate-12 rounded-full object-cover opacity-70 shadow-lg lg:block"
      />
      <img
        src="/landing/tomato.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-8 top-64 hidden h-24 w-24 rotate-6 rounded-full object-cover opacity-70 shadow-lg lg:block"
      />
      <img
        src="/landing/scallion.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -left-6 bottom-16 hidden h-20 w-20 rotate-[10deg] rounded-full object-cover opacity-70 shadow-md lg:block"
      />

      <div className="relative mx-auto w-full max-w-2xl px-4 py-8">
        <a href="/" className="text-sm text-ink-soft hover:text-ink">
          {t("← Home", "← 回首頁")}
        </a>
        <header className="mb-6 mt-3">
          <h1 className="font-serif text-3xl font-bold text-ink">{t("Basic Setup", "基礎設定")}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {t("This affects recommendations — you can change it anytime.", "這些會影響推薦，之後可隨時修改。")}
          </p>
        </header>

        <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
          <h2 className="font-semibold text-ink">{t("Kitchen Tools", "廚房工具")}</h2>
          <p className="mb-4 mt-0.5 text-sm text-ink-soft">
            {t(
              "Tell me what's in your kitchen, and I'll recommend dishes that match.",
              "告訴我你的廚房有什麼，我會根據這些工具推薦更適合的做法。",
            )}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TOOL_OPTIONS.map((tool) => {
              const selected = tools.includes(tool);
              return (
                <button
                  key={tool}
                  onClick={() => toggleTool(tool)}
                  aria-pressed={selected}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl p-3 ring-2 transition ${
                    selected
                      ? "bg-primary/10 ring-primary"
                      : "bg-cream ring-transparent hover:ring-brand-border"
                  }`}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white shadow-sm">
                      ✓
                    </span>
                  )}
                  <img
                    src={TOOL_IMAGES[tool]}
                    alt={toolLabel(tool, locale)}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  <span
                    className={`text-sm font-medium ${selected ? "text-primary-dark" : "text-ink"}`}
                  >
                    {toolLabel(tool, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
          <h2 className="mb-3 font-semibold text-ink">{t("Allergies / Dietary Restrictions", "過敏／飲食限制")}</h2>
          <input
            className="w-full rounded-xl bg-cream px-4 py-3 outline-none ring-1 ring-brand-border focus:ring-primary"
            placeholder={t("e.g. seafood, peanuts (comma separated)", "例：海鮮、花生（用逗號分隔）")}
            value={restrictions}
            onChange={(e) => {
              setSaved(false);
              setRestrictions(e.target.value);
            }}
          />
        </section>

        <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
          <h2 className="mb-3 font-semibold text-ink">{t("Default Servings", "預設人數")}</h2>
          <input
            type="number"
            min={1}
            className="w-24 rounded-xl bg-cream px-4 py-3 outline-none ring-1 ring-brand-border focus:ring-primary"
            value={serving}
            onChange={(e) => {
              setSaved(false);
              setServing(Math.max(1, Number(e.target.value)));
            }}
          />
        </section>

        <button
          onClick={handleSave}
          className="w-full rounded-full bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-dark"
        >
          {saved ? t("Saved ✓", "已儲存 ✓") : t("Save Settings", "儲存設定")}
        </button>
      </div>
    </div>
  );
}
