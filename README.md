# 講客｜客語會話練習

以 Gohakka Pro API 練習臺灣客語日常會話：讀中文情境、取得客語參考答案、播放合成語音、錄音後辨識並查看字元相似度回饋。

## 本機執行

需求：Node.js 20 以上。

1. 複製 `.env.example` 為 `.env`，填入 Gohakka Pro API Key。不要把 `.env` 提交到 Git。
2. 執行 `npm start`，開啟 `http://localhost:3000`。

伺服器只從 `GOHAKKA_API_TOKEN` 讀取金鑰；瀏覽器不會接觸金鑰。瀏覽器錄音需在 localhost 或 HTTPS 下使用。

## Render 部署

此專案含 `render.yaml`。在 Render 建立 Blueprint，選擇此 GitHub repository，並於服務的 Environment 設定 `GOHAKKA_API_TOKEN`。部署使用 `npm install` 與 `npm start`。健康檢查端點為 `/api/health`。

## Gohakka Pro API

服務端呼叫 `https://api.gohakka.org/v3/pro`：

- `POST /text/translations`：以 `multipart/form-data` 將情境翻譯為客語。
- `POST /audio/speech`：取得參考答案的 Base64 語音。
- `POST /audio/transcriptions`：將瀏覽器錄音送回客語文字。
- 驗證使用 `Authorization: Bearer <API Key>`。

目前腔調選單涵蓋四縣、海陸、大埔、饒平、詔安、南四縣。評分使用辨識結果與參考答案的字元編輯距離估算相似度；API 提供的是語音轉文字，並非發音或聲調評分，因此分數用作練習回饋，不代表口說正確率。TTS API 規格未標明音訊格式，前端依常見 WAV 回應播放；若服務回傳格式不同，需依實際回應調整 MIME type。

## 環境變數

| 名稱 | 說明 |
|---|---|
| `GOHAKKA_API_TOKEN` | Gohakka Pro API Key（必要） |
| `PORT` | HTTP port；Render 會自動提供 |
