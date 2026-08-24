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
 * **アセットへの配置は `wrangler.jsonc` の `build.command` でやる**——写すのは本来
 * `opennextjs-cloudflare deploy` の仕事だが、このプロジェクトのデプロイコマンドは
 * `npx wrangler deploy` なのでその工程が走らない（あちらのコメント参照）。
 *
 * **`enableCacheInterception` は使わない。** Next.js のルーティングに入る前に
 * キャッシュを返すので CPU は少し減る（実測 19.7ms → 15.6ms）が、**プリフェッチの
 * リクエスト（`Next-Router-Prefetch: 1`）にもフルの RSC ペイロードを返してしまい、
 * クライアントのルーターが取り直しを繰り返す。** 本番で `/about?_rsc=…` が
 * 毎秒約128回、15秒で1,918回飛んだ（#183）。読者のブラウザと Worker の呼び出し数の
 * 両方を焼く壊れ方なので、数msと引き換えにしない。
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
