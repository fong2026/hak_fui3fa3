import { NextResponse } from 'next/server';

export const DIALECTS = ['sixian', 'hailu', 'dapu', 'raoping', 'zhaoan', 'nansixian'] as const;
export type Dialect = (typeof DIALECTS)[number];

const DEFAULTS = {
  translate: 'https://api.gohakka.org/v3/pro/text/translations',
  tts: 'https://api.gohakka.org/v3/pro/audio/speech',
  asr: 'https://api.gohakka.org/v3/pro/audio/transcriptions',
};

export function isDialect(value: unknown): value is Dialect {
  return typeof value === 'string' && DIALECTS.includes(value as Dialect);
}

export function routeError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : '處理請求時發生錯誤。';
  return NextResponse.json({ error: message }, { status });
}

export function upstreamUrl(kind: keyof typeof DEFAULTS) {
  const envName = {
    translate: 'GOHAKKA_TRANSLATE_URL',
    tts: 'GOHAKKA_TTS_URL',
    asr: 'GOHAKKA_ASR_URL',
  }[kind];
  const value = process.env[envName] || DEFAULTS[kind];
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'api.gohakka.org') {
    throw new Error(`${envName} 必須是 api.gohakka.org 上的 HTTPS Gohakka API URL。`);
  }
  return url.toString();
}

export function serverToken() {
  // Credentials remain server-side. Never accept a browser-supplied token header.
  return process.env.GOHAKKA_TOKEN;
}

export async function gohakkaFetch(kind: keyof typeof DEFAULTS, body: FormData) {
  const token = serverToken();
  if (!token) throw new Error('尚未設定伺服器的 GOHAKKA_TOKEN。請在 Vercel 環境變數中設定。');
  const response = await fetch(upstreamUrl(kind), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || `Gohakka API 呼叫失敗（${response.status}）。`);
  }
  return payload?.data;
}
