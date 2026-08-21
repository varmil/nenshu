import type { NextConfig } from "next";

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number];

/**
 * ページ応答のキャッシュ規則（ADR-0004「キャッシュの3層」）。
 *
 * **`next.config.ts` から使う唯一の定義。** 規則を直接あちらに書かない——
 * 順序に意味がある（下の `RSC_BYPASS_RULE` 参照）ことがコードから読めず、
 * 静かに壊れるため。`headers.test.ts` が順序と条件を固定している。
 */

/** データはビルド時に確定し、実行中は変わらない（更新は年1回・ADR-0001）。 */
const CACHEABLE_PATHS = [
  "/",
  "/about",
  "/company/:id",
  // sitemap・robots も中身がビルド時に確定する（U8）。クローラが取りに来る
  // たびにWorkerを起こす理由がないので、同じキャッシュに乗せる。
  "/sitemap.xml",
  "/robots.txt",
] as const;

/**
 * **ブラウザにHTMLを持たせない。エッジには持たせる。**（ADR-0004）
 *
 * 以前は `max-age=3600` だった。**これはデプロイ直後の全画面エラーの対処では
 * ない**——旧ビルドを表示中のブラウザに対して実際にサーバーを差し替えて試した
 * ところ、再訪・戻る/進む・F5・タブを開いたままの操作と遷移は**どれも壊れな
 * かった**。`_next/static/*` が `immutable` なので、古いHTMLを持つブラウザは
 * 古いチャンクも持っていて辻褄が合うため。
 *
 * 変える理由は別で、**再訪した読者が最大1時間ぶん古い数字を見る**こと。推定式を
 * 変えたデプロイの直後に、ランキングの金額と `/about` の説明が食い違って見えうる。
 *
 * `max-age=0` にすると毎回問い合わせが出るが、応答するのはエッジであって
 * Workerではない（`Cloudflare-CDN-Cache-Control` は据え置き）。
 */
export const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** エッジ（Cloudflare）向け。TTLを短くしない判断は ADR-0004 に理由がある。 */
export const EDGE_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";

const CACHE_HEADERS = [
  { key: "Cache-Control", value: BROWSER_CACHE_CONTROL },
  { key: "Cloudflare-CDN-Cache-Control", value: EDGE_CACHE_CONTROL },
];

/**
 * **RSC扱いの応答を素のページURLのキャッシュに入れさせない。**
 *
 * Cloudflare のキャッシュは `Vary` を見ない（既定。公式が明記している）。
 * `RSC: 1` ヘッダ付きで `_rsc` の無いURLを叩くと Next.js は
 * `307 → /?_rsc` を返すので、そこにキャッシュ可能なヘッダが付いていると
 * **素の `/` のキャッシュキーがその307で上書きされ、以後ふつうの読者が
 * `/?_rsc` へ飛ばされる**。本番で実際に再現した（2026-08-21）。
 *
 * 正規のルーターは必ず `_rsc` を付けるので、この条件に当てはまるのは
 * 手動リクエストとスキャナだけ。**キャッシュヒット率もWorker起動数も動かない。**
 *
 * **この規則は必ず配列の末尾に置く。** `headers()` は後勝ちで、先頭に置くと
 * 後続の `{ source: "/" }` に `Cache-Control` を上書きされる（実測）。
 *
 * **`missing` の `_rsc` には `value: ".+"` を必ず付ける。** OpenNext のマッチャ
 * （`@opennextjs/aws/dist/core/routing/matcher.js` の `routeHasMatcher`）は
 * `type: "query"` のときだけキーの存在を確かめず、`value` 未指定だと
 * `new RegExp("").test("")` すなわち常に `true` を返す。`missing` は反転なので
 * **規則が永久に不成立になる**。`header` の分岐には存在チェックがあるので、
 * この崩れ方は query 限定である。
 *
 * **`next start` では正しく動くので、この不具合はローカルでは見えない。**
 * Next.js 本体のマッチャにはこの穴が無く、Worker 上でだけ落ちる。実際に
 * プレビューへデプロイして初めて発覚した（2026-08-21）。
 */
const RSC_BYPASS_RULE: HeaderRule = {
  source: "/:path*",
  has: [{ type: "header", key: "RSC" }],
  missing: [{ type: "query", key: "_rsc", value: ".+" }],
  headers: [
    { key: "Cache-Control", value: "private, no-store" },
    { key: "Cloudflare-CDN-Cache-Control", value: "private, no-store" },
  ],
};

/** `next.config.ts` の `headers()` がそのまま返す配列。 */
export function cacheHeaderRules(): HeaderRule[] {
  return [
    ...CACHEABLE_PATHS.map((source) => ({ source, headers: CACHE_HEADERS })),
    RSC_BYPASS_RULE,
  ];
}
