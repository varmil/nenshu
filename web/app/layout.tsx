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
import { METADATA_BASE } from "@/lib/seo/site";

export const metadata: Metadata = {
  // 相対パスで書いた canonical をこの起点で絶対URLにする（ADR-0006・U8）。
  // オリジンの定義は `lib/seo/site.ts` の1か所だけに置いてある。
  metadataBase: METADATA_BASE,
  // 各ページが自分で title・description を返すので、ここは受け皿（`/_not-found` など）。
  // `/` の分は `app/page.tsx` の `generateMetadata` が社数つきで組み立てる。
  title: "OpenReport | 有価証券報告書ベースの平均年収ランキング",
  description:
    "金融庁 EDINET の有価証券報告書に載っている平均年間給与そのままの実測値で、上場・非上場の年収を比較する。平均年齢の違いをならした推定年収に切り替えて並べ直すこともできる。",
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
