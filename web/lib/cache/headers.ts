/**
 * ページ応答のキャッシュ規則（ADR-0004「キャッシュの3層」）。
 *
 * **規則の置き場所は1か所**（spec AC-15）。**F1（#209・ADR-0014）で受け持ちが
 * 変わった**——`/` 以外はビルド時に生成した HTML が静的アセットとして並ぶので、
 * そちらは `public/_headers` が付ける。ここが残すのは**実行時に返る唯一のページ**
 * である `/` のぶんだけになる。
 *
 * **`RSC_BYPASS_RULE` は消えた。** 守っていた相手——`RSC: 1` ヘッダ付きで `_rsc` の
 * 無いリクエストに Next.js が返す `307 → /?_rsc` が素の `/` のキャッシュを上書きする
 * 事故（2026-08-21 に本番で再現）——が、RSC ごと無くなったため。
 */

/**
 * ブラウザ向け。**1時間持たせる。**（ADR-0004）
 *
 * デプロイ直後の全画面エラーの調査で `max-age=0` にすることを一度検討したが、
 * **やめた。あれの対処にならないため**（旧ビルドを表示中のブラウザに実際に
 * サーバーを差し替えて試したところ、再訪・戻る/進む・F5・タブを開いたままの操作と
 * 遷移はどれも壊れなかった）。
 *
 * **既知の代償**: 再訪した読者が最大1時間ぶん古い数字を見る。推定式を変えた
 * デプロイの直後は、ランキングの金額と `/about` の説明が食い違って見えうる。
 */
export const BROWSER_CACHE_CONTROL = "public, max-age=3600";

/** エッジ（Cloudflare）向け。TTLを短くしない判断は ADR-0004 に理由がある。 */
export const EDGE_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";

/**
 * `/` の応答に付けるヘッダ。**`src/pages/index.astro` からだけ呼ぶ。**
 *
 * 静的アセットになったページ（`/about`・`/company/[id]`・`/sitemap.xml`・
 * `/robots.txt`）は `public/_headers` に同じ2行が書いてある。**値を変えるときは
 * 両方**——`headers.test.ts` が `_headers` の中身と突き合わせて固定している。
 */
export function pageCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": BROWSER_CACHE_CONTROL,
    "Cloudflare-CDN-Cache-Control": EDGE_CACHE_CONTROL,
  };
}
