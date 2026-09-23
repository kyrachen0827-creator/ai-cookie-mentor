# 資料模型（v2）

> 定義三個 AI agent 共用的「料理脈絡」由哪些實體與欄位組成，誰讀誰寫。只描述業務資料，不涉及資料庫技術選型或 schema 實作（那是 Claude Code 該決定的事）。

## 實體關係總覽

```
Food Profile (1) ─┬─ 有多個 → Cooking Session (n)
                   │
Recipe (1) ────────┴─ 被選入 → Cooking Session (n)
                             │
                             └─ 產出 → Score (0..1)

Portfolio Entry ── 引用 → Recipe 或 Cooking Session
```

## 實體定義

### Food Profile（food_profile）

使用者的基礎設定，跨次料理沿用。

| 顯示名稱 | Logical Name | 說明 |
|---|---|---|
| 廚房工具 | kitchen_tools | 多選，如氣炸鍋、烤箱 |
| 過敏／飲食限制 | dietary_restrictions | 安全底線，推薦前必須排除 |
| 預設人數 | default_serving_size | |

讀寫：① 推薦、② 老師（讀）；使用者於設定頁（寫）

### Recipe（recipe）

一道菜的完整定義。

| 顯示名稱 | Logical Name | 說明 |
|---|---|---|
| 菜名 | recipe_name | |
| 難易度 | difficulty_level | 新手／普通／需要經驗，規則判斷產出 |
| 預估時間 | estimated_time_minutes | 規則判斷產出 |
| 所需廚房工具 | required_tools | 對照 Food Profile 過濾用 |
| 食材清單 | ingredients | 含份量 |
| 步驟 | steps | 每步含動作、火力、時間、「怎麼看出做對了」 |
| 成品標準 | finished_dish_standard | 老師與評審共用對照，v2 新增的關鍵欄位 |

讀寫：① 推薦（生成／寫）；② 老師、③ 評審（讀，對照成品標準）

### Cooking Session（cooking_session）

三個 agent 共用「料理脈絡」的核心，一次完整的做菜歷程。

| 顯示名稱 | Logical Name | 說明 |
|---|---|---|
| 關聯食譜 | recipe_id | |
| 目前步驟 | current_step | 老師用來記錄進度 |
| 缺料清單 | missing_ingredients | 動態扣除 |
| 過程紀錄 | session_log | 老師的提醒、使用者拍照問狀態、中途照片的紀錄（採完整版，必記錄） |
| 狀態 | session_status | 進行中／已完成／中止 |

讀寫：② 老師（讀寫，主要操作者）；③ 評審（讀，取得過程紀錄做為評分脈絡）

### Score（score）

評審結果。

| 顯示名稱 | Logical Name | 說明 |
|---|---|---|
| 關聯 Session | session_id | |
| 成品照片 | dish_photo | 保存於作品集，直到使用者刪除，不設自動過期 |
| 色彩搭配分數 | color_score | 整數 1–5 |
| 色彩搭配依據 | color_evidence | 該分數「照片中看到什麼」的依據 |
| 擺盤造型分數 | plating_score | 整數 1–5 |
| 擺盤造型依據 | plating_evidence | 該分數「照片中看到什麼」的依據 |
| 烹調完成度分數 | doneness_score | 整數 1–5 |
| 烹調完成度依據 | doneness_evidence | 該分數「照片中看到什麼」的依據 |
| 總分 | total_score | 三項加總，1–15（由三項換算，不獨立評分） |
| 做得好的點 | strength_comment | 具體 |
| 下次改進點 | improvement_comment | 具體、可操作 |

讀寫：③ 評審（寫）；作品集（讀）

### Portfolio Entry（portfolio_entry）

收藏與作品集。

| 顯示名稱 | Logical Name | 說明 |
|---|---|---|
| 類型 | entry_type | 收藏食譜 ／ 完成作品 |
| 關聯食譜或 Session | ref_id | |

## 跨 agent 共用範圍

對應 `product-spec.md` MVP 第 7 項，定案採**完整版**。

**共用基礎**：三段共用
- `recipe_id`
- `finished_dish_standard`
- `kitchen_tools`
- `dietary_restrictions`

**完整版加項（定案納入）**：再加上
- `session_log`
- 歷次 `score` 記錄

例：老師知道使用者「火開太大」（寫入 `session_log`），評審看到焦痕時能據此回應（讀取 `session_log`）——完整版支援此情境。

## 變更紀錄

- 2026/09/22｜隨 product-spec 定案更新：料理脈絡採完整版（`session_log` 必記錄、納入歷次 `score`）；`color_score`／`plating_score`／`doneness_score` 定為整數 1–5，新增 `total_score`（1–15）；`dish_photo` 保存至使用者刪除｜product-spec 待討論事項 2、5、8 拍板
- 2026/09/23｜Score 新增三項「依據」欄位 `color_evidence`／`plating_evidence`／`doneness_evidence`，對應 judge-agent「每個分數附『照片中看到什麼』的依據」的輸出，原欄位僅存分數無處存依據｜Phase 3 評審實作
