# hakka-lyric-studio

華語歌詞與古典詩詞的客語翻譯、逐行編輯與語音工作室。以 Next.js App Router / TypeScript 建置，Gohakka Pro API 只由伺服器 Route Handlers 呼叫。

## 功能

- 華語歌詞及詩詞逐行翻譯為客語漢字、拼音，可手動編輯。
- 四縣、海陸、大埔、饒平、詔安五種腔調選擇。
- 單句 TTS、全曲逐句連播與同步高亮。
- 合併下載 WAV、匯出 TXT、LRC 與華客對照稿。
- 麥克風語音輸入：Demo 模式使用瀏覽器的 Web Speech API；正式模式使用 Gohakka ASR。
- Demo 模式預設開啟，含《靜夜思》、《望春風》、《桐花五月雪》範例。
- 腔調、Demo 狀態、拼音顯示與草稿以 localStorage 儲存。API Token 不會存進 localStorage 或瀏覽器。

## 本機開發

需求：Node.js 24.22.1（已固定於 `.node-version`）。

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟 <http://localhost:3000>。PowerShell 複製環境範例可用：

```powershell
Copy-Item .env.example .env.local
```

Demo 模式不需要 Token。要使用正式 API，在 `.env.local` 設定 `GOHAKKA_TOKEN`，並把工作列的 Demo 開關關閉。

## 環境變數

| 名稱 | 用途 | 預設值 |
| --- | --- | --- |
| `GOHAKKA_TOKEN` | Gohakka Pro API Key，只供伺服器讀取 | 必填（正式 API） |
| `GOHAKKA_TRANSLATE_URL` | 翻譯 Route Handler 上游 URL | `https://api.gohakka.org/v3/pro/text/translations` |
| `GOHAKKA_TTS_URL` | TTS Route Handler 上游 URL | `https://api.gohakka.org/v3/pro/audio/speech` |
| `GOHAKKA_ASR_URL` | ASR Route Handler 上游 URL | `https://api.gohakka.org/v3/pro/audio/transcriptions` |

端點覆寫值會限制在官方 `api.gohakka.org` HTTPS 網域。不要使用 `NEXT_PUBLIC_` 前綴，不要將 `.env.local` 或 Token 提交到 Git。使用者可在前端自訂的 Token 或任意 URL 會暴露憑證或造成伺服器端請求偽造風險，因此本專案只支援部署端環境變數。

## API Route Handlers

- `POST /api/translate`: `{ lines: string[], dialect: string, demo?: boolean }`；正式模式逐行呼叫 Gohakka 翻譯。
- `POST /api/tts`: `{ text: string, dialect: string, demo?: boolean }`；回傳 WAV 音訊。Demo 模式回傳合成提示音，不是客語語音。
- `POST /api/asr`: multipart `audio`、`dialect`、`demo`；正式模式轉送 Gohakka ASR。

正式模式使用隨附的 Gohakka Pro OpenAPI 欄位：Bearer API Key、multipart 表單、`dialectCode`、`targetCode`、`audioFile`，TTS 回應的 `audioBase64` 以 WAV 傳回。ASR 只提供語音轉文字；此應用沒有聲學發音評分 API。

WAV 合併工具假設各句 TTS 使用相同 PCM WAV 參數；若上游格式不同，會明確顯示錯誤，不會輸出錯誤音檔。LRC 時間使用每句 3.5 秒估算，適合預覽，並非實際語音校準時間。

## GitHub 與 Render 部署

本專案提供 `render.yaml` Blueprint，設定 Node Web Service、健康檢查、建置／啟動指令及 Gohakka API URL。

1. 將專案推送到 GitHub。
2. 登入 Render，選 **New → Blueprint**，連結 GitHub 並選擇此 repository。
3. Render 讀取 `render.yaml` 後建立 `hakka-lyric-studio` Web Service。Blueprint 首次建立時，Render 會要求填入 `GOHAKKA_TOKEN`。
4. 請使用新產生的 Gohakka Pro API Key 填入該欄位。切勿把 Token 寫入程式碼、GitHub 或前端設定。
5. 建置指令為 `npm install && npm run build`，啟動指令為 `npm start`。完成後以 `/api/health` 健康檢查。
6. 部署成功後可先用預設開啟的 Demo 模式操作，再關閉 Demo 使用 Gohakka API。

Render 部署為完整 Next.js Node Web Service，API Routes 在同一個服務執行。`vercel.json` 保留作 Vercel 部署使用，Render 以 Blueprint 的 Web Service 指令為準。正式 API 呼叫設有 25 秒 upstream timeout；長歌詞翻譯會逐行呼叫 Gohakka，建議分段處理。
