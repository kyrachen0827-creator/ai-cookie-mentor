# 開發階段規劃

> 描述「先做什麼、再做什麼、每階段做到多完整」。不重新描述畫面互動細節——互動細節見 `docs/spec/user-flow.md`，這裡只引用其步驟編號並標註做到什麼程度。

## 階段劃分（草稿，待補實際時程）

### Phase 1：核心流程堪用版

對應 user-flow 步驟 1–5（首次設定 → 輸入食材 → 推薦 → 缺料清單）。

- [ ] Food Profile：廚房工具、過敏／飲食限制、人數
- [ ] 食材輸入（文字）
- [ ] AI agent ①食譜推薦：MVP 規則（見 `docs/spec/agents/recipe-agent.md`）
- [ ] 缺料清單顯示與勾選

### Phase 2：老師 A + B

對應 user-flow 步驟 6，做到料理老師的 A、B 兩層（見 `docs/spec/agents/cooking-teacher-agent.md`）。

- [x] 備料確認、一步一畫面（A）
- [x] 文字提問（A）
- [ ] 計時（B）
- [ ] 拍照問狀態（B）

### Phase 3：評審

對應 user-flow 步驟 7–8。

- [x] 拍照引導
- [x] AI agent ③評審：三項分數＋做得好的點＋改進點（見 `docs/spec/agents/judge-agent.md`）

### Phase 4：作品集 + 老師 C1

對應 user-flow 步驟 9，以及料理老師語音互動（C1）。

- [x] 收藏食譜、完成作品存入作品集
- [ ] 老師語音提問／播報（C1，未做）

### Phase 5（視時間，挑戰目標）：老師 C2 主動偵測

見 `docs/spec/agents/cooking-teacher-agent.md` C2 章節。時間不足時最先砍。

## 定案

- v2 仍為比賽／Demo 導向；**Demo 前最低限度範圍＝Phase 1–3**（推薦 → 老師 A+B → 評審）。對應 product-spec 待討論事項 10。

## 待確認

- 每階段的實際時程／deadline（待補）
