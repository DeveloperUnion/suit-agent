import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
  Noto_Sans_JP,
} from "next/font/google";
import { AgentDock } from "@/components/agent/agent-dock";
import { AgentProvider } from "@/components/agent/agent-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// 和文。CJK は全サブセットのプリロードが重すぎるため preload を切る
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

// 欧文見出し・数値。製図と技術帳票の顔
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// 帳票の詰まった項目ラベル用
const plexCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "TORICO",
  description: "採寸・注文・メッセージを1枚にまとめた顧客カルテ",
};

/**
 * 既定値を上書きするので width と initialScale も明示する。
 *
 * interactiveWidget を足しているのは、スマホでソフトキーボードが出たときに
 * レイアウトビューポート自体を縮めてもらうため。既定の resizes-visual だと
 * dvh が変わらず、下端に置いた入力欄がキーボードの下に隠れる。
 * これを実装していない iOS Safari 向けの手当ては
 * lib/hooks/use-visual-viewport.ts にある。
 *
 * viewportFit: "cover" は入れない。入れるとページがホームバーの下まで描画され、
 * サイドバー・ヘッダー・各画面の下端すべてに safe-area 対応が要る。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} ${plexSans.variable} ${plexMono.variable} ${plexCondensed.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/*
          AgentProvider は AppShell の外側に置く。中の画面が
          「いま誰の話をしているか」を Context に名乗るため、上位にいる必要がある。
        */}
        <TooltipProvider delayDuration={200}>
          <AgentProvider>
            <AppShell>{children}</AppShell>
            <AgentDock />
          </AgentProvider>
        </TooltipProvider>
        {/* 右下は AI アシスタントの FAB が占めているので、その上に積む */}
        <Toaster
          position="bottom-right"
          offset={{ bottom: "5.5rem" }}
          mobileOffset={{ bottom: "5.5rem" }}
        />
      </body>
    </html>
  );
}
