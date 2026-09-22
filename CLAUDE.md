# CLAUDE.md — 給 Claude Code 的工作守則

這份文件是 Claude Code 在這個專案裡工作時的**第一份讀物**。每次開始任務前，先確認要動的內容屬於哪一類，依下面的「內容歸屬表」找到對應檔案，不要另開新檔案或把內容寫錯地方。

---

## 專案是什麼

AI 料理助手 v2：陪伴料理新手「選菜 → 陪做 → 評分」的 App。完整背景見 `docs/spec/product-spec.md`，那是唯一的需求真相來源（single source of truth）。

---

## 內容歸屬表（重要：新增內容前先查這張表）

| 你想寫的內容 | 放在這裡 | 不要放在這裡 |
|---|---|---|
| 產品定位、故事主線、核心痛點、MVP 範圍、不在範圍 | `docs/spec/product-spec.md` | 不要散寫在 README 或程式碼註解 |
| 使用者從開 App 到吃完飯的逐步畫面流程 | `docs/spec/user-flow.md` | 不要跟 roadmap 的階段排程混在一起 |
| 資料實體、欄位（顯示名稱＋Logical Name）、三個 agent 誰讀誰寫 | `docs/spec/data-model.md` | 不要另外在程式碼裡自創新欄位命名，命名要回頭對照這份 |
| 單一 AI agent 的職責、輸入輸出、邊界情況、Prompt 方向 | `docs/spec/agents/recipe-agent.md`、`cooking-teacher-agent.md`、`judge-agent.md`（對應哪一段就寫哪一份） | 不要把三個 agent 的邏輯寫在同一份或混在程式碼裡才第一次定義 |
| 分階段開發順序、每階段做到多完整 | `docs/roadmap.md` | 不要重新描述畫面互動細節（那是 user-flow 的事），只引用 user-flow 的步驟編號 |
| 明確排除、之後不會做的功能 | `docs/out-of-scope.md` | 有人提議加功能時，先查這份，符合就直接說明「這是明確排除的範圍」再詢問使用者 |
| 技術選型、架構決定、資料庫 schema、API 設計 | 程式碼本身＋程式碼內註解／各模組自己的 README（若有） | 不要寫進 `docs/spec/` 下任何檔案——spec 只描述業務行為，不描述技術實作 |
| 規格因故變更（例如評分制從 5 分改成等級） | 直接修改對應 spec 檔案，並在該檔案文末補一段「## 變更紀錄」（日期＋改了什麼＋為什麼） | 不要另開 decisions 檔案 |

**判斷原則**：先問「這是『系統該做什麼』還是『系統怎麼做』」。前者屬於 `docs/spec/`，後者屬於程式碼本身。

---

## 三個 AI Agent 是獨立的

食譜推薦、料理老師、評審是三個職責、觸發時機、輸入輸出都不同的獨立 agent（詳見 `docs/spec/product-spec.md` 的「三個 AI 角色」章節）。實作時：
- 不要把三段邏輯寫進同一個檔案或同一個 prompt
- 三者透過 `docs/spec/data-model.md` 定義的共用資料（料理脈絡）互通，不要讓它們互相硬編碼呼叫對方的內部邏輯
- 老師 agent 依 `docs/roadmap.md` 排定的 A → B → C1 → C2 順序漸進實作，先求 A 版本能跑，不要一次做齊

---

## 不確定規格時怎麼辦

- 先查 `docs/spec/` 下對應檔案，找是否已有定義
- 找不到、或該內容標有「（暫定）」「（待討論）」→ **停下來問使用者**，不要自行假設填補
- 不要在程式碼或 spec 之外的地方，自創新的業務規則（例如自己決定推薦幾道菜、評分用幾分制）

---

## 技術棧

（2026/09/22 定案）

- **前端**：Next.js（React）＋ PWA，手機優先（廚房情境，需相機拍照、麥克風語音）
- **後端**：Next.js API Routes——同一專案內作為「AI 代理層」與資料存取端，不另建獨立後端服務
- **資料**：Firestore 或 Supabase（擇一，實作時再定）；成品照片保存於作品集，直到使用者刪除
- **AI 串接**：Google **Gemini API**（多模態／Vision——評審 agent 需讀成品照片）；三個 agent 皆透過後端代理呼叫
- **部署**：GCP **Cloud Run**（整個 Next.js 打包成容器部署）

### 鐵則：API key 絕不進前端

Gemini API key **只能放伺服器端**（GCP Secret Manager / 環境變數），由 Next.js API Routes 代理呼叫 Gemini。**前端一律呼叫自家 API route，不得在前端程式碼、環境變數（`NEXT_PUBLIC_*`）或 bundle 中出現任何 AI 供應商的 key**——前端程式碼會下載到使用者裝置，等於公開金鑰。

---

## 開發時的檢查習慣

- 改動涉及資料欄位 → 先對照 `docs/spec/data-model.md`，欄位不存在就先去該文件確認是否該新增，而不是程式碼裡先斬後奏
- 改動涉及某個 agent 的行為 → 先看該 agent 對應的 spec 檔案有沒有寫到這個情境
- 新功能沒出現在任何 spec 檔案 → 先確認是否在 `docs/out-of-scope.md`，若沒衝突則詢問使用者是否要先補進 spec 再開工
