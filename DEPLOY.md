# 部署到 GCP Cloud Run

專案已設為 Cloud Run 可直接部署：`next.config.mjs` 用 `output: "standalone"`，`Dockerfile` 監聽 `PORT=8080`／`HOSTNAME=0.0.0.0`。
Gemini 金鑰**不進映像檔**，改由 Secret Manager 注入（呼應 CLAUDE.md 鐵則）。

> 這台開發機目前未安裝 `gcloud` 與 Docker，且部署需要你的 GCP 帳號授權，故以下由你在本機執行。指令用 PowerShell 撰寫。

## 一次性前置

1. 安裝 Google Cloud SDK：https://cloud.google.com/sdk/docs/install
2. 登入並選定專案（需已開啟計費）：

```powershell
gcloud auth login
gcloud config set project <你的專案ID>
```

3. 啟用需要的 API：

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

4. 把 Gemini 金鑰放進 Secret Manager（用不含換行的檔案上傳，避免金鑰尾端多換行）：

```powershell
Set-Content -Path key.txt -Value "你的GEMINI金鑰" -NoNewline
gcloud secrets create gemini-api-key --data-file=key.txt
Remove-Item key.txt
```

> 之後要換金鑰：`Set-Content key.txt -Value "新金鑰" -NoNewline; gcloud secrets versions add gemini-api-key --data-file=key.txt; Remove-Item key.txt`

## 部署（每次更新都跑這一行）

從原始碼部署，Cloud Build 會依 `Dockerfile` 建置，**不需本機 Docker**：

```powershell
gcloud run deploy ku-ke --source . --region asia-east1 --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

- `--allow-unauthenticated`：公開網址（Demo 給評審看用）
- `--region asia-east1`：台灣（彰化）
- 完成後會印出服務網址，例如 `https://ku-ke-xxxxxx.a.run.app`

## 若部署後讀不到金鑰

Cloud Run 的執行服務帳號需有讀取該 secret 的權限：

```powershell
$proj = gcloud config get-value project
$num = gcloud projects describe $proj --format="value(projectNumber)"
gcloud secrets add-iam-policy-binding gemini-api-key --member="serviceAccount:$num-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

重新部署後即可生效。

## 備註

- `GEMINI_MODEL` 預設為 `gemini-3.6-flash`（寫在程式碼），要改可加 `--set-env-vars GEMINI_MODEL=<模型>`。
- 目前資料存於使用者瀏覽器 localStorage（Food Profile、作品集），尚未接 Firestore/Supabase；上線多人使用前再接資料庫。
