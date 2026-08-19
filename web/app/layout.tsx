import type { Metadata } from "next";
import Script from "next/script";
import { NavProgressBar } from "@/features/navigation/components/NavProgressBar";
import "./globals.css";
import {
  CLARITY_PROJECT_ID,
  buildClarityScript,
  isClarityEnabled,
} from "@/lib/analytics/clarity";

export const metadata: Metadata = {
  title: "年齢補正年収ランキング（開発中）",
  description: "年齢で補正した年収でランキングを比較する。サイト名は未確定（docs/ranking/spec.md 5. 未決事項）。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {/* ページ間の遷移中に上端へ細いバーを出す（`features/navigation`）。 */}
        <NavProgressBar />
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
