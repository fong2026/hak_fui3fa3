const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const API_ROOT = 'https://api.gohakka.org/v3/pro';
const TOKEN = process.env.GOHAKKA_API_TOKEN;
const PUBLIC = path.join(__dirname, 'public');

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function readBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('上傳檔案太大，請縮短錄音後再試。')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function parseMultipart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundary) throw new Error('無法讀取上傳內容。');
  const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
  const parts = new Map(); let cursor = 0;
  while ((cursor = buffer.indexOf(marker, cursor)) !== -1) {
    cursor += marker.length;
    if (buffer.subarray(cursor, cursor + 2).toString() === '--') break;
    if (buffer.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const headEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor); if (headEnd < 0) break;
    const headers = buffer.subarray(cursor, headEnd).toString('utf8');
    const next = buffer.indexOf(marker, headEnd + 4); if (next < 0) break;
    const content = buffer.subarray(headEnd + 4, next - 2);
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    const mime = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || 'application/octet-stream';
    if (name) parts.set(name, { content, filename, mime }); cursor = next;
  }
  return parts;
}
async function callGohakka(endpoint, form) {
  if (!TOKEN) throw new Error('伺服器尚未設定 GOHAKKA_API_TOKEN。請在 Render 環境變數中加入 API Key。');
  const response = await fetch(`${API_ROOT}${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form, signal: AbortSignal.timeout(90000) });
  let payload; try { payload = await response.json(); } catch { throw new Error(`Gohakka API 回應無法解析（${response.status}）。`); }
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || `Gohakka API 呼叫失敗（${response.status}）。`);
  return payload.data;
}
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, configured: Boolean(TOKEN) });
  if (req.method !== 'POST') return send(res, 405, { error: '不支援此方法。' });
  if (!['/api/translate', '/api/speech', '/api/transcribe'].includes(url.pathname)) return send(res, 404, { error: '找不到此 API。' });
  try {
    const body = await readBody(req); const parts = parseMultipart(body, req.headers['content-type']);
    const fields = Object.fromEntries([...parts].filter(([, p]) => !p.filename).map(([k, p]) => [k, p.content.toString('utf8')]));
    const dialects = ['sixian', 'hailu', 'dapu', 'raoping', 'zhaoan', 'nansixian'];
    if (!dialects.includes(fields.dialectCode)) throw new Error('請選擇有效的客語腔調。');
    if (url.pathname === '/api/translate') {
      const text = (fields.text || '').trim(); if (!text || text.length > 1000) throw new Error('題目文字需為 1 至 1000 字。');
      const form = new FormData(); for (const key of ['text', 'dialectCode', 'targetCode', 'engine']) if (fields[key]) form.set(key, fields[key]);
      const data = await callGohakka('/text/translations', form);
      const answer = Array.isArray(data.hak) ? data.hak.join('') : String(data.hak || '');
      if (!answer) throw new Error('Gohakka 沒有回傳客語譯文。');
      return send(res, 200, { answer, pinyin: Array.isArray(data.pinyin) ? data.pinyin.join(' ') : '', zhTW: data.zhTW || text });
    }
    if (url.pathname === '/api/speech') {
      const text = (fields.text || '').trim(); if (!text || text.length > 300) throw new Error('語音文字需為 1 至 300 字。');
      const form = new FormData(); form.set('text', text); form.set('dialectCode', fields.dialectCode); form.set('sourceCode', 'hak');
      const data = await callGohakka('/audio/speech', form);
      return send(res, 200, { audioBase64: data.audioBase64 });
    }
    const audio = parts.get('audioFile'); if (!audio?.content?.length) throw new Error('請先錄下你的答案。');
    if (audio.content.length > 10 * 1024 * 1024) throw new Error('錄音檔不可超過 10 MB。');
    const form = new FormData(); form.set('dialectCode', fields.dialectCode);
    form.set('audioFile', new Blob([audio.content], { type: audio.mime }), audio.filename || 'answer.webm');
    const data = await callGohakka('/audio/transcriptions', form);
    return send(res, 200, { text: data.text || '' });
  } catch (error) {
    return send(res, 400, { error: error.message || '發生錯誤，請稍後再試。' });
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  const filePath = path.resolve(PUBLIC, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!filePath.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: '禁止存取。' });
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, '找不到頁面。', 'text/plain; charset=utf-8');
    const ext = path.extname(filePath); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    send(res, 200, data, types[ext] || 'application/octet-stream');
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Hakka practice platform listening on ${PORT}`));
