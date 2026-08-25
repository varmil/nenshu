# ADR-0014: Next.js + OpenNext をやめ、Astro へ移す

- 状態: 採用
- 日付: 2026-08-25
- 関連: [ADR-0002](0002-stack-nextjs-static-export.md)（採用スタック。フレームワークの選定を supersede）, [ADR-0004](0004-ssr-opennext-cloudflare.md)（OpenNext でフルSSR。配信方式を supersede。**キャッシュの設計は残す**）, [ADR-0012](0012-prerender-company-pages.md)（企業詳細の事前生成。**決定は残し、実現手段だけ差し替える**）, [ADR-0006](0006-public-url-strategy.md)（公開URL。**据え置き**）, [ADR-0013](0013-initial-payload-separate-asset.md)（初回ペイロード。**独立**）, Issue [#118](https://github.com/varmil/nenshu/issues/118)（親・CPU超過）, [#200](https://github.com/varmil/nenshu/issues/200)（親・この調査）

## 背景

**R1（ADR-0012）で「ページを描く CPU」は消えたが、「Worker が起きる CPU」は残った。**

本番の Observability（2026-08-25・12時間）で、事前生成済みのページを返すだけの `/company/6501` が warm 24ms、`/about` が warm 22ms。**無料枠の 10ms を2倍以上超えている。** 落ちていないのは Cloudflare 側の「たまに超えるぶんの許容」に乗っているためで、アクセスが増えれば #118 が戻る。

**調査（`docs/framework/intent.md`）で前提が1つ崩れた。** Issue #200 は cold の 100〜600ms を問題にしていたが、**起動時間は per-request CPU とは別枠（1秒）で、10ms には算入されない**（[Limits](https://developers.cloudflare.com/workers/platform/limits/)）。いま起動枠は21%しか使っていない。**直すべきは warm のほうである。**

**そして warm の 20〜24ms は、事前生成した HTML を静的アセットで返せば丸ごと消える。** Cloudflare は「Worker を呼ばない静的アセットへのリクエストは無料・無制限」と明記している（[Pricing](https://developers.cloudflare.com/workers/platform/pricing/)）。Issue #200 はこれを検討して**「クライアント遷移（RSC）と両立しない」**という理由で見送っていた——アセットは `RSC: 1` 付きのリクエストにも `text/html` を返すため、Next.js のルーターが壊れる。

**その行き止まりは、Next.js に固有のものだった。**

## 決定

**Next.js（`@opennextjs/cloudflare`）をやめ、Astro + `@astrojs/cloudflare` へ移す。**

**1. `/` 以外はすべてビルド時に生成し、静的アセットとして返す。** `/about`・`/company/[id]` 2,961社・`/sitemap.xml`・`/robots.txt`。**これらは Worker を起動しない。**

**2. `/` だけを Astro の SSR ルートにする**（`export const prerender = false`）。`?age=N` 8件・`?ind=X` 33件のファセットは `/` と同じルートなので、**Worker を起こす URL は 42 件になる**（いまは 3,004 件すべて）。

**3. 画面は React のまま持ち越す。** `features/`・`design-system/`・`lib/` の 8,910 行は書き直さない。`RankingApp`・`CompanyDetail` を `client:load` の島として置く。

**4. クライアント遷移は Astro のもの（素の HTML 取得）にする。** Next.js の RSC 遷移をやめる。**これが決定2〜3を成り立たせている**——アセットが返す `text/html` は、Astro の遷移が期待するものそのものになる。

**5. ADR-0006（公開URL）は据え置く。** canonical・sitemap・robots・ファセットの扱いを変えない。URL の形も変わらない（`trailingSlash: "never"` ＋ `build.format: "file"` で `/about`・`/company/6861` が出ることを実測で確認した）。

**6. ADR-0012 の決定1・3・5 は残る。** 企業詳細を全社ビルド時に生成すること、表示基準を URL に出さないこと、`/` が動的に残ることは変わらない。**変わるのは実現手段だけ**で、決定2（`staticAssetsIncrementalCache`）と決定4（`enableCacheInterception` を使わない）は OpenNext 固有なので消える。

**7. ADR-0004 の「キャッシュの規則は1か所」は残す。** `web/lib/cache/headers.ts` に相当するものを Astro 側でも1か所に置く。**エッジキャッシュそのものは `/` にしか要らなくなる**——他はアセットで、`public/_headers` が効く。

## 理由

**このサイトは RSC を使っていない。** ルート直下の `RankingApp`・`CompanyDetail` がどちらも `"use client"` で、ページは「JSONを読んで1つのクライアントコンポーネントに props で渡すだけの殻」になっている。App Router の上に乗っているが、形は古典的な SSR + ハイドレーションのままである。**捨てるものが無い。**

**Next.js への実行時の依存が3モジュール5か所しかない。** `notFound` 1・`usePathname` 2・`Link`＋`useLinkStatus` 1・`Script` 1。残る10件は型だけで実行時のコードは0バイトになる。**実際、スタブ3つで Astro 上に 1,867社ぶんを描き切り、キーエンスのページの「2,178」「35.0」「電気機器」「偏差値」まで現行と一致した。**

**実測（掲載1,867社の時点・`4de887a`。手法は `docs/framework/intent.md`）。**

| | 現行 | Astro |
| --- | ---: | ---: |
| Worker のバンドル（gzip・無料枠 3 MiB） | 1,876 KiB（61%） | **522 KiB（17%）** |
| `/about` の CPU | 14.3 ms（Worker） | **4.0〜4.4 ms**（アセット・床と同じ） |
| `/company/6861` の CPU | 20.6 ms（Worker） | **6.3〜9.4 ms**（アセット） |
| cold（起動直後の1本目） | 358〜1,119 ms | **11.5〜12.0 ms**（アセット） |

**Astro は2026年1月に Cloudflare に入った**（[Astro is joining Cloudflare](https://blog.cloudflare.com/astro-joins-cloudflare/)・2026-01-16）。アダプタは `@cloudflare/vite-plugin` を挟み、事前生成もアダプタ側の prerenderer で走る。**このサイトが乗っている台と、フレームワークの持ち主が同じになる。**

## 却下案

**A. 現状維持。** warm 20〜24ms が 10ms 枠に乗り続ける。**いま落ちていないのは許容の内側にいるからで、アクセスが増えれば #118 が戻る。**

**C. 自前（Vite + 素の Worker）。** バンドルは gzip 295 KiB といちばん小さいが、**そこから先はルーティング・事前生成・メタデータを全部自分で持つ。** Astro との差（522 KiB と 295 KiB）が効くのは `/` の cold 1か所だけで、他はアセットでフレームワークのコードを通らない。**買えるものが小さく、払うものが増え続ける。**

**D. Next.js のまま `<a>` 遷移にし、`/company/[id]` をアセットへ置く。** Issue #200 が「そこまでするなら」と書いた案。**App Router を使いながらクライアント遷移を捨てることになり、7.3MB のサーバーランタイムを `/` のためだけに抱え続ける。** 実測していないが、バンドルが変わらない以上 `/` の cold も変わらない。

**E. SvelteKit。** バンドルは4案で最小（gzip 259 KiB・無料枠の 8%）で、`.ts` の純粋ロジック 4,132 行は1行も変えずに `load()` から呼べることを実測で確かめた。**それでも却下する——買えるものが Astro と同じだから。** 目的は「Worker を起こす URL を 3,004 → 42 にする」ことで、そこは Astro でも SvelteKit でも同じ 42 になる（静的アセットの cold が Astro 11.5〜12.0ms・SvelteKit 11.8〜12.6ms と揃ったのがその現れ）。**対して払うのは 4,778 行のコンポーネント書き直し**で、`design-system/ui/` の10プリミティブも `@base-ui/react` から shadcn-svelte への置き換えになる。**この施策は「画面に出るものを1つも変えない」を前提に置いており、4,778 行を書き直して見た目が1ピクセルも変わらないことを保証する手段は E2E 343件しかない。** 「React をやめたい」がそれ自体として目的になったときは、別の Intent として立て直す。

## 影響

**変わらないもの。** 画面に出る数値・文言・レイアウト。公開URL・canonical・sitemap・robots（ADR-0006）。データパイプライン（`pipeline/`）。Unit テスト39ファイル（コンポーネントを描いているものは0件）。Tailwind と `design-system/tokens/tokens.css`。

**変わるもの。**

- **`app/` が無くなる。** ルーティングは Astro のファイルベースになり、`generateMetadata` は `lib/seo/pageMeta.ts` を Astro のページから呼ぶ形になる
- **`next/*` の5か所を自前に置き換える**（F0 で先に剥がす）
- **ページ間の遷移が素の HTML 取得になる。** `prefetch={false}` の代償で入れた `NavProgressBar`（`useLinkStatus`）は使えなくなる。**要るかどうかを移行後に測ってから決める**（F2）
- **E2E 343件のうち4ファイルが Next.js 固有に触っている**（`cache-headers`・`theme`・`prefetch-loop`・`network`）。`prefetch-loop.spec.ts` は守る対象（RSC のプリフェッチ暴走）ごと消える
- **`wrangler.jsonc` の `run_worker_first` が縮む。** Worker が処理するのは `/` だけになる
- **デプロイのアセットが増える。** 事前生成した HTML がそのまま配られる（OpenNext の `cdn-cgi/_next_cache/` は消える）

**この決定は ADR-0013（E0・初回ペイロードをアセットへ）と独立している。** E0 は `/` の直列化（実測で 40ms のうち 16ms）を消すもので、フレームワークを替えても直らないし、替えなくても直る。**どちらを先にやってもよい**が、後にすると Astro 側で実装することになる。

**`/` は移行後も Worker を起こす。** そこは誰がやっても変わらない（ADR-0006 のファセット41件を別内容でインデックスさせているため）。**この施策の KPI は `/` を速くすることではなく、`/` 以外を Worker の外に出すことである。**
