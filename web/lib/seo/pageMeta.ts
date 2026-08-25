import type { Metadata } from "next";
import { openGraphFor, TWITTER_DEFAULTS } from "./openGraph";

/**
 * 1ページぶんのメタデータ（U16・Issue #135）。
 *
 * **サーバーとクライアントの両方がこの形を作る。** サイトの操作はすべて
 * `history.pushState` でURLを書き換えるので（AC-7）、Next.js のメタデータが出るのは
 * 初回描画の1回きりになる。年齢そろえに切り替えても `<title>` は実測値のまま残り、
 * 企業詳細では**タイトルの金額と画面の金額が食い違う**（親 Issue #130）。
 *
 * 直し方は「クライアントでも同じ文言を組み立て直す」ではなく、**文言の出どころを
 * 純粋関数1つにして、サーバーは `Metadata` に包み、クライアントは DOM に書く**。
 * 書き写して2つ目を作ると、片方だけ直した状態に必ずなる。
 *
 * `canonical` はサイト内の相対パス（`/` 始まり）で持つ。絶対URLへの変換は
 * サーバーでは Next.js の `metadataBase` が、クライアントでは `absoluteUrl()` が
 * やる——オリジンの定義は `lib/seo/site.ts` の1か所だけ（ADR-0006）。
 */
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

/**
 * `generateMetadata` が返す形に包む。**ここ以外で `alternates` と `openGraph` を
 * 組み立てない。**
 *
 * `og:` を同じ関数から出すのは、**`og:title`・`og:description`・`og:url` が
 * `<title>`・`description`・canonical と同じ文字列でなければならない**ため
 * （S2・AC-11・AC-12）。別々の場所で組み立てると、片方だけを直した状態に必ずなる。
 */
export function toMetadata(meta: PageMeta): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
    openGraph: openGraphFor(meta),
    twitter: TWITTER_DEFAULTS,
  };
}
