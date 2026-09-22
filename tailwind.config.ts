import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 灶火 ZaoHuo 品牌暖色系
        cream: "#FBF1E6", // 頁面底色
        surface: "#FFFDFA", // 卡片
        ink: "#34251C", // 標題深棕
        "ink-soft": "#6B5747", // 內文
        primary: {
          DEFAULT: "#E2762D", // 主橘（logo、按鈕）
          dark: "#CC6522",
        },
        accent: "#C0562B", // 強調紅橘（標題關鍵字、徽章文字）
        herb: "#6C8A57", // 料理老師綠
        "brand-border": "#EFE3D4",
        // 評分深色區
        "dark-cook": "#2E211A",
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', "system-ui", "sans-serif"],
        serif: ['"Noto Serif TC"', "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
