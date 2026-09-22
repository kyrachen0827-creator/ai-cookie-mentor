"use client";

/**
 * Food Profile 設定頁（product-spec MVP 第 0 項）
 *
 * 0-1 廚房工具：作為推薦與老師的硬性篩選。
 * 0-2 過敏／飲食限制、人數。
 * Phase 1 先存 localStorage（見 lib/data/profile-client），之後接資料庫。
 */
import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "@/lib/data/profile-client";

const TOOL_OPTIONS = ["電磁爐", "電子鍋", "快煮鍋", "氣炸鍋", "烤箱", "微波爐"];

export default function SetupPage() {
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

  function toggleTool(t: string) {
    setSaved(false);
    setTools((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <a href="/" className="text-sm text-ink-soft hover:text-ink">
        ← 回首頁
      </a>
      <header className="mb-6 mt-3">
        <h1 className="font-serif text-3xl font-bold text-ink">基礎設定</h1>
        <p className="mt-1 text-sm text-ink-soft">這些會影響推薦，之後可隨時修改。</p>
      </header>

      <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
        <h2 className="mb-3 font-semibold text-ink">廚房工具</h2>
        <div className="flex flex-wrap gap-2">
          {TOOL_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTool(t)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                tools.includes(t)
                  ? "bg-primary text-white ring-primary"
                  : "bg-cream text-ink-soft ring-brand-border hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
        <h2 className="mb-3 font-semibold text-ink">過敏／飲食限制</h2>
        <input
          className="w-full rounded-xl bg-cream px-4 py-3 outline-none ring-1 ring-brand-border focus:ring-primary"
          placeholder="例：海鮮、花生（用逗號分隔）"
          value={restrictions}
          onChange={(e) => {
            setSaved(false);
            setRestrictions(e.target.value);
          }}
        />
      </section>

      <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-brand-border">
        <h2 className="mb-3 font-semibold text-ink">預設人數</h2>
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
        {saved ? "已儲存 ✓" : "儲存設定"}
      </button>
    </div>
  );
}
