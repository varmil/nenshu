import type { Metadata } from "next";
import Script from "next/script";
import { NavProgressBar } from "@/features/navigation/components/NavProgressBar";
import { SiteHeader } from "@/features/navigation/components/SiteHeader";
import { buildThemeScript } from "@/features/theme/lib/themeScript";
import "./globals.css";
import {
  CLARITY_PROJECT_ID,
  buildClarityScript,
  isClarityEnabled,
} from "@/lib/analytics/clarity";

export const metadata: Metadata = {
  title: "OpenReport | 年収ランキング",
  description:
    "有価証券報告書の平均年間給与を年齢で補正し、その年齢時点の年収でランキングを比較する。上場・非上場1,867社。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning は <html> のクラスを下のインラインスクリプトが
    // Reactの外で書き換えるため。これが無いとハイドレーション時に警告が出る。
    <html lang="ja" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/*
          表示モードを最初の描画より前に確定させる（Issue #68）。
          next/script ではなく素の <script> なのは、HTMLパーサを止めてでも
          先に走ってほしいため。next/script の strategy はどれも
          「描画をブロックしない」ことが目的で、ここで欲しい性質と逆になる。
          詳細は features/theme/lib/themeScript.ts。
        */}
        <script dangerouslySetInnerHTML={{ __html: buildThemeScript() }} />
        {/* ページ間の遷移中に上端へ細いバーを出す（`features/navigation`）。 */}
        <NavProgressBar />
        <SiteHeader />
        {children}
        {/*
          Microsoft Clarity（Issue #44）。
          strategy="afterInteractive" はNext.jsが解析系スクリプトに推奨する既定値で、
          ハイドレーションが始まってから読み込まれるため初期表示を遅らせない。
        */}
        {isClarityEnabled(process.env.NODE_ENV) && (
          <Script
            id="ms-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: buildClarityScript(CLARITY_PROJECT_ID),
            }}
          />
        )}
      </body>
    </html>
  );
}
