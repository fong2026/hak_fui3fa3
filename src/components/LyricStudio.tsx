'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AudioLines, BookOpen, Check, ChevronDown, Clipboard, Download, FileAudio2,
  FileText, Languages, LoaderCircle, Mic, Mic2, Pause, Play, Radio, Settings2,
  Sparkles, Square, Volume2, Waves, X,
} from 'lucide-react';
import { LyricLine, makeLrc, mergeWavBuffers } from '@/lib/wavUtils';

const DIALECTS = [
  { value: 'sixian', label: '四縣腔' }, { value: 'hailu', label: '海陸腔' },
  { value: 'dapu', label: '大埔腔' }, { value: 'raoping', label: '饒平腔' },
  { value: 'zhaoan', label: '詔安腔' },
];
const EXAMPLES = [
  { title: '靜夜思', text: '床前明月光\n疑是地上霜\n舉頭望明月\n低頭思故鄉' },
  { title: '望春風', text: '獨夜無伴守燈下\n春風對面吹\n十七八歲未出嫁\n看著少年家' },
  { title: '桐花五月雪', text: '五月桐花落滿山\n風吹花雪過庄頭\n阿姆在屋下等人\n一聲山歌入夢來' },
];

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResultLike = { 0: SpeechRecognitionAlternative; isFinal: boolean };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fileSlug(value: string) { return value.trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'hakka-lyrics'; }

export default function LyricStudio() {
  const [source, setSource] = useState(EXAMPLES[0].text);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [dialect, setDialect] = useState('sixian');
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState('');
  const [activeLine, setActiveLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPinyin, setShowPinyin] = useState(true);
  const [recording, setRecording] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeLineRef = useRef(-1);
  const audioUrlRef = useRef('');
  const stopRequestedRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hakka-lyric-studio-settings');
      if (saved) {
        const parsed = JSON.parse(saved) as { dialect?: string; demo?: boolean; showPinyin?: boolean; source?: string };
        if (DIALECTS.some(item => item.value === parsed.dialect)) setDialect(parsed.dialect!);
        if (typeof parsed.demo === 'boolean') setDemo(parsed.demo);
        if (typeof parsed.showPinyin === 'boolean') setShowPinyin(parsed.showPinyin);
        if (typeof parsed.source === 'string') setSource(parsed.source);
      }
    } catch { /* Ignore malformed local preferences. */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('hakka-lyric-studio-settings', JSON.stringify({ dialect, demo, showPinyin, source }));
  }, [dialect, demo, showPinyin, source]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (activeLine < 0) return;
    const row = document.getElementById(`lyric-${activeLine}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeLine]);

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3500); }
  function sourceLines() { return source.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
  async function translate() {
    const inputLines = sourceLines();
    if (!inputLines.length) return flash('請先輸入歌詞或詩詞。');
    if (inputLines.length > 80) return flash('一次最多翻譯 80 行。');
    setBusy('translate'); setActiveLine(-1); setPlayProgress(0);
    try {
      const response = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: inputLines, dialect, demo }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '翻譯失敗，請稍後重試。');
      setLines(data.lines as LyricLine[]); flash(demo ? '已載入 Demo 翻譯結果' : '翻譯完成');
    } catch (error) { flash(error instanceof Error ? error.message : '翻譯失敗。'); }
    finally { setBusy(''); }
  }
  function updateLine(index: number, key: 'hakkaText' | 'pinyin', value: string) {
    setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }
  async function getAudio(text: string) {
    const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dialect, demo }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || '語音合成失敗。'); }
    return response.blob();
  }
  async function playBlob(blob: Blob, index: number) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob); audioUrlRef.current = url;
    const audio = new Audio(url); audioRef.current = audio; activeLineRef.current = index; setActiveLine(index); setPlaying(true);
    audio.ontimeupdate = () => { if (audio.duration) setPlayProgress(audio.currentTime / audio.duration); };
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => { if (stopRequestedRef.current) resolve(); };
      audio.onerror = () => reject(new Error('無法播放這段音訊。'));
      audio.play().catch(reject);
    });
    setPlaying(false); setPlayProgress(0);
  }
  async function playOne(index: number) {
    const line = lines[index]; if (!line?.hakkaText.trim()) return flash('請先填入客語漢字。');
    setBusy(`line-${index}`);
    try { await playBlob(await getAudio(line.hakkaText), index); }
    catch (error) { flash(error instanceof Error ? error.message : '語音播放失敗。'); setPlaying(false); }
    finally { stopRequestedRef.current = false; setBusy(''); }
  }
  async function stopPlayback() {
    stopRequestedRef.current = true; audioRef.current?.pause(); audioRef.current = null;
    setPlaying(false); setActiveLine(-1); setPlayProgress(0);
  }
  async function playAll() {
    if (!lines.length) return flash('請先翻譯歌詞。');
    if (busy === 'playall' && audioRef.current) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { await audioRef.current.play(); setPlaying(true); }
      return;
    }
    setBusy('playall'); stopRequestedRef.current = false;
    try {
      for (let i = 0; i < lines.length; i++) {
        if (stopRequestedRef.current) break;
        const text = lines[i].hakkaText.trim(); if (!text) continue;
        const blob = await getAudio(text);
        if (stopRequestedRef.current) break;
        await playBlob(blob, i);
      }
      setActiveLine(-1); setPlayProgress(0);
    } catch (error) { flash(error instanceof Error ? error.message : '全曲播放失敗。'); }
    finally { stopRequestedRef.current = false; setPlaying(false); setBusy(''); }
  }
  async function downloadFullWav() {
    if (!lines.length) return flash('請先翻譯歌詞。');
    setBusy('download');
    try {
      const buffers: ArrayBuffer[] = [];
      for (const line of lines) {
        if (!line.hakkaText.trim()) continue;
        buffers.push(await (await getAudio(line.hakkaText)).arrayBuffer());
      }
      triggerDownload(mergeWavBuffers(buffers), `${fileSlug(lines[0]?.original || 'hakka-lyrics')}.wav`);
    } catch (error) { flash(error instanceof Error ? error.message : '音檔匯出失敗。'); }
    finally { setBusy(''); }
  }
  function exportText(mode: 'hakka' | 'bilingual' | 'txt' | 'lrc') {
    if (!lines.length) return flash('請先翻譯歌詞。');
    const content = mode === 'hakka' ? lines.map(line => line.hakkaText).join('\n')
      : mode === 'bilingual' ? lines.map(line => `${line.original}\n${line.hakkaText}\n${line.pinyin}`).join('\n\n')
        : mode === 'lrc' ? makeLrc(lines) : lines.map(line => `${line.original}\n${line.hakkaText}\n${line.pinyin}`).join('\n\n');
    const ext = mode === 'lrc' ? 'lrc' : 'txt';
    triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), `hakka-lyrics.${ext}`);
  }
  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); flash('已複製到剪貼簿。'); }
    catch { flash('複製失敗，請檢查瀏覽器剪貼簿權限。'); }
  }
  async function startAsr() {
    if (recording) {
      recognitionRef.current?.stop();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      setRecording(false); streamRef.current?.getTracks().forEach(track => track.stop()); return;
    }
    const speech = window as SpeechWindow;
    const SpeechRecognition = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    if (demo && SpeechRecognition) {
      const recognition = new SpeechRecognition(); recognitionRef.current = recognition;
      recognition.lang = 'zh-TW'; recognition.interimResults = false;
      recognition.onresult = event => {
        const result = event.results[event.resultIndex]?.[0]?.transcript;
        if (result) setSource(current => current.trim() ? `${current.trimEnd()}\n${result}` : result);
      };
      recognition.onerror = () => flash('瀏覽器語音輸入失敗，請檢查麥克風權限。');
      recognition.onend = () => setRecording(false);
      try { recognition.start(); setRecording(true); }
      catch { flash('無法啟動語音輸入。'); }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      const recorder = new MediaRecorder(stream); recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const form = new FormData(); form.set('audio', audio, 'recording.webm'); form.set('dialect', dialect); form.set('demo', String(demo));
        try {
          const response = await fetch('/api/asr', { method: 'POST', body: form }); const data = await response.json();
          if (!response.ok) throw new Error(data.error || '語音辨識失敗。');
          setSource(current => current.trim() ? `${current.trimEnd()}\n${data.text}` : data.text);
        } catch (error) { flash(error instanceof Error ? error.message : '語音辨識失敗。'); }
      };
      recorder.start(); setRecording(true);
    } catch { flash('請允許使用麥克風後再試。'); }
  }

  const dialectLabel = DIALECTS.find(item => item.value === dialect)?.label;
  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-30 border-b border-indigoHakka/10 bg-tung/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigoHakka text-amber-100 shadow-md"><AudioLines size={23} /></div>
            <div className="min-w-0"><p className="truncate font-serif text-lg font-bold text-indigoHakka">華客歌詞與詩詞翻譯暨語音合成工作室</p><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-indigoHakka/45">HAKKA LYRIC STUDIO</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-indigoHakka/10 bg-white px-3 py-2 text-xs font-semibold text-indigoHakka"><Languages size={15} /><select value={dialect} onChange={event => setDialect(event.target.value)} className="bg-transparent outline-none">{DIALECTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={13} /></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-indigoHakka/10 bg-white px-3 py-2 text-xs font-semibold text-indigoHakka"><span className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigoHakka/15"><input type="checkbox" checked={demo} onChange={event => setDemo(event.target.checked)} className="peer sr-only"/><span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all ${demo ? 'left-0.5 !bg-persimmon' : 'left-[18px]'}`}/></span>Demo {demo && <span className="text-persimmon">ON</span>}</label>
            <button onClick={() => setSettingsOpen(true)} className="icon-button" aria-label="API 設定"><Settings2 size={17}/><span>API 設定</span></button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 pt-7 lg:px-8 lg:pt-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[.16em] text-persimmon"><Sparkles size={15}/>客家聲韻・逐行琢磨</p><h1 className="font-serif text-3xl font-bold tracking-wide text-indigoHakka md:text-4xl">讓文字，唱成客家話。</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">貼上華語歌詞或古典詩詞，逐句翻譯、修訂漢字與拼音，再用客語聽見作品的新聲音。</p></div>
          <div className="flex items-center gap-2 rounded-full border border-indigoHakka/10 bg-white/70 px-3 py-2 text-[11px] text-slate-500"><span className={`h-2 w-2 rounded-full ${demo ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{demo ? '展示模式：免 API 金鑰' : `正式 API · ${dialectLabel}`}</div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(330px,.86fr)_minmax(0,1.4fr)]">
          <section className="panel flex min-h-[680px] flex-col">
            <div className="panel-heading"><div className="flex items-center gap-3"><span className="section-icon"><BookOpen size={19}/></span><div><h2 className="font-serif text-lg font-bold text-indigoHakka">華語原文</h2><p className="text-[11px] text-slate-400">貼上歌詞／詩詞，每行會分開翻譯</p></div></div><span className="chip">SOURCE TEXT</span></div>
            <div className="flex flex-wrap gap-2 px-5 pt-4">{EXAMPLES.map(item => <button key={item.title} onClick={() => setSource(item.text)} className="example-button"><FileText size={13}/>{item.title}</button>)}</div>
            <div className="relative flex-1 px-5 py-4"><div className="absolute bottom-6 left-8 top-6 w-px bg-persimmon/25"/><textarea value={source} onChange={event => setSource(event.target.value)} placeholder="在此貼上華語歌詞或詩詞…" className="source-area" aria-label="華語原文輸入"/><div className="absolute bottom-7 right-8 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-400">{sourceLines().length} 行</div></div>
            <div className="border-t border-slate-100 px-5 py-4">
              <button onClick={startAsr} className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${recording ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-indigoHakka/10 bg-white text-indigoHakka hover:border-indigoHakka/30'}`}><Mic size={15}/>{recording ? '停止語音輸入' : '語音輸入 (ASR)'}</button>
              <button onClick={translate} disabled={!!busy} className="primary-button w-full">{busy === 'translate' ? <LoaderCircle className="animate-spin" size={17}/> : <Languages size={17}/>} {busy === 'translate' ? '正在翻譯…' : '翻譯成客語'} <span className="ml-auto rounded-lg bg-white/15 px-2 py-1 text-[10px]">{dialectLabel}</span></button>
              <p className="mt-3 text-center text-[10px] leading-5 text-slate-400">{demo ? 'Demo 使用內建範例資料；切換正式模式會透過伺服器連線 Gohakka。' : 'Token 僅由伺服器讀取，不會存入瀏覽器或 localStorage。'}</p>
            </div>
          </section>

          <section className="panel min-h-[680px] overflow-hidden">
            <div className="panel-heading flex-wrap"><div className="flex items-center gap-3"><span className="section-icon bg-persimmon/10 text-persimmon"><Languages size={19}/></span><div><h2 className="font-serif text-lg font-bold text-indigoHakka">客語譯稿</h2><p className="text-[11px] text-slate-400">漢字與拼音都可以直接編輯</p></div></div><div className="flex flex-wrap items-center gap-1.5">
              <button className="toolbar-button" onClick={() => copyText(lines.map(line => line.hakkaText).join('\n'))}><Clipboard size={13}/>複製客語</button>
              <button className="toolbar-button" onClick={() => exportText('bilingual')}><BookOpen size={13}/>華客對照</button>
              <button className="toolbar-button" onClick={() => exportText('txt')}><Download size={13}/>TXT</button>
              <button className="toolbar-button" onClick={() => exportText('lrc')}><FileAudio2 size={13}/>LRC</button>
            </div></div>
            <div ref={scrollerRef} className="max-h-[610px] space-y-3 overflow-y-auto bg-slate-50/55 p-4 md:p-5">
              {!lines.length ? <div className="grid min-h-[400px] place-items-center rounded-2xl border border-dashed border-indigoHakka/15 bg-white/70 p-8 text-center"><div><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigoHakka/5 text-indigoHakka/50"><Waves size={26}/></div><p className="font-serif text-base font-semibold text-indigoHakka/75">譯稿將在這裡逐行展開</p><p className="mt-2 text-xs leading-6 text-slate-400">從左側選一組範例，或貼上自己的文字<br/>按「翻譯成客語」開始編輯。</p></div></div> : lines.map((line, index) => <article key={`${index}-${line.original}`} id={`lyric-${index}`} className={`lyric-row ${activeLine === index ? 'lyric-active' : ''}`}>
                <div className="flex items-start gap-3"><span className={`line-number ${activeLine === index ? 'bg-persimmon text-white' : ''}`}>{String(index + 1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><p className="mb-2 text-xs font-medium leading-5 text-slate-400">{line.original}</p><label className="sr-only">客語漢字第 {index + 1} 行</label><input className="hakka-input" value={line.hakkaText} onChange={event => updateLine(index, 'hakkaText', event.target.value)} placeholder="客語漢字…"/>
                  {showPinyin && <input className="pinyin-input" value={line.pinyin} onChange={event => updateLine(index, 'pinyin', event.target.value)} placeholder="客語拼音…"/>}
                  <div className="mt-2 flex items-center gap-1.5"><button onClick={() => playOne(index)} disabled={!!busy} className="row-action"><Volume2 size={13}/>{busy === `line-${index}` ? '合成中' : '單句試聽'}</button><button onClick={() => copyText(`${line.hakkaText}\n${line.pinyin}`)} className="row-action"><Clipboard size={13}/>複製此句</button><button onClick={() => setShowPinyin(current => !current)} className="row-action ml-auto"><span>{showPinyin ? '隱藏拼音' : '顯示拼音'}</span></button></div>
                </div></div>
              </article>)}
            </div>
          </section>
        </div>
      </section>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-indigoHakka/15 bg-tung/95 shadow-[0_-10px_35px_rgba(30,58,95,.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-5 py-3 lg:px-8">
          <div className="hidden min-w-[180px] items-center gap-3 md:flex"><div className={`grid h-10 w-10 place-items-center rounded-xl ${playing ? 'bg-persimmon/10 text-persimmon' : 'bg-indigoHakka/5 text-indigoHakka/45'}`}><Radio size={19} className={playing ? 'animate-pulse' : ''}/></div><div><p className="text-xs font-bold text-indigoHakka">{playing ? `正在朗讀第 ${activeLine + 1} 句` : '全曲語音播放器'}</p><p className="text-[10px] text-slate-400">{lines.length ? `${lines.length} 句 · ${dialectLabel}` : '翻譯後即可播放'}</p></div></div>
          <div className="flex flex-1 items-center gap-2"><button onClick={playAll} disabled={!lines.length || (!!busy && busy !== 'playall')} className="player-main" aria-label={playing ? '暫停播放' : busy === 'playall' ? '繼續播放' : '播放全曲'}>{playing ? <Pause size={17} fill="currentColor"/> : busy === 'playall' ? <Play size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><button onClick={stopPlayback} disabled={!playing && busy !== 'playall'} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-indigoHakka/10 text-indigoHakka/55 transition hover:bg-indigoHakka/5 disabled:opacity-30" aria-label="停止播放"><Square size={12} fill="currentColor"/></button><div className="flex min-w-0 flex-1 flex-col gap-2"><div className="flex items-center justify-between text-[10px] text-slate-400"><span>{playing && activeLine >= 0 ? `第 ${activeLine + 1} / ${lines.length} 句` : '準備播放'}</span><span className="wave-bars" aria-hidden="true">{Array.from({length:22}, (_,i)=><i key={i} style={{'--bar':`${8 + (i * 17 % 15)}px`} as React.CSSProperties} className={playing ? 'wave-playing' : ''}/>)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-indigoHakka/10"><div className="h-full rounded-full bg-persimmon transition-all" style={{width: `${playing ? ((activeLine + playProgress) / Math.max(1, lines.length)) * 100 : 0}%`}}/></div></div></div>
          <button onClick={downloadFullWav} disabled={!lines.length || !!busy} className="download-button"><Download size={15}/><span className="hidden sm:inline">{busy === 'download' ? '合成中…' : '下載全曲 WAV'}</span><span className="sm:hidden">WAV</span></button>
        </div>
      </footer>

      {settingsOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-indigoHakka/35 p-4 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-full max-w-lg rounded-3xl border border-white/70 bg-tung p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-persimmon">Server configuration</p><h2 id="settings-title" className="font-serif text-xl font-bold text-indigoHakka">Gohakka API 設定</h2></div><button onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="關閉"><X size={18}/></button></div>
        <div className="rounded-2xl border border-indigoHakka/10 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-indigoHakka"><Settings2 size={16}/>安全設定方式</div><p className="text-xs leading-6 text-slate-500">API Token 與外部 API URL 必須設定在伺服器端，不能放入瀏覽器或 localStorage。請在本機 `.env.local` 或 Vercel Project → Settings → Environment Variables 設定：</p><div className="my-3 space-y-1 rounded-xl bg-indigoHakka/[.04] p-3 font-mono text-[11px] text-indigoHakka"><p>GOHAKKA_TOKEN</p><p>GOHAKKA_TRANSLATE_URL</p><p>GOHAKKA_TTS_URL</p><p>GOHAKKA_ASR_URL</p></div><p className="text-[11px] leading-5 text-slate-400">URL 只接受官方 <code>https://api.gohakka.org</code> 網域，避免伺服器代理被用來存取任意網址。設定後重新部署，再關閉 Demo Mode。</p></div>
        <button onClick={() => setSettingsOpen(false)} className="primary-button mt-5 w-full justify-center"><Check size={16}/>知道了</button>
      </section></div>}
      {notice && <div role="status" className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-indigoHakka px-4 py-3 text-xs font-semibold text-white shadow-xl">{notice}</div>}
    </main>
  );
}
