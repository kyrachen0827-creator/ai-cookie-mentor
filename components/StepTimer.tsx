"use client";

/**
 * 步驟計時器：只在食譜步驟有時間（minutes）時顯示。
 * 時間到時顯示提醒、嗶三聲，支援的手機會震動（瀏覽器不支援就只顯示提醒）。
 * 換步驟時請用 key 重新掛載，計時會自動清掉。
 */
import { useEffect, useRef, useState } from "react";
import { formatClock, remainingSeconds, timerEndsAt } from "@/lib/cook/timer";
import { useLocale } from "@/lib/i18n/LocaleContext";

const TICK_MS = 250;
const BEEP_COUNT = 3;
const BEEP_SECONDS = 0.2;
const BEEP_GAP_SECONDS = 0.35;
const VIBRATE_PATTERN = [300, 150, 300, 150, 300];

/** 嗶三聲；AudioContext 要在使用者點「開始」時建立，手機瀏覽器才允許之後發聲 */
function beep(audio: AudioContext | null) {
  if (!audio) return;
  try {
    for (let i = 0; i < BEEP_COUNT; i += 1) {
      const start = audio.currentTime + i * BEEP_GAP_SECONDS;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + BEEP_SECONDS);
    }
  } catch (err) {
    console.warn("[timer] could not play the alert sound", err);
  }
}

export default function StepTimer({ minutes }: { minutes: number }) {
  const { locale } = useLocale();
  const t = (en: string, zh: string) => (locale === "en" ? en : zh);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt === null || remainingSeconds(endsAt, now) > 0) return;
    setEndsAt(null);
    setDone(true);
    beep(audio.current);
    navigator.vibrate?.(VIBRATE_PATTERN);
  }, [endsAt, now]);

  useEffect(() => () => void audio.current?.close().catch(() => {}), []);

  function start() {
    if (!audio.current) {
      try {
        audio.current = new AudioContext();
      } catch {
        audio.current = null; // 沒有聲音也能用，只是少了嗶聲
      }
    }
    const startedAt = Date.now();
    setNow(startedAt);
    setEndsAt(timerEndsAt(minutes, startedAt));
    setDone(false);
  }

  const running = endsAt !== null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {running ? (
        <>
          <span
            className="rounded-full bg-cream px-3 py-1.5 font-mono text-base font-bold text-primary-dark ring-1 ring-brand-border"
            aria-label={t("Time left", "剩餘時間")}
          >
            ⏱ {formatClock(remainingSeconds(endsAt, now))}
          </span>
          <button
            type="button"
            onClick={() => setEndsAt(null)}
            className="rounded-full px-3 py-1.5 text-ink-soft ring-1 ring-brand-border transition hover:bg-cream"
          >
            {t("Cancel", "取消")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          className="rounded-full bg-primary/10 px-3 py-1.5 font-semibold text-primary-dark ring-1 ring-primary/30 transition hover:bg-primary/20"
        >
          ⏱ {done ? t("Restart timer", "重新計時") : t(`Start ${minutes} min timer`, `開始計時 ${minutes} 分鐘`)}
        </button>
      )}
      <p aria-live="assertive" className="w-full empty:hidden">
        {done && (
          <span className="block rounded-xl bg-accent/10 p-2 font-semibold text-ink">
            🔔 {t("Time's up — check how it looks before moving on.", "時間到了！先看看狀態對不對，再進下一步。")}
          </span>
        )}
      </p>
    </div>
  );
}
