import { absoluteUrl, SITE_NAME, SITE_ORIGIN } from "./site";

/**
 * 構造化データ（S2・Issue #116・`docs/site-chrome/spec.md` 4.4）。
 *
 * **出すのは、画面に既にある情報を機械可読にしたものだけ**（AC-15）。画面に無い
 * 主張を構造化データにするのは Google の方針に反するうえ、「根拠を隠した推定値を
 * 表示しない」という開発上の約束とも合わない——**読者に見せない数字を検索エンジンに
 * だけ渡すことになる。**
 *
 * **`Organization` は出さない。** 企業ページが表すのは当該企業だが、その主体を
 * 名乗るのは我々ではない。
 *
 * **`WebSite` に `potentialAction`（サイトリンク検索ボックス）を足さない。**
 * ヘッダに検索欄はあるが、Google は 2023年にこの機能を終了しており、いま出しても
 * 何も起きない——読み手が「なぜあるのか」を辿れないマークアップだけが残る。
 */

/** JSON-LD の1件。`@context` と `@type` を必ず持つ。 */
export type JsonLd = Record<string, unknown> & { "@context": string; "@type": string };

/** `/`・`/about`。**サイト名と `/` のURLだけ**（spec 4.4 の表）。 */
export function webSiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_ORIGIN,
  };
}

/** パンくずの1段。`path` はサイト内の相対パス（`/` 始まり）。 */
export type BreadcrumbItem = { name: string; path: string };

/**
 * `/company/[id]`。**画面のパンくずと同じ階層・同じURL**（AC-14）。
 *
 * 段の並びは `features/company/lib/breadcrumb.ts` が持っていて、画面もここも
 * そこから受け取る——**書き写すと、業種チップのリンク先を直したときに構造化
 * データだけが古い階層を指す。**
 *
 * **末尾（現在地）にも `item` を出す。** 画面ではリンクにしていないが、
 * schema.org の `ListItem` が指すのは「その段が表すページ」であって、そこに
 * リンクが張ってあるかどうかではない。
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * `<script type="application/ld+json">` の中身にする。
 *
 * **`<` を `<` に逃がす。** 会社名に `</script>` が入ることは無いが、
 * 「入らないはず」で書いた文字列がそのままHTMLに落ちる形は残さない。
 */
export function jsonLdText(data: JsonLd): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
