/**
 * サイトのURLの起点（`docs/ranking/spec.md` 5.・ADR-0006）。
 *
 * **`metadataBase` を組み立てるのはこの1か所だけにする。** canonical・sitemap・
 * robots・将来のOGPが全部この値の上に乗るので、ドメインを取り直したときに
 * 直す場所が散っていると、どれか1つだけ古いオリジンのまま残る。
 *
 * `openreport.net` は 2026-08-21 に取得済み。Cloudflare の Worker Custom Domain を
 * apex に付けてあり、`www` は apex へ 301 する（正規ホストは apex）。
 */
export const SITE_ORIGIN = "https://openreport.net";

export const SITE_NAME = "OpenReport";

/** `app/layout.tsx` の `metadata.metadataBase` に渡す。 */
export const METADATA_BASE = new URL(SITE_ORIGIN);

/**
 * sitemap に載せる絶対URLを作る。`URL` に任せるので、業種名のような
 * 非ASCIIはここでパーセントエンコードされる（sitemap.xml はエスケープ済みの
 * URLを要求する）。
 *
 * **ルートだけ末尾のスラッシュを落とす。** Next.js は `trailingSlash: false`（既定）
 * なので `alternates.canonical: "/"` を `https://openreport.net` と出す。sitemap の
 * `<loc>` をスラッシュ付きだと、同じページを2つのURLとして申告することになる。
 */
export function absoluteUrl(path: string): string {
  const url = new URL(path, SITE_ORIGIN);
  return url.pathname === "/" && url.search === "" ? SITE_ORIGIN : url.toString();
}
