import type { Metadata, Viewport } from "next";
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
import {
  APPLE_TOUCH_ICON,
  FAVICON_PNG,
  FAVICON_SVG,
  WEB_MANIFEST,
} from "@/lib/brand/assets";
import { BRAND_COLOR } from "@/lib/brand/colors";
import { OPEN_GRAPH_DEFAULTS, TWITTER_DEFAULTS } from "@/lib/seo/openGraph";
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
  /*
    SNS に貼られたときの見え方（S2・Issue #116。図は S4 が用意したもの）。

    **ここに出てくるのはページが `openGraph` を返さないルートだけ**——Next.js の
    メタデータは浅くマージされるので、`toMetadata()`（`lib/seo/pageMeta.ts`）を
    通したページでは入れ子ごと差し替わる。実際に使われるのは `/_not-found` で、
    そこには canonical が無いので `og:url` も出さない（404 に正規URLは無い）。
  */
  openGraph: OPEN_GRAPH_DEFAULTS,
  twitter: TWITTER_DEFAULTS,
  /*
    ブランドのアイコン（S4・Issue #163）。パスと寸法は `lib/brand/assets.ts` が正。

    **SVG を先頭に置く。** 濃色サーフェスでの色の切り替えを持っているのは
    SVG だけで（`@media (prefers-color-scheme: dark)` を中に書いてある）、
    PNG は1色しか持てないフォールバックである。

    **`/favicon.ico` は `<link>` に出さない。** 出すと SVG より先に選ぶ
    ブラウザがあり、切り替えを持たないほうが使われる。固定パスで取りに来る
    相手（RSSリーダー等）のためにファイル自体は `public/` に置いてある。
  */
  icons: {
    icon: [
      { url: FAVICON_SVG, type: "image/svg+xml" },
      ...FAVICON_PNG.map(({ path, size }) => ({
        url: path,
        type: "image/png",
        sizes: `${size}x${size}`,
      })),
    ],
    apple: {
      url: APPLE_TOUCH_ICON.path,
      type: "image/png",
      sizes: `${APPLE_TOUCH_ICON.size}x${APPLE_TOUCH_ICON.size}`,
    },
  },
  manifest: WEB_MANIFEST,
};

/*
 * ブラウザのUIを塗る色（S4・AC-24）。**CSS変数を受け付けない**ので、
 * `lib/brand/colors.ts` の hex を渡す（そこがトークンと一致することは
 * `colors.test.ts` が固定している）。
 *
 * **表示モードで出し分けない。** ライト/ダークの選択は `<html>` のクラスが正で
 * サーバーには送らない（`docs/site-chrome/site-header-theme/design.md`）ため、
 * ここでモードを見ることはできない。1色に決め打つ。
 */
export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
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
