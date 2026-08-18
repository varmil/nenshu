import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import {
  CLARITY_PROJECT_ID,
  buildClarityScript,
  isClarityEnabled,
} from "@/lib/analytics/clarity";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "年齢補正年収ランキング（開発中）",
  description: "年齢で補正した年収でランキングを比較する。サイト名は未確定（docs/ranking/spec.md 5. 未決事項）。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
