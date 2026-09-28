/**
 * 固定詞彙的顯示翻譯：難易度、廚房工具。
 *
 * 這些值是資料模型的 canonical 中文值（data-model.md Logical Name／
 * recipe-agent 要求 AI 只能從固定中文清單挑 required_tools），不能改成英文，
 * 否則會壞掉工具比對、難易度排序等內部邏輯。此檔只做「顯示時」的語系轉換。
 */
import type { DifficultyLevel } from "@/lib/data/types";
import type { Locale } from "./LocaleContext";

const DIFFICULTY_LABEL: Record<Locale, Record<DifficultyLevel, string>> = {
  zh: { 新手: "新手", 普通: "普通", 需要經驗: "需要經驗" },
  en: { 新手: "Beginner", 普通: "Intermediate", 需要經驗: "Experienced" },
};

export function difficultyLabel(level: DifficultyLevel, locale: Locale): string {
  return DIFFICULTY_LABEL[locale][level] ?? level;
}

const TOOL_LABEL: Record<Locale, Record<string, string>> = {
  zh: {
    電磁爐: "電磁爐",
    電子鍋: "電子鍋",
    快煮鍋: "快煮鍋",
    氣炸鍋: "氣炸鍋",
    烤箱: "烤箱",
    微波爐: "微波爐",
  },
  en: {
    電磁爐: "Induction Cooktop",
    電子鍋: "Rice Cooker",
    快煮鍋: "Multi-Cooker",
    氣炸鍋: "Air Fryer",
    烤箱: "Oven",
    微波爐: "Microwave",
  },
};

export function toolLabel(tool: string, locale: Locale): string {
  return TOOL_LABEL[locale][tool] ?? tool;
}
