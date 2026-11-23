import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '客韻工作室 Hakka Lyric Studio',
  description: '將華語歌詞或古典詩詞譯為客語漢字與拼音，逐行編輯並聆聽客語語音。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
