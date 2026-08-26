
/**
 * 1ページぶんのメタデータ（U16・Issue #135）。
 *
 * **サーバーとクライアントの両方がこの形を作る。** サイトの操作はすべて
 * `history.pushState` でURLを書き換えるので（AC-7）、Next.js のメタデータが出るのは
 * 初回描画の1回きりになる。年齢そろえに切り替えても `<title>` は実測値のまま残り、
 * 企業詳細では**タイトルの金額と画面の金額が食い違う**（親 Issue #130）。
 *
 * 直し方は「クライアントでも同じ文言を組み立て直す」ではなく、**文言の出どころを
 * 純粋関数1つにして、サーバーは head に描き、クライアントは DOM に書く**。
 * 書き写して2つ目を作ると、片方だけ直した状態に必ずなる。
 *
 * `canonical` はサイト内の相対パス（`/` 始まり）で持つ。絶対URLへの変換は
 * **サーバーもクライアントも `absoluteUrl()`**（F1 で揃った。Next.js の
 * `metadataBase` がやっていたことを `src/components/PageHead.astro` が引き取った）
 * ——オリジンの定義は `lib/seo/site.ts` の1か所だけ（ADR-0006）。
 */
export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

