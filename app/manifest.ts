import type { MetadataRoute } from "next";

/**
 * PWA 安裝資訊（Next.js 會自動在 <head> 加上 manifest 連結）。
 * 目前只提供「加到主畫面、全螢幕開啟」，沒有離線快取（沒有 service worker）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kuke — AI Cooking Companion",
    short_name: "Kuke",
    description: "Pick a dish, cook step by step, get feedback.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF1E6",
    theme_color: "#E2762D",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
