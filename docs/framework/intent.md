# intent.md — 配信フレームワークの見直し

Issue [#200](https://github.com/varmil/nenshu/issues/200)（親 [#118](https://github.com/varmil/nenshu/issues/118)）。

**この文書は判断の材料までを置く。移すとは決めていない。** 決めたら spec.md・overview.md と ADR を書く。

## 狙い

**R1（[#180](https://github.com/varmil/nenshu/issues/180)・ADR-0012）で「ページを描く CPU」は消えたが、「Worker が起きる CPU」は残っている。** Next.js（`@opennextjs/cloudflare`）を前提にしたまま削れるぶんは削り切っており、次に触れるのはフレームワークそのものになる。

**そこに手が届くかを、実測で確かめる。** 確かめたいのは Issue #200 が挙げた4点——バンドルはどこまで小さくなるか、このサイトが本当に要る機能は何か、移行で何を捨てるか、`/` をどう扱うか。

## North Star KPI

**公開している URL のうち、Worker を起こすものの数。**

**いまは全部が Worker を通る**（E2 の後で 3,004 件＝`/`・`/about`・`?age=N` 8件・`?ind=X` 33件・企業詳細 2,961社）。**`/` とそのファセット42件だけにできれば、残り 2,962 件は CPU も課金も 0 になる**——Cloudflare は「Worker を呼ばない静的アセットへのリクエストは無料・無制限」と明記している（[Pricing](https://developers.cloudflare.com/workers/platform/pricing/)）。踏んでいるのがクローラである以上、効くのは1リクエストを速くすることではなく、**リクエストの大半を Worker の外に出すこと**になる。

## 前提の訂正（調査で最初に分かったこと）

**Issue #200 の「100〜600ms は 10ms の予算と桁が2つ違う」は、そのままでは成り立たない。** 起動時間は per-request CPU とは別枠である（[Limits](https://developers.cloudflare.com/workers/platform/limits/)）。

> A Worker must parse and execute its global scope (top-level code outside of handlers) within 1 second.

- **グローバルスコープの評価には1秒の枠がある。** 本番の実測で最も重い `/about` の cold が 208〜213ms なので、**いまは起動枠の 21% しか使っていない**。`10021 Script startup exceeded CPU time limit` に近づいてはいない
- **超えているのは warm のほう。** 同じ Observability で `/company/6501` が 24ms、`/about` が 22ms。**事前生成済みのページを返すだけで、無料枠の 10ms を2倍以上超えている。** 落ちていないのは Cloudflare 側の「たまに超えるぶんの許容」に乗っているためで、そこは Issue #200 の読みどおり

**だから狙いは変わらないが、根拠は入れ替わる。** 直すべきは cold の1秒枠ではなく、**事前生成したページを返すだけで 20ms 使っていること**である。

## 仮説と検証結果

**H1. Next.js への実行時の依存は薄い。**

*検証*: `next/*` の import を全数える。→ **当たり。** 実行時に使っているのは3モジュール5か所だけだった。

| import | 箇所 |
| --- | --- |
| `next/navigation` の `notFound` | `app/company/[id]/page.tsx` |
| `next/navigation` の `usePathname` | `HeaderSearch.tsx`・`BrandLink.tsx` |
| `next/link` の `Link`・`useLinkStatus` | `NavLink.tsx` |
| `next/script` の `Script` | `app/layout.tsx` |

残る10件は `Metadata`・`MetadataRoute`・`Viewport`・`NextConfig` の**型だけ**で、実行時のコードは0バイトになる。

**さらに、RSC を実質使っていない。** ルート直下の `RankingApp`・`CompanyDetail` がどちらも `"use client"` で、**ページは「JSONを読んで1つのクライアントコンポーネントに props で渡すだけの殻」**になっている。App Router の上に乗っているが、形は古典的な SSR + ハイドレーションのままである。

**H2. バンドルが小さくなれば cold が下がる。**

*検証*: Worker を3通り（Astro・SvelteKit・自前）で組み、`wrangler deploy --dry-run` の大きさと起動直後の1本目を並べる。→ **当たり。**

**H3. 事前生成したページは静的アセットにでき、Worker を起こさない。**

*検証*: Astro と SvelteKit でビルドして `wrangler dev --local` に投げ、CPU が床のままか見る。→ **当たり。どちらも起きなかった。** Astro は `/about` 4.0〜4.4ms・`/company/6861` 6.3〜9.4ms、SvelteKit は `/about` 3.3〜3.7ms・`/company/6861` 3.8ms（床は 3.4〜4.4ms）。**残っている差は HTML のバイト数だけで、フレームワークの差ではない。**

**H4. `/` の CPU の主因はフレームワークではなく、全社ぶんの直列化である。**

*検証*: 自前プローブで props の直列化を入れる前後を測る。→ **当たり。** 13〜15ms → 29〜30ms。**これは ADR-0013（E0）の領分で、フレームワークを替えても直らないし、替えなくても直る。**

## 前提の確認（調査済み）

**すべてこのコンテナの `wrangler dev --local` に対する実測。** 手法は `docs/runtime/cpu-budget/design.md` と同じ（`/proc/<workerd>/schedstat` の第1フィールドを40リクエストで割る）。**絶対値は使えない。並べた比だけを見る。**

**測ったのは掲載1,867社の時点**（`4de887a`。**E2（#173）が入る前**）。E2 で母集団が 2,961社になったが、**比は動かない**——増えるのは `/` の直列化で、それは4つの候補すべてに同じだけ乗る。**`/` 以外は事前生成なので、社数はページ数（＝アセットの枚数）にしか効かない。**

比べたのは4つ。

| | 中身 | `web/features/` の実物を描いているか |
| --- | --- | --- |
| **現行** | Next.js 16.3.1 + `@opennextjs/cloudflare` 1.20.2 | ○ |
| **Astro** | Astro 7.2.6 + `@astrojs/cloudflare` 14.2.4 + `@astrojs/react` 6.0.4 | ○（`next/*` のスタブ3つだけ差し替え） |
| **SvelteKit** | SvelteKit 2.70.3 + `@sveltejs/adapter-cloudflare` 7.2.9 + Svelte 5.56.10 | **×（React が動かない。画面は書き直した）** |
| **自前** | esbuild で束ねただけの Worker（`react-dom/server.edge` の `renderToString` を直接呼ぶ） | ○ |

**この「○ / ×」がこの調査でいちばん重い1行になる。** SvelteKit だけは同じ画面を描けないので、**測れたのはバンドルの大きさとルーティングの振る舞いまで**で、`/` の CPU は他の3つと並べられない（下の表に断りを入れてある）。

### Worker のバンドル（`wrangler deploy --dry-run`）

| | raw | gzip | 無料枠 3 MiB に対して |
| --- | ---: | ---: | ---: |
| 現行 | 10,703 KiB | 1,876 KiB | 61% |
| Astro | 2,400 KiB | 522 KiB | **17%** |
| SvelteKit | 1,728 KiB | 259 KiB | **8%** |
| 自前 | 1,204 KiB | 295 KiB | **10%** |

**4つとも同じ4本の JSON（約 518 KiB）を取り込んでいる**ので、差はフレームワークのぶんになる。**SvelteKit が自前の React 版より gzip で小さいのは、Svelte の SSR ランタイムが `react-dom/server`（193,784 B）より軽いため。**

**自前のバンドルは、中身の半分がデータだった。** esbuild の出力 971,809 B を分解すると **`companies.json`・`logos.json`・`stats.json` で 518,323 B（53%）**、残る 453,486 B がコード（うち `react-dom/server` が 193,784 B）。**ADR-0013 でデータをアセットへ出せば、ここも落ちる。**（`Total Upload` はソースマップ等を含むので、この分解とは合わない。）

### cold と warm（起動直後の1本目・wall time・3回）

| | cold | warm |
| --- | ---: | ---: |
| 現行 `/robots.txt` | 990〜1,119 ms | 11〜14 ms |
| 現行 `/company/6861` | 358〜876 ms | 16〜19 ms |
| Astro `/`（SSR） | 113〜141 ms | 36〜44 ms |
| SvelteKit `/`（SSR） | 74.8〜116.6 ms | 25〜32 ms |
| Astro `/company/6861`（静的アセット） | **11.5〜12.0 ms** | 4.3〜4.8 ms |
| SvelteKit `/company/6861`（静的アセット） | **11.8〜12.6 ms** | 4.4〜5.2 ms |
| 自前 `/__floor`（Worker は起きるが何も描かない） | **8.3〜9.1 ms** | 2.7〜3.2 ms |

**静的アセットの cold が Astro と SvelteKit で揃っている**（11.5〜12.6ms）ことに意味がある。**そこはもうフレームワークのコードを通っていない**ので、どちらを選んでも同じ床に着く。

**`docs/runtime/cpu-budget/design.md` は「cold は測れない」と書いたが、それは現行の揺れが 1,000ms を超えるためだった。** 桁が2つ違う相手と並べるぶんには読める。

**V8 のコンパイルだけを切り出しても同じ向きに出る**（Node の `vm.SourceTextModule` で5回・中央値）。`handler.mjs` 7,833,056 B が 93.1ms、自前の 971,809 B が 20.2ms。

### 1リクエストの CPU（40リクエストの平均）

| パス | 現行 | Astro | SvelteKit |
| --- | ---: | ---: | ---: |
| 床（アセット） | 3.5〜3.9 ms | 3.4〜4.4 ms | 3.3〜3.7 ms |
| `/about` | 14.3 ms（Worker） | **4.0〜4.4 ms**（アセット） | **3.7 ms**（アセット） |
| `/company/6861` | 20.6 ms（Worker） | **6.3〜9.4 ms**（アセット） | **3.8 ms**（アセット・※） |
| `/` | 39.5〜44.6 ms | 49.4〜57.4 ms | 27.1 ms（※） |

**※ SvelteKit の2つは他の2列と並べられない。** あちらだけ画面を書き直しているので、出している HTML が違う——`/company/6861` は 17,237 B（Astro 117,671 B・現行 135,790 B）、`/` は 161,437 B（Astro 481,312 B・現行 378,474 B）。**静的アセットの CPU はバイト数でほぼ決まる**ので `/company/6861` の 3.8ms は「Svelte が速い」ではなく「描いた量が少ない」であり、`/` の 27.1ms も同じ理由で軽い。**この2つを根拠に SvelteKit を選ばないこと。**

**並べられるのは現行と Astro の `/` だけで、そこでは Astro のほうが重い。** 出している HTML が 481,312 B と現行の 378,474 B より大きいためで、Astro は島の props を HTML の属性に直列化する。**ADR-0013 で全社ぶんを HTML から出せば、この差は消える見込み**だが、**測っていない。**

### `/` の CPU の内訳（自前プローブで分解）

| | ms |
| --- | ---: |
| 床 | 約 4 |
| React の描画（30行＋業種チップ） | 13〜15 |
| 1,867社ぶんの props 直列化 | +16 |
| 現行に残るぶん（OpenNext のルーティング等） | 6〜11 |

**現行の `/` の HTML 378,474 B のうち 158,110 B（41.8%）が `self.__next_f`＝ RSC ペイロード**で、これは同じ props を markup とは別にもう一度直列化したものである。**ADR-0013 が「予算の9割を1つのデータ形式が占めている」と書いた状態を、バイト単位で裏づけた。**

### 移行で持ち越せるもの

**`features/`・`design-system/`・`lib/` の 8,910 行は、行き先が React かどうかで真っ二つに割れる。**

| | 行数 | Astro / 自前 | SvelteKit |
| --- | ---: | --- | --- |
| コンポーネント（`.tsx`） | 4,778 | **そのまま動く** | **書き直し** |
| うち `design-system/ui/`（shadcn の10プリミティブ） | 952 | そのまま | shadcn-svelte で置き換え |
| うち `features/` の画面 | 3,826 | そのまま | 書き直し |
| 純粋ロジック（`.ts`） | 4,132 | そのまま | **そのまま動く** |

**両方を実際に走らせて確かめた。**

- **Astro**: `next/navigation`・`next/link`・`next/script` のスタブ3つだけで 1,867社ぶんを描き切り、キーエンスのページの「2,178」「35.0」「電気機器」「偏差値」まで現行と一致した
- **SvelteKit**: `buildRankedCompanies`・`buildCompanyView` といった `.ts` のロジックは**1行も変えずに `load()` から呼べた。** 描画側（`.svelte`）は全部書き起こしになる

**どちらへ行っても持ち越せるもの:**

- **Unit テスト 39ファイル。** コンポーネントを描いているものは**0件**で、全部が純粋関数に対するテストになっている
- **Tailwind と `design-system/tokens/tokens.css`。** フレームワークに依らない
- **E2E 343件。** DOM と振る舞いを見ているので React を知らない。Next.js 固有に触るのは4ファイルだけ（`cache-headers.spec.ts`・`theme.spec.ts`・`prefetch-loop.spec.ts`・`network.ts`）
- **`lib/seo/`。** `Metadata` 型に依存しているだけで、文言を作る本体（`pageMeta.ts`）は純粋関数

### SvelteKit のアダプタには、静かに壊れる分岐がある

**`wrangler.jsonc` が無いと `@sveltejs/adapter-cloudflare` は Pages モードでビルドし、`_routes.json` を吐く。** そこには「この 1,867ページでは Worker を呼ぶな」という exclude が並ぶが、**`_routes.json` には規則数の上限があり、超えたぶんは黙って捨てられる。** 実際にビルドログがこう言った。

> Cloudflare Pages Functions' includes/excludes exceeds `_routes.json` limits. **Dropping 3638 exclude rules — this will cause unnecessary function invocations.**

**捨てられた結果、全ページで Worker が起きる**——この施策が消そうとしているものが、そのまま残る。`wrangler.jsonc`（`main` ＋ `assets`）を置くと Workers Static Assets モードになり、`_routes.json` は出なくなって、事前生成したページはアセットとして返る（上の実測はこちら）。**ビルドは両方とも成功し、デプロイも通る。** 選ぶなら、この分岐に当たっていることを検証で固定すること。

### URL の形

**Astro の既定は `/about/` のようにスラッシュで終わる。** `trailingSlash: "never"` ＋ `build: { format: "file" }` で `/about`・`/company/6861` になることを実測で確認した。**SvelteKit は既定でスラッシュ無し**（`about.html`・`company/6861.html`）。**どちらも ADR-0006 の canonical をそのまま使える。**

## 選択肢

**どれも「決め」ではない。運営者が選ぶ。**

| | Worker を起こす URL | バンドル gzip | 書き直す行数 | 代償 |
| --- | ---: | ---: | ---: | --- |
| **A. 現状維持** | 3,004 | 1,876 KiB | 0 | warm 20〜24ms が 10ms 枠に乗り続ける。アクセスが増えれば #118 が戻る |
| **B. Astro へ移す** | **42** | 522 KiB | **0**（スタブ3つ） | `next/link` の待ち表示・`headers()`・`run_worker_first` を作り直す |
| **C. 自前（Vite + 素の Worker）** | 42 | 295 KiB | 0 | B に加えてルーティング・事前生成・メタデータを自前で持つ |
| **D. Next.js のまま `<a>` 遷移にし、company をアセットへ置く** | 42 | 1,876 KiB | 0 | （未測定）App Router を使いながらクライアント遷移を捨てる |
| **E. SvelteKit へ移す** | 42 | **259 KiB** | **4,778** | B の作業に加えて画面を全部書き直す。`@base-ui/react` を shadcn-svelte に置き換える |

**この表でいちばん効くのは「Worker を起こす URL」の列で、そこは B・C・D・E がすべて同じ 42 になる。** 静的アセットで返ってしまえば、そこから先はフレームワークのコードを通らない——静的アセットの cold が Astro 11.5〜12.0ms・SvelteKit 11.8〜12.6ms と揃ったのがその現れになる。**つまり「どれを選ぶか」は CPU ではなく、書き直す行数と持ち越せる資産で決まる。**

**B が有力に見える理由を3つ挙げる。ただしこれは推薦であって決定ではない。**

- **RSC を捨てても何も失わない**（H1）。いま RSC が担っているのは「JSONを読んで client component に渡す」だけで、それは Astro のページが `client:load` の島に props を渡すのと同じ形になる
- **静的アセットとの相性が問題にならない。** Issue #200 が行き止まりと書いたのは「アセットは `RSC: 1` 付きのリクエストにも `text/html` を返す」ためだったが、**Astro の遷移は素の HTML を取りに行く**ので、アセットのままで成立する
- **Astro は2026年1月に Cloudflare に入った**（[Astro is joining Cloudflare](https://blog.cloudflare.com/astro-joins-cloudflare/)・2026-01-16）。アダプタは `@cloudflare/vite-plugin` を挟み、**事前生成もアダプタ側の prerenderer で走る**（ビルドログで確認）。賭ける先としての向きは揃っている

### E（SvelteKit）をどう見るか

**バンドルは4案でいちばん小さい**（gzip 259 KiB・無料枠の 8%）。`.ts` のロジック 4,132 行はそのまま動き、Unit テスト39ファイルも E2E 343件も持ち越せる。**Svelte 5 + SvelteKit 2 + shadcn-svelte + Tailwind v4 という組み合わせは現役で、部品が足りないわけではない。**

**それでも、この施策の目的に対しては割に合わない。**

- **買えるものが B と同じ。** 目的は「Worker を起こす URL を 3,004 → 42 にする」ことで、そこは B でも E でも同じ 42 になる。**残る差はバンドル 522 KiB と 259 KiB だけで、しかもその差が効くのは `/` の cold（B の実測で 113〜141ms）1か所しかない**——他は全部アセットで、フレームワークのコードを通らない
- **払うものが 4,778 行の書き直し。** `RankingApp`・`CompanyDetail` とその下の画面、レーダーチャート・年齢別チャート・棒グラフのインライン SVG、`design-system/ui/` の10プリミティブが全部入る。**U11〜U16・C1〜C4・W1・P1・P2・S3・S4 が積み上げた表示上の判断が、書き直しのたびに落ちうる**（「1画面に1回だけ推定と書く」「値の列は `min-w-14` の固定幅」「`@container` を `<svg>` 自身に置かない」——どれも design.md に理由が書いてあるが、コードから消せば次の実装者は同じ穴を踏む）
- **画面を書き直す Unit は、この施策の「作らないもの」に真っ向から反する。** ここは「画面に出るものを1つも変えない」ことを前提に置いている。4,778 行を書き直して見た目が1ピクセルも変わらないことを保証する手段は、E2E 343件しかない
- **測っていない。** SvelteKit のプローブは画面を書き直しているので、`/` の CPU も HTML の大きさも他の3案と並べられない。**E を本気で検討するなら、まずランキング表1つを実物どおりに移植して測り直すところから**になる

**逆に E が正解になる筋もある。** 「React をやめたい」「バンドルを最小にしたい」が**それ自体として**目的なら、いま挙げた 4,778 行は代償ではなく目的の一部になる。**その場合これは `runtime` の施策ではなく、別の Intent（技術スタックの刷新）として立てるべきで、KPI も「Worker を起こす URL の数」ではなくなる。**

**C は「いちばん小さいが、いちばん自前が増える」。** 上で分解したとおりコードは 453,486 B しかなく、そこから先は自分で書く量に比例する。**そして 522 KiB と 295 KiB の差が cold にどれだけ効くかは、この調査では測れていない**——Astro の cold は `/`（481KB を描く）で 113〜141ms、自前は何も描かない `/__floor` で 8.3〜9.1ms と、同じものを測っていない。**言えるのは「どちらも現行の 358〜1,119ms より桁が小さい」までである。**

## 既知の限界

**`/` は誰がやってもサーバーで描く。** `?age=N` 8件・`?ind=X` 33件を別内容・別canonicalでインデックスさせている（ADR-0006）。**この41件をパスに変えれば `/` もアセットにできる**が、ADR-0006 を丸ごとひっくり返すことになる。**この調査では扱っていない。**

**`/` の重さはフレームワークの問題ではない**（H4）。**ADR-0013（E0・[#174](https://github.com/varmil/nenshu/issues/174)）を先に入れるほうが、`/` に対しては効く。** 順序として、E0 はこの判断を待たない。

**E（SvelteKit）は、バンドルとルーティングまでしか測っていない。** 画面を書き直したプローブなので、`/` の CPU も HTML の大きさも他の3案と並べられない。**E を選ぶ判断をするなら、ランキング表を実物どおりに1つ移植して測り直すこと。**

**測ったのは cold と warm の CPU であって、読者の体感ではない。** クライアント遷移を素の HTML 取得に替えたとき、`prefetch={false}` の代償として入れた `NavProgressBar`（`useLinkStatus`）が使えなくなる。**Astro の `astro:before-preparation` で作り直せるはずだが、確かめていない。**

**このコンテナは本番より数倍遅い。** 比だけが読める。

## 作らないもの

**画面の変更。** 出す数字も文言もレイアウトも変えない。この施策はそこに触らない。

**有料プランへの移行。** `docs/product/product.md` の「ランニングコストをゼロに保つ」を前提に置いたままにする。

**この文書での決定。** ADR も spec も overview も、移すと決めてから書く。

## 次の一歩

**運営者が A〜E を選ぶ。** 選んだら次の順で進める。

1. **ADR を書く**（ADR-0002・ADR-0004・ADR-0012 の一部を supersede する。ADR-0006 は据え置き）
2. **`docs/framework/spec.md`・`overview.md`** を書き、Unit に割って Issue を立てる
3. 見込みの分解は「`/` 以外を静的アセットへ移す」「`/` の SSR を移す」「クライアント遷移と待ち表示を移す」「ヘッダ・キャッシュ・`run_worker_first` を移す」の4つ。**割るのは決めてからにする**

## 測り方（次に測る人へ）

**バンドルは `npx wrangler deploy --dry-run` の `Total Upload` で見る。** ファイルを足し合わせた値ではなく、無料枠の 3 MiB がかかるのはこちらになる。

**cold は「`wrangler dev` を起動し直して1本目を1回だけ叩く」で測る。** 現行は 358〜1,119ms と揺れるので、**桁が違う相手と並べるときだけ読む**（`docs/runtime/cpu-budget/design.md` が「測れない」と書いたのはこの揺れのこと）。

**`wrangler dev` は workerd を2本立てる**（エントリ/プロキシと、ユーザーの Worker）。**`schedstat` は両方を足すこと**——1本だけ見ると、どちらを引いたかで数字が変わる。`docs/runtime/cpu-budget/design.md` の頃は1本だった。

**「Worker が起きたか」は CPU が床のままかで判る。** 静的アセットで返っていれば `/about` は 4ms 前後、Worker を通れば 14ms になる。ヘッダでは判らない（`x-nextjs-*` の有無は Next.js に限った手がかりでしかない）。

**比較用の Worker は `web/features/` の実物を描くこと。** `next/navigation`・`next/link`・`next/script` の3つをスタブに差し替えれば、Astro でも素の esbuild でも通る。**合成した画面で測ると、このサイトで重いもの（全社ぶんの直列化）が測定から落ちる。**

**実物を描けない候補（SvelteKit のように React が動かないもの）では、CPU と HTML の大きさを他と並べないこと。** 描いた量が違えば静的アセットの CPU もバイト数で動く。**並べてよいのはバンドルの大きさと、Worker が起きるかどうかの2つだけ。**

**`@sveltejs/adapter-cloudflare` は `wrangler.jsonc` の有無でモードが変わる。** 無ければ Pages モードで `_routes.json` を吐き、上限を超えた exclude を黙って捨てる（＝全ページで Worker が起きる）。`main` と `assets` を書いた `wrangler.jsonc` を置けば Workers Static Assets モードになる。**どちらもビルドは成功するので、`.svelte-kit/cloudflare/_routes.json` が出ていないことを見て確かめる。**
