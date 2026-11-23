import { NextRequest, NextResponse } from 'next/server';
import { makeDemoWav } from '@/lib/server/demoAudio';
import { gohakkaFetch, isDialect, routeError } from '@/lib/server/gohakka';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 300) {
      return NextResponse.json({ error: '語音文字需為 1 至 300 字。' }, { status: 400 });
    }
    if (!isDialect(input.dialect)) return NextResponse.json({ error: '不支援的客語腔調。' }, { status: 400 });
    if (input.demo === true) {
      return new NextResponse(makeDemoWav(input.text), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
    }
    // TODO: 替換為 GOHAKKA 官方 TTS API 格式
    const form = new FormData();
    form.set('text', input.text); form.set('dialectCode', input.dialect); form.set('sourceCode', 'hak');
    const data = await gohakkaFetch('tts', form);
    if (typeof data?.audioBase64 !== 'string') throw new Error('Gohakka TTS 未回傳 audioBase64。');
    const bytes = Buffer.from(data.audioBase64, 'base64');
    return new NextResponse(bytes, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return routeError(error);
  }
}
