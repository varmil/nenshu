import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { cacheHeaderRules } from "./lib/cache/headers";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  experimental: {
    /*
     * **`next build` の Turbopack 永続キャッシュを書かない。**
     *
     * Next.js 16.3.0 から既定で有効になり、`.next/cache/turbopack` に
     * 中間結果を貯める。Cloudflare Workers Builds はこのディレクトリを
     * ビルド間で復元するが、**復元が途中で失敗しても書きかけのファイルが残る。**
     * 2026-08-25 の本番ビルドが実際にそれで落ちた——ログは
     * `Failed to restore build output from build cache. Skipping.` と言いながら
     * `.meta` だけが残り、参照先の `.sst` が無い状態で Turbopack が panic した
     * （`Unable to open static sorted file referenced from 00000595.meta`）。
     * **コードは直前に成功したビルドと1バイトも違わなかった。**
     *
     * 再実行しても同じ壊れたキャッシュを復元し直すので、根本から止める。
     * 代償は**ビルド1回あたり約6秒**（実測 22〜24秒 → 29〜30秒）で、
     * 全体10〜20分のうちの1%に満たない。**デプロイが丸ごと止まるリスクと
     * 釣り合わない。** `next dev` 側のキャッシュ（`turbopackFileSystemCacheForDev`）
     * は既定のまま残す——あちらはローカルの作業ディレクトリで、復元を挟まない。
     */
    turbopackFileSystemCacheForBuild: false,
  },
  // 規則の本体と、その理由・順序の制約は `lib/cache/headers.ts` にある。
  // ここに直接書き足さないこと（順序に意味があり、静かに壊れる）。
  // 静的アセット（_next/static/*）はWorkerを経由しないためここでは効かない。
  // そちらは public/_headers で設定している。
  headers: cacheHeaderRules,
};

export default nextConfig;

initOpenNextCloudflareForDev();
