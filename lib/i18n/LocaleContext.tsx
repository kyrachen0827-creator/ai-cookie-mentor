"use client";

/**
 * 全站語系狀態（比賽要求：繳交材料需英文，App 預設英文，可切換中文）。
 *
 * 只管語系本身；不動 Recipe.difficulty_level / required_tools 等資料模型的中文
 * canonical 值（data-model.md 的 Logical Name）——那些值只在顯示層透過
 * lib/i18n/labels.ts 轉換，內部比對／儲存邏輯不受語系影響。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "en" | "zh";

const STORAGE_KEY = "zaohuo.locale";
const DEFAULT_LOCALE: Locale = "en";

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLocaleState(saved);
    } catch {
      /* 忽略讀取失敗，維持預設英文 */
    }
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* 忽略儲存失敗 */
    }
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
