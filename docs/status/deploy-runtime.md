# 現在地: デプロイ・キャッシュ・Workers の CPU・アクセス解析

> CLAUDE.md の「現在地」節から移した（2026-10-07・トークン消費の削減。移しただけで、本文は1字も書き換えていない）。
> 文中の「上の」「下の」は、CLAUDE.md の「現在地」に並んでいた当時の位置を指す。対応する項は `docs/status/` のどれかにある（索引は CLAUDE.md）。
> **新しく分かったことはここに書く。CLAUDE.md には書かない**（CLAUDE.md は全セッション・全サブエージェントが毎回読むので、伸ばすとそのまま消費量になる）。

**Cloudflare Workers への自動デプロイは接続済み・稼働中**（https://nenshu.fkmks-247.workers.dev/ ）。**ビルドコマンドは `npm run build`（＝`astro build`）**（2026-08-26・F1 で `npx opennextjs-cloudflare build` から変えた）。**変更がブランチのビルドに反映されるまで4回失敗した**——効いたのは main にマージした後（下の「ダッシュボードのビルド構成も main に入るまで効かない」）。**Astro で `/` 以外はビルド時に生成し、静的アセットとして返す**（ADR-0014・F1）。`/` だけが `export const prerender = false` で、`/about`・`/company/[id]`（全2,961社）・`/sitemap.xml`・`/robots.txt`・`/404.html` はビルド成果物がそのまま並ぶ。デプロイ設定は `docs/ranking/project-foundation/design.md`、移行の構造は `docs/framework/astro-cutover/design.md` 参照。

**キャッシュの規則は `web/lib/cache/headers.ts` の1か所**（ADR-0004「キャッシュの設計」）。**F1 で適用する主体が2つに割れた**——`/` は `src/pages/index.astro` が `Astro.response.headers` に付け、**それ以外は静的アセットなので `public/_headers` が付ける**。`lib/cache/headers.test.ts` が両者を突き合わせているので、片方だけ動かすと落ちる。

- **`/_astro/*`（指紋つき）は `@astrojs/cloudflare` が `_headers` に自分で足す。二重に書かない**
- **ブラウザ向けの `max-age` は3600のまま据え置いた。** デプロイ直後の全画面エラー（"This page couldn't load"）の対処として0にすることを検討したが、対処にならないため。**代償として再訪した読者は最大1時間ぶん古い数字を見る**（推定式を変えた直後は `/about` の説明と食い違いうる）。実害が出たら下げる
  - **その全画面エラーは Next.js の `ChunkLoadError` の話で、いまは経路ごと無い。** クライアント遷移が無くなったので、届いた HTML とそれが指すチャンクは常に同じビルドのものになる。ADR-0004 に当時の確認手順が残っている
- **`RSC` まわりの規則も消えた**（`RSC_BYPASS_RULE`・`headers()` の `has`/`missing`）。守っていた事故——`RSC: 1` 付きで `_rsc` の無いリクエストに Next.js が返す `307 → /?_rsc` が素の `/` のキャッシュを上書きし、ふつうの読者が `/?_rsc` へ飛ばされる（2026-08-21 に本番で再現）——が RSC ごと無くなったため
- **キャッシュを触ったら E2E を Worker に向けて回す。** `playwright.config.ts` が `E2E_BASE_URL` を見る（渡すと dev サーバーを起動しない）。`npx astro build` → `npx wrangler dev --port 3801 --local` → `E2E_BASE_URL=http://localhost:3801 npx playwright test e2e/cache-headers.spec.ts e2e/asset-routing.spec.ts`。**宛先はローカルの `wrangler dev` にすること——デプロイ済みのプレビューURLに向けると必ず落ちる**（`Cloudflare-CDN-Cache-Control` はエッジで消費されて外からは見えない）
- **`Cache-Control` は dev 相手の E2E では検証できない**——dev サーバーが `no-cache, must-revalidate` で上書きするため。E2E は `Cloudflare-CDN-Cache-Control` を見る（`e2e/cache-headers.spec.ts`）。**`public/_headers` は Cloudflare の静的アセットの仕組みなので dev サーバーは読まない**——事前生成したページのぶんは Worker に向けたときだけ走る（dev では skip する）。ブラウザ向けの値は `lib/cache/headers.test.ts` で担保する

**アクセス解析は Microsoft Clarity**（Issue #44）。`web/lib/analytics/clarity.ts` にタグを置き、`src/layouts/Base.astro` の body 末尾から素のインライン `<script>`（`is:inline`）で読む。npmパッケージは使わない（同じタグを注入するだけでJSバンドルが増えるため）。**本番ビルドでのみ有効**（`isClarityEnabled`）——開発サーバーとE2Eの実行ぶんが実セッションとして計測に混ざるのを防ぐため、またE2Eの「操作中にネットワークリクエストが発生しない」テスト（リクエスト数を0で固定）を壊さないため。

**Workers 無料枠の CPU は 10ms/リクエストで、実際に超えていた**（`runtime` 施策・`docs/runtime/`・親 Issue #118・R1 は Issue #180 で実装済み・ADR-0012。**F1・#209 で Worker 経由をやめて決着した**——ADR-0014・`docs/framework/`）。踏んでいたのはクローラで、社数ぶんの異なるURLを世界中のコロから叩くのでエッジキャッシュは全部ミスし、isolate は毎回冷えている。

- **`/company/[id]` は全2,961社をビルド時に生成し、静的アセットとして返す**（Astro の `getStaticPaths`。R1 の頃は `generateStaticParams` ＋ `force-static` で、**事前生成までは同じだが Worker が読んで返していた**）。**この画面に項目を足す Unit はクエリを読めない**（C5〜C7・#159〜#161）
- **企業詳細ページの表示基準は URL に出さない。`?age=` は無い**（ADR-0012）。**ランキング（`/`）の `?age=N` は変えていない**——あちらは2,961行の並び順そのものを変える（検索エンジンへの申告は 2026-10-03 から `/` へ寄せている）。配ってしまった `/company/[id]?age=N` は**読まずに `replaceState` で落とす**（落とさないと「URLは30歳・画面は実測値」が残る）
- **企業詳細のメタデータは1組に固定された。** それでも `usePageMeta` は呼び続ける——**ランキングから遷移すると前のページの canonical と description が `<head>` に残る**（`usePageMeta` は DOM を直接書き換える）。`e2e/metadata.spec.ts` の進む/戻るが実際に捕まえた
- **戻る/進むで企業詳細の表示基準は復元されない。** URL に無いものは復元できない。ランキング側の絞り込み・ページ番号は URL が正のまま（U14・#108）
- **効果は `wrangler dev --local` の CPU で前後を並べて見る。** `/proc/<workerd>/schedstat` の第1フィールド（ns）を N リクエストで割り、**静的アセット（`/favicon.ico`）を床として一緒に測る**。**workerd は2プロセス起きるので合計する。** F1 の実測（床 3.6〜3.9ms）: `/about` 14.3ms → **3.9〜4.2ms（床）**、`/company/6861` 20.6ms → **4.0〜4.5ms（床）**、`/` 39.5〜44.6ms → **21.1〜22.4ms**。**床と区別が付かない＝ Worker が起きていない**
- **`/` が半分になったのは事前生成とは無関係**で、Worker のバンドルが小さくなったぶん（評価するコードが減った）。**残る 21ms の大半は全社ぶんの props 直列化**で、これは ADR-0013（E0）の領分
- **どのURLが Worker を起こすかは応答から確かめられる。** `/` にだけ `x-openreport-rendered: worker` が付く（`lib/runtime/renderedBy.ts`）。**OpenNext の頃は `x-nextjs-*` が偶然その役をしていた**——フレームワークの副産物に頼るのをやめ、自分で1つ置いた。`e2e/asset-routing.spec.ts` がこれで固定している
- **デプロイのアセットは 419MB・5,506ファイル**（`/company/[id]` が1枚平均214KB）。無料枠の上限は**ファイル数 20,000・1ファイル 25MiB**で、どちらも余裕がある。**Worker バンドルは gzip 627.9 KiB**（上限3MiB の20.4%。OpenNext の頃は 2,089 KiB ＝66.4%）
- **存在しないパスでは Worker を起動しない**（`wrangler.jsonc` の `not_found_handling: "404-page"`）。ボットのスキャン（`/wp-admin/install.php` 等）が Worker を起こして 122ms 使っていた。**`not_found_handling` だけを書くとサイトが全部404になる**——既定で有効な `assets_navigation_prefers_asset_serving` により、ナビゲーションリクエストはアセットに一致しなくても Worker より先に `404.html` が返るため（ローカルで全滅を確認）。**だから `run_worker_first` で Worker が処理するパスを明示してある。いまは `/` の1件だけ**——ページを足すときに載せるかどうかは「サーバーで描く必要があるか」で決める（載せると Worker が起きる）
- **404 の中身は `src/pages/404.astro`。** 置かないと Astro の既定（`lang="en"` の `404: Not Found`、共通ヘッダ無し）が出る。**ステータスは同じ 404 なので、それだけ見ていると気づけない**（`e2e/asset-routing.spec.ts` が日本語・共通ヘッダ・1種類しかないことを固定している）
- **`astro.config.mjs`・`wrangler.jsonc` を触ったら `e2e/asset-routing.spec.ts` と `e2e/cache-headers.spec.ts` を Worker に向けて回す。** **dev サーバーには `run_worker_first` も `_headers` も効かない**ので、`E2E_BASE_URL` が無いと skip する——dev で走らせると自明に通り、守っているつもりで守っていない状態になる（Issue 183 で起きたのがそれで、そのとき E2E は311件すべて通っていた）
- **Worker 相手の E2E で通るのは ヘッダ・SEO・404・アセットのルーティングだけ**。画面を操作する系は dev サーバーに向けて回す
- **`enableCacheInterception`・`prefetch-loop`・Turbopack の永続キャッシュ・`measure:prefetch` は、相手ごと無くなった**（どれも Next.js/OpenNext の設定と RSC のプリフェッチにまつわるもの。#183 の暴走は本番で `/about?_rsc=…` が毎秒128回飛んだ事故だった）
- **一度は「ページが読むデータを減らす」方向で当てて、戻した**（#165 → #179）。cold で 1.7〜2.0ms しか稼げず、生成物と lint の規則が増えた。**残るのは `/` だけ**で、必要になったら測り直してから入れる
- **SvelteKit も測った**（バンドルは gzip 259KiB で最小）が、**React が動かないのでコンポーネント 4,778 行が書き直しになる**——買えるものは Astro と同じ「Worker を起こす URL を 3,004 → 42 件にする」ことなので割に合わず、却下した（ADR-0014 の却下案 E）。**`@sveltejs/adapter-cloudflare` は `wrangler.jsonc` が無いと Pages モードで `_routes.json` を吐き、上限を超えた exclude を黙って捨てて全ページで Worker を起こす**（ビルドは成功する）
- **「cold の 100〜600ms が 10ms 枠を超えている」は成り立たない**——起動時間は1秒の別枠で per-request CPU に算入されない（Issue #200 の前提を調査で正した）。直したのは**事前生成済みのページを返すだけで warm 20〜24ms 使っていたこと**のほう
