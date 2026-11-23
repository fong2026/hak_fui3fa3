function writeText(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

export function makeDemoWav(seedText: string, durationSeconds = 0.75): ArrayBuffer {
  const sampleRate = 22050;
  const length = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  writeText(view, 0, 'RIFF'); view.setUint32(4, 36 + length * 2, true);
  writeText(view, 8, 'WAVE'); writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(view, 36, 'data'); view.setUint32(40, length * 2, true);
  const notes = [392, 440, 523.25, 587.33, 523.25, 440];
  let hash = 0; for (const char of seedText) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const note = notes[hash % notes.length];
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 18, (durationSeconds - t) * 8);
    const sample = Math.sin(2 * Math.PI * note * t) * Math.sin(Math.PI * t / durationSeconds) * 0.14 * Math.max(0, envelope);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return buffer;
}
