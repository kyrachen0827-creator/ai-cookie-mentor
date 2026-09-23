# AI 料理助手（v2）

陪伴料理新手「選菜 → 陪做 → 評分」的 App。想吃某個食材卻不知道能做什麼、做到一半沒人可以問、做完不知道好不好——這三個痛點，分別由三段 AI 負責：食譜推薦、料理老師、評審。

## 文件地圖

| 想找什麼 | 去哪裡看 |
|---|---|
| 產品定位、故事主線、MVP 範圍 | [`docs/spec/product-spec.md`](docs/spec/product-spec.md) |
| 使用者操作流程 | [`docs/spec/user-flow.md`](docs/spec/user-flow.md) |
| 資料模型、三個 agent 共用什麼 | [`docs/spec/data-model.md`](docs/spec/data-model.md) |
| 各 AI agent 的職責細節 | [`docs/spec/agents/`](docs/spec/agents/) |
| 開發階段排程 | [`docs/roadmap.md`](docs/roadmap.md) |
| 明確不做的功能 | [`docs/out-of-scope.md`](docs/out-of-scope.md) |
| 給 Claude Code 的工作守則 | [`CLAUDE.md`](CLAUDE.md) |

新增文件內容前，請先查 `CLAUDE.md` 裡的「內容歸屬表」，確認該放在哪一份檔案，避免內容散落各處。

## 技術棧

Next.js（App Router, TypeScript）＋ Tailwind CSS，手機優先 PWA；後端用 Next.js API Routes 作為 AI 代理層；AI 串接 Google Gemini；部署 GCP Cloud Run。詳見 [`CLAUDE.md`](CLAUDE.md) 的「技術棧」段，部署步驟見 [`DEPLOY.md`](DEPLOY.md)。

## 快速上手

```bash
npm install
cp .env.local.example .env.local   # 填入 GEMINI_API_KEY（未填也能跑，推薦頁會用範例資料）
npm run dev                         # http://localhost:3000
```

其他指令：`npm run build`（正式建置）、`npm start`（啟動建置後的服務）。

> **安全鐵則**：Gemini API key 只放 server 端（`.env.local` / Cloud Run 環境變數），絕不加 `NEXT_PUBLIC_` 前綴、絕不進前端。

## 專案結構（Phase 1）

```
app/                        前端頁面（手機優先 PWA）
├─ page.tsx                 食材輸入            ← MVP 1
├─ setup/                   Food Profile 設定    ← MVP 0
├─ recommend/              推薦結果             ← MVP 2
├─ shopping-list/          缺料清單             ← MVP 3
└─ api/agents/recipe/      食譜推薦代理（key 只在此）→ Gemini
lib/
├─ data/types.ts           料理脈絡型別（對照 data-model.md 的 Logical Name）
├─ data/store.ts           資料存取介面（Firestore/Supabase 之後接，暫用記憶體）
├─ ai/gemini.ts            Gemini 封裝（server-only）
└─ agents/recipe/          食譜推薦 agent（prompt + 難易度/時間規則）
Dockerfile                  Cloud Run 部署
```

三個 AI agent 各自獨立（見 `docs/spec/agents/`），透過 `lib/data/types.ts` 定義的料理脈絡互通，不互相硬編碼呼叫。目前只實作 agent ①（食譜推薦）；老師、評審依 roadmap 於 Phase 2、3 加入。

## 目前狀態

規格已定版（2026/09/22，見各 spec 文末「變更紀錄」）。程式進度：Phase 1 專案骨架完成、可編譯執行；推薦 agent 的 Gemini 回傳解析與規則把關為下一步（見 `lib/agents/recipe/index.ts` 的 TODO）。
