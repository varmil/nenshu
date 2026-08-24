import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * OpenNext（Cloudflare アダプタ）の設定。
 *
 * **`incrementalCache` を明示しないと既定は `"dummy"` で、事前生成したページが
 * 1枚も使われない。** `next build` が `○ (Static)` と出しても、Worker はリクエスト
 * のたびに描画し直す——`/about` が企業詳細より重かったのはこれが理由だった
 * （実測 47.7〜59.6ms / 25.5〜28.7ms。R1・`docs/runtime/cpu-budget/design.md`）。
 *
 * **読み取り専用の `staticAssetsIncrementalCache` を選ぶ。** 事前生成した結果は
 * Workers の静的アセット（`cdn-cgi/_next_cache/`）に置かれ、Worker は
 * `ASSETS.fetch` で引くだけになる。KV・R2・D1 のバインディングを増やさずに済む
 * （`docs/product/product.md` の「ランニングコストをゼロに保つ」）。**再検証は
 * できないが、要らない**——このサイトのデータは年1回のビルドでしか変わらない。
 *
 * **アセットへの配置は `opennextjs-cloudflare deploy` が自動でやる**
 * （`populateStaticAssetsIncrementalCache` が `.open-next/cache` を丸ごと写す）。
 * 手で置く工程は無い。
 *
 * `enableCacheInterception` は、Next.js のルーティングに入る前にキャッシュを引いて
 * 返す。実測で `/company/8282` が 19.7ms → 15.6ms（`wrangler dev --local`・40
 * リクエストの平均）。**PPR を使い始めたら外すこと**（併用できない）。
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
