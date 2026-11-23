export interface LyricLine {
  original: string;
  hakkaText: string;
  pinyin: string;
}

function readAscii(view: DataView, offset: number, length: number) {
  return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
}

function parseWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') throw new Error('TTS 回傳的不是有效 WAV 音檔。');
  let offset = 12; let format: ArrayBuffer | null = null; let data: Uint8Array | null = null;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4); const size = view.getUint32(offset + 4, true); const start = offset + 8;
    if (start + size > view.byteLength) throw new Error('WAV 音檔區塊格式不完整。');
    if (id === 'fmt ') format = buffer.slice(start, start + size);
    if (id === 'data') data = new Uint8Array(buffer.slice(start, start + size));
    offset = start + size + (size % 2);
  }
  if (!format || !data) throw new Error('WAV 缺少格式或音訊資料。');
  return { format, data };
}

export function mergeWavBuffers(buffers: ArrayBuffer[]): Blob {
  if (!buffers.length) throw new Error('目前沒有可合併的音訊。');
  const parsed = buffers.map(parseWav); const first = parsed[0];
  if (parsed.some(item => item.format.byteLength !== first.format.byteLength || new Uint8Array(item.format).some((v, i) => v !== new Uint8Array(first.format)[i]))) {
    throw new Error('各句 TTS 的 WAV 音訊格式不一致，無法合併。');
  }
  const dataLength = parsed.reduce((sum, item) => sum + item.data.byteLength, 0);
  const output = new ArrayBuffer(12 + 8 + first.format.byteLength + 8 + dataLength);
  const view = new DataView(output);
  const write = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, output.byteLength - 8, true); write(8, 'WAVE');
  let offset = 12; write(offset, 'fmt '); view.setUint32(offset + 4, first.format.byteLength, true);
  new Uint8Array(output, offset + 8, first.format.byteLength).set(new Uint8Array(first.format)); offset += 8 + first.format.byteLength;
  write(offset, 'data'); view.setUint32(offset + 4, dataLength, true); offset += 8;
  for (const item of parsed) { new Uint8Array(output, offset, item.data.byteLength).set(item.data); offset += item.data.byteLength; }
  return new Blob([output], { type: 'audio/wav' });
}

export function makeLrc(lines: LyricLine[], secondsPerLine = 3.5) {
  return lines.map((line, index) => {
    const total = Math.floor(index * secondsPerLine);
    const minutes = Math.floor(total / 60).toString().padStart(2, '0');
    const seconds = (total % 60).toString().padStart(2, '0');
    const centiseconds = Math.floor((index * secondsPerLine % 1) * 100).toString().padStart(2, '0');
    return `[${minutes}:${seconds}.${centiseconds}]${line.hakkaText}`;
  }).join('\n');
}
