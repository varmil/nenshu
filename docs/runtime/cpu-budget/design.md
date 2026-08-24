# design.md — R1 企業詳細ページを事前生成する

Issue: [#180](https://github.com/varmil/nenshu/issues/180)（親: [#118](https://github.com/varmil/nenshu/issues/118)）
仕様: `docs/runtime/spec.md` 1.・2.（AC-1〜AC-12）
参照: `docs/adr/0012-prerender-company-pages.md`

出来上がりの内部構造。

## 何がリクエスト時に走らなくなったか

`/company/[id]` の1リクエストは、前はこうだった。

```
リクエスト → Next.js のルーティング → route モジュールを評価（companies/curves/stats/history/logos を JSON.parse）
           → generateMetadata（buildCompanyView）
           → 描画（buildCompanyView・findNeighbors ×9・React の SSR・RSC の直列化）
           → HTML
```

いまはこうなる。

```
リクエスト → Worker がキャッシュを引く（ASSETS.fetch）→ HTML
```

上の枝は**全部ビルド時に移った**。1,874ページの生成に 19.9秒（`next build` 全体で1分5秒）。

## 3つの部品

### 1. `open-next.config.ts` — キャッシュを挿す

**`incrementalCache` を明示しないと既定は `"dummy"` で、事前生成した結果が1枚も使われない。** `next build` が `○ (Static)` と出しても Worker はリクエストのたびに描画し直す。**`/about` が企業詳細より重かった（47.7〜59.6ms / 25.5〜28.7ms）のはこれが理由**で、事前生成の前にまずここを直す必要があった。

選んだのは `staticAssetsIncrementalCache`（読み取り専用）。結果は Workers の静的アセット（`cdn-cgi/_next_cache/<buildId>/`）に置かれ、Worker は `ASSETS.fetch` で引く。**KV・R2・D1 のバインディングを増やさずに済む。**

`enableCacheInterception: true` は Next.js のルーティングに入る前にキャッシュを返す。実測で `/company/8282` が 19.7ms → 15.6ms。**PPR を使い始めたら外すこと**（併用できない）。

**アセットへの配置は `wrangler.jsonc` の `build.command` でやる。**

写すのは `populateStaticAssetsIncrementalCache`（`.open-next/cache` を `.open-next/assets/cdn-cgi/_next_cache/` へ `cpSync` するだけ）で、これを呼ぶのは `opennextjs-cloudflare deploy` である。**ところがこのプロジェクトのデプロイコマンドは `npx wrangler deploy`**（Cloudflare ダッシュボード。`docs/ranking/project-foundation/design.md`）なので、その工程が1つも走らない。

**写さないままでもビルドは通り、デプロイは "successful" と表示され、全1,867ページが 404 を返す。** プレビューで実際にそうなった（#181）。`x-nextjs-prerender: 1` と `x-nextjs-cache: MISS` が同時に出ていたのが手がかりで、「事前生成したページとしてルーティングされているが、キャッシュから引けていない」ことを意味する。

`build.command` は `wrangler deploy` でも `wrangler dev` でも走るので、ダッシュボードを触らずに両方を直せる。**静かに壊れる経路なので、写した結果を数える検証まで含めてビルドを落とす形にしてある**（`scripts/assert-prerendered-assets.mjs`。企業詳細の枚数が `companies.json` の行数と一致すること、`about`・`sitemap.xml`・`robots.txt` があること）。

### 2. `app/company/[id]/page.tsx` — 全件を事前生成する

`generateStaticParams` が `companies.rows` の1,867社を返す。`dynamic = "force-static"`・`dynamicParams = false`。

**`dynamicParams = false` にしたので、一覧に無いIDは 404 になる。** 前は `notFound()` が返していたのと同じ結果だが、**描かずに返る**。旧形式の書類ID（`s100yfah`）も存在しないIDも 404 のまま（`e2e/company-page.spec.ts` AC-7）。

**`searchParams` は Props から落とした。** `force-static` のページでは常に空になるので、受け取っても意味が無い。

### 3. 表示基準は状態としてだけ持つ

`CompanyDetail` の `useTargetAge` は素の `useState<TargetAge | null>(null)` になった。`useLocationSyncedState` は通さない。

**配ってしまった `?age=N` は読まずに掃除する。** マウント時に1度だけ `replaceState` で `age` を落とす。読まないのは「URL が正」に半分戻ることになるため、落とすのは**落とさないと「URLは30歳・画面は実測値」がそのまま残る**ため（親 Issue #130 が報告したのはこの形の DOM だった）。`replaceState` なので履歴は増えない。

**メタデータは1組に固定された。** `companyPageMeta(view, fiscalPeriod)` から表示基準の引数が消え、年齢そろえぶんの title・description は要らなくなった（`lib/seo/company.ts` が30行短くなった）。

**それでも `usePageMeta` は呼び続ける。** ランキングから企業詳細へクライアント遷移すると、**ランキングが書いた canonical と description が `<head>` に残る**——`usePageMeta` は DOM を直接書き換えるので React の管理外にあり、遷移では元に戻らない（`<title>` だけは React が書き戻すので、書かないと「タイトルは会社・canonical は `/?age=40`」になる）。**`e2e/metadata.spec.ts` の進む/戻るのテストが実際にこれを捕まえた。**

## 実測

`wrangler dev --local` に対して40リクエストを投げ、`/proc/<workerd>/schedstat` の第1フィールド（ns）の差分を40で割った値。**同一セッションで前後を測っている。**

| | 前 | 後 | 床を引いた「アプリぶん」 |
| --- | ---: | ---: | --- |
| `/company/8282` | 25.5〜28.7ms | **13.3〜16.0ms** | 20〜23ms → 8〜11ms |
| `/company/6861` | — | 13.0〜18.1ms | |
| `/about` | 47.7〜59.6ms | **12.5〜13.8ms** | 42〜54ms → 7〜9ms |
| `/`（動的のまま） | 41.7〜46.5ms | 43.4〜45.1ms | 変わらない |
| `/favicon.ico`（床） | 5.0〜6.0ms | 4.9〜5.9ms | |

**この環境は本番より数倍遅いので絶対値は使えない。** 見るのは同じ手法で並べた前後の比だけ。

**cold は測れない。** `wrangler dev` の起動直後の1本目は 508〜1,776ms で揺れが 1,000ms を超える——毎回 4.7MB の `handler.mjs` を一から評価するためで、**本番の Cloudflare はコンパイル済みのスクリプトを持っている**からこの費用は乗らない。

## 大きさ

| | 前 | 後 |
| --- | ---: | ---: |
| `.open-next/assets` のファイル数 | 1,655 | **3,526** |
| 同 容量 | 15MB | **307MB**（うち `cdn-cgi/_next_cache` が 293MB） |
| `handler.mjs` | 4.7MB | 6.3MB |
| `/` のHTML（raw） | 373,821 B | 373,821 B（変わらない） |
| `/company/8282` のHTML（raw） | 97,751 B | 97,730 B |

**無料枠の上限はファイル数 20,000・1ファイル 25MiB**（Workers Free）。1ページぶんの `.cache` は約160KB（html と rsc を1ファイルに束ねたもの）。

## 測り方（次に測る人へ）

**`wrangler dev` の CPU は `/proc/<workerd>/schedstat` の第1フィールド（ナノ秒）で測る。** `/proc/<pid>/stat` の `utime` はクロックティック（10ms）刻みで、この用途には粗すぎる。N リクエストの差分を N で割る。

**静的アセット（`/favicon.ico`）も一緒に測って床にする。** workerd 自身とアセット配信のぶんが乗るので、床を引かないとアプリの取り分が見えない。

**cold は測ろうとしないこと**（上のとおり）。

## E2E の書き換え

`?age=N` を直接開いていたテストは、**年齢そろえに切り替えてから年齢を選ぶ**形に置き換えた（`alignToAge` ヘルパー）。「URLに age が出る」を確かめていたテストは「URLが変わらない」に反転させ、古い `?age=N` が掃除されることのテストを足した。

**Worker に向けて回すのは ヘッダ・SEO・404 だけ。** 「操作でネットワークが発生しない」系のテストは**本番ビルドのプリフェッチ（`/about?_rsc=…`）を拾うので Worker 相手には通らない**——これは R1 の前からそうで、`npm run measure:prefetch` が別に見ている領域（CLAUDE.md）。dev サーバーに対しては全件通る。

**ヘッダはキャッシュ経由に変わったので必ず Worker で確かめる。** `enableCacheInterception` は Next.js のルーティングに入る前に返すため、`next.config.ts` の `headers()` が効かなくなる可能性があった。実測では効いていた（`Cache-Control: public, max-age=3600` / `Cloudflare-CDN-Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`）。

## この先

**`/` は動的なまま。** `searchParams` を読むので事前生成できない。ここが予算に触るようなら、次は #165 で戻したデータ分割か、ファセットの持ち方そのものを見直すことになる。

**新しい項目を足す Unit は `searchParams` を読めない**（C5〜C7・#159〜#161）。読みたくなったらそれは「このページを動的に戻す」という決定なので ADR-0012 を改訂すること。

**年齢そろえの UI は、いずれ推定年収の要素に付いたスイッチへ寄せる**（運営者の方針）。R1 は URL から外すところまでで、画面の作り直しは別 Unit。
