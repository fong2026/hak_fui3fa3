import { NextRequest, NextResponse } from 'next/server';
import { gohakkaFetch, isDialect, routeError } from '@/lib/server/gohakka';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEMO: Record<string, { hakkaText: string; pinyin: string }> = {
  '床前明月光': { hakkaText: '眠床前頭月光光', pinyin: 'mienˇ congˇ cienˇ teuˇ ngiedˋ gongˊ gongˊ' },
  '疑是地上霜': { hakkaText: '像係地泥項个霜', pinyin: 'ciongˋ heˇ ti ngiˇ hongˋ geˇ songˊ' },
  '舉頭望明月': { hakkaText: '擎頭望明月', pinyin: 'kiangˇ teuˇ mong ngiˇ ngiedˋ' },
  '低頭思故鄉': { hakkaText: '低頭想故鄉', pinyin: 'deuˊ teuˇ xiongˋ guˋ hiongˊ' },
};

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    const lines = input?.lines;
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 80 || lines.some((line: unknown) => typeof line !== 'string' || line.trim().length > 1000)) {
      return NextResponse.json({ error: '請提供 1 至 80 行文字，每行不可超過 1000 字。' }, { status: 400 });
    }
    if (!isDialect(input.dialect)) return NextResponse.json({ error: '不支援的客語腔調。' }, { status: 400 });
    const cleanLines = lines.map((line: string) => line.trim());
    if (input.demo === true) {
      return NextResponse.json({ lines: cleanLines.map((original: string, index: number) => {
        const sample = DEMO[original];
        return { original, hakkaText: sample?.hakkaText || (index % 2 ? '逐日學講客家話' : '用心來講客家話'), pinyin: sample?.pinyin || 'cagˋ ngidˋ hogˋ gongˋ hagˊ gaˊ fa' };
      }) });
    }

    const translated = await Promise.all(cleanLines.map(async (line: string) => {
      // TODO: 替換為 GOHAKKA 官方翻譯 API Request/Response 欄位格式
      const form = new FormData();
      form.set('text', line); form.set('dialectCode', input.dialect); form.set('targetCode', 'hak'); form.set('engine', 'model');
      const data = await gohakkaFetch('translate', form);
      const hakkaText = Array.isArray(data?.hak) ? data.hak.join('') : String(data?.hak || '');
      const pinyin = Array.isArray(data?.pinyin) ? data.pinyin.join(' ') : String(data?.pinyin || '');
      return { original: line, hakkaText, pinyin };
    }));
    return NextResponse.json({ lines: translated });
  } catch (error) {
    return routeError(error);
  }
}
