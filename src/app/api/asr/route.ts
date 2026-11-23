import { NextRequest, NextResponse } from 'next/server';
import { gohakkaFetch, isDialect, routeError } from '@/lib/server/gohakka';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const audio = incoming.get('audio');
    const dialect = incoming.get('dialect');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '請提供不超過 10 MB 的錄音檔。' }, { status: 400 });
    }
    if (!isDialect(dialect)) return NextResponse.json({ error: '不支援的客語腔調。' }, { status: 400 });
    if (incoming.get('demo') === 'true') {
      return NextResponse.json({ error: 'Demo 模式無法辨識音檔；請在支援語音辨識的瀏覽器中使用語音輸入，或設定正式 API Token。' }, { status: 501 });
    }
    // TODO: 替換為 GOHAKKA 官方 ASR API 格式
    const form = new FormData();
    form.set('dialectCode', dialect);
    form.set('audioFile', audio, audio.name || 'speech.webm');
    const data = await gohakkaFetch('asr', form);
    return NextResponse.json({ text: typeof data?.text === 'string' ? data.text : '' });
  } catch (error) {
    return routeError(error);
  }
}
